/**
 * Local bridge between this server and the AeroForja web app open in a
 * browser on the same computer, so Claude's changes appear live and the
 * user's edits reach Claude.
 *
 *   GET  /state     → { revision, project }        current project (schema v3)
 *   POST /state     ← { project }                  the browser's edits (no meshes)
 *   GET  /events    → text/event-stream            "project" events with { revision, project };
 *                                                  "handover" when another server takes the bridge
 *   GET  /bridge    → { service, handover, pid }   lets another AeroForja server recognise this one
 *   POST /handover                                 another AeroForja server on this computer takes the port
 *
 * One port, several servers: every Claude window or linked session starts
 * its own server, and only one of them can listen on the port the app
 * knows. The server Claude is using takes the port before each tool call
 * (ensure): if another AeroForja server holds it, it asks for it with
 * /handover, and the browser, told by a "handover" event, reconnects to the
 * new one. So the app always shows the design of the Claude that is working.
 * A port held by an older AeroForja server (no /handover) or by another
 * program is reported by state(), never fought over.
 *
 * Listens on 127.0.0.1 only. CORS is open to any origin because the app can
 * be served from localhost or from the user's VPS; the Private Network
 * Access header lets an HTTPS page reach this local server in Chromium.
 * /handover refuses every request that carries an Origin header: browsers
 * always send one on a POST and Node's http client does not, so a web page
 * cannot take the bridge away.
 */
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { parseProjectJson } from "../../app/src/model/projectFile.ts";
import type { ProjectStore } from "./project.ts";

export const DEFAULT_BRIDGE_PORT = 47615;
export const BRIDGE_SERVICE = "aeroforja-bridge";
const MAX_BODY = 20 * 1024 * 1024;
const PROBE_TIMEOUT_MS = 1500;
/** After a handover the old server needs a moment to release the port. */
const TAKEOVER_ATTEMPTS = 40;
const TAKEOVER_WAIT_MS = 50;

export type BridgeState =
  | { readonly kind: "serving"; readonly url: string }
  /** Another AeroForja server holds the port and can hand it over: the next tool call takes it. */
  | { readonly kind: "elsewhere"; readonly port: number; readonly reason: "started-second" | "handed-over" | "takeover-failed" }
  /** An older AeroForja server holds the port and cannot hand it over. */
  | { readonly kind: "legacy-server"; readonly port: number }
  /** Some other program uses the port. */
  | { readonly kind: "other-program"; readonly port: number; readonly detail: string }
  | { readonly kind: "closed" };

export interface Bridge {
  /** Where the app reaches this server, or null while another process holds the port. */
  readonly url: string | null;
  browsers(): number;
  state(): BridgeState;
  /** Takes the port if it is free or held by another AeroForja server. Never throws. */
  ensure(): Promise<void>;
  close(): Promise<void>;
}

export interface BridgeOptions {
  /** Minimum time between two attempts on a port held by an older server or another program (ms). */
  readonly retryGapMs?: number;
}

type LocalAnswer = { readonly status: number; readonly body: string } | { readonly error: string };

function cors(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** A request to whatever listens on the port, from Node: no Origin header, no pooled connection. */
function localRequest(port: number, method: "GET" | "POST", path: string): Promise<LocalAnswer> {
  return new Promise((resolve) => {
    const req = request({ host: "127.0.0.1", port, method, path, agent: false, headers: { Connection: "close" }, timeout: PROBE_TIMEOUT_MS }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      res.on("error", (error: NodeJS.ErrnoException) => resolve({ error: error.code ?? error.message }));
    });
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    req.on("error", (error: NodeJS.ErrnoException) => resolve({ error: error.code ?? error.message }));
    req.end();
  });
}

type Holder = { readonly kind: "free" } | { readonly kind: "aeroforja" } | { readonly kind: "legacy" } | { readonly kind: "other"; readonly detail: string };

/** Who listens on the port: an AeroForja server that hands over, an older one, something else, or nobody. */
async function whoHolds(port: number): Promise<Holder> {
  const info = await localRequest(port, "GET", "/bridge");
  if ("error" in info) return info.error === "ECONNREFUSED" ? { kind: "free" } : { kind: "other", detail: info.error };
  const described = parseJson(info.body) as { service?: unknown } | null;
  if (info.status === 200 && described?.service === BRIDGE_SERVICE) return { kind: "aeroforja" };
  const state = await localRequest(port, "GET", "/state");
  if (!("error" in state) && state.status === 200) {
    const s = parseJson(state.body) as { revision?: unknown; project?: { kind?: unknown } } | null;
    if (typeof s?.revision === "number" && s.project?.kind === "aeroforja.project") return { kind: "legacy" };
  }
  return { kind: "other", detail: `HTTP ${info.status} on /bridge` };
}

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

export async function startBridge(
  store: ProjectStore,
  port = DEFAULT_BRIDGE_PORT,
  log: (m: string) => void = () => {},
  options: BridgeOptions = {},
): Promise<Bridge> {
  const retryGapMs = options.retryGapMs ?? 2000;
  const clients = new Set<ServerResponse>();
  let server: Server | null = null;
  let current: BridgeState = { kind: "closed" };
  let lastAttempt = 0;
  let inFlight: Promise<void> | null = null;
  let closed = false;

  const payload = () => JSON.stringify({ revision: store.revision, project: store.toFile() });
  const broadcast = (event: string, data: string) => {
    for (const c of clients) c.write(`event: ${event}\ndata: ${data}\n\n`);
  };

  const unsubscribe = store.onChange((_p, _v, origin) => {
    if (origin === "claude") broadcast("project", payload());
  });

  /** Stops listening and drops the browsers; the project stays in memory. */
  const release = (tellBrowsers: boolean): Promise<void> => {
    const s = server;
    server = null;
    if (s === null) return Promise.resolve();
    if (tellBrowsers) broadcast("handover", JSON.stringify({ revision: store.revision }));
    for (const c of clients) c.end();
    clients.clear();
    return new Promise((done) => {
      s.close(() => done());
      s.closeAllConnections();
    });
  };

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    cors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/state") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(payload());
      return;
    }
    if (req.method === "GET" && url.pathname === "/bridge") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ service: BRIDGE_SERVICE, handover: true, pid: process.pid, revision: store.revision }));
      return;
    }
    if (req.method === "POST" && url.pathname === "/handover") {
      if (req.headers.origin !== undefined) {
        res.writeHead(403, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Only another AeroForja server on this computer can take the bridge." }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ service: BRIDGE_SERVICE, released: true }), () => {
        current = { kind: "elsewhere", port, reason: "handed-over" };
        log(`AeroForja bridge handed over to another AeroForja server on port ${port}`);
        void release(true);
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      res.write(`event: hello\ndata: ${JSON.stringify({ revision: store.revision })}\n\n`);
      clients.add(res);
      const ping = setInterval(() => res.write(": ping\n\n"), 25000);
      req.on("close", () => {
        clearInterval(ping);
        clients.delete(res);
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/state") {
      let size = 0;
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_BODY) req.destroy();
        else chunks.push(c);
      });
      req.on("end", () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { project?: unknown };
          const parsed = parseProjectJson(body.project, store.project.name);
          if (!parsed.ok) {
            res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: parsed.message }));
            return;
          }
          const revision = store.set({ name: parsed.name, model: parsed.model, planform: parsed.planform, parts: parsed.parts }, "browser");
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ revision }));
        } catch (error) {
          res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: (error as Error).message }));
        }
      });
      return;
    }
    res.writeHead(404).end();
  };

  /** Tries to listen once; null on success, else the error code. */
  const listen = (): Promise<string | null> =>
    new Promise((resolve) => {
      const s = createServer(handler);
      const onError = (error: NodeJS.ErrnoException) => resolve(error.code ?? error.message);
      s.once("error", onError);
      s.listen(port, "127.0.0.1", () => {
        s.off("error", onError);
        s.on("error", (error) => log(`AeroForja bridge error: ${error.message}`));
        server = s;
        const address = s.address();
        const actual = typeof address === "object" && address !== null ? address.port : port;
        current = { kind: "serving", url: `http://127.0.0.1:${actual}` };
        log(`AeroForja bridge on ${current.url}`);
        resolve(null);
      });
    });

  const acquire = async (takeOver: boolean): Promise<void> => {
    if (closed || server !== null) return;
    lastAttempt = Date.now();
    const first = await listen();
    if (first === null) return;
    if (first !== "EADDRINUSE") {
      current = { kind: "other-program", port, detail: first };
      log(`AeroForja bridge not started on port ${port}: ${first}`);
      return;
    }
    const holder = await whoHolds(port);
    if (holder.kind === "free") {
      // Released between our attempt and the probe.
      if ((await listen()) === null) return;
      current = { kind: "other-program", port, detail: "EADDRINUSE" };
      return;
    }
    if (holder.kind === "legacy") {
      current = { kind: "legacy-server", port };
      log(`AeroForja bridge not started: an older AeroForja server holds port ${port} and cannot hand it over`);
      return;
    }
    if (holder.kind === "other") {
      current = { kind: "other-program", port, detail: holder.detail };
      log(`AeroForja bridge not started: another program uses port ${port} (${holder.detail})`);
      return;
    }
    if (!takeOver) {
      current = { kind: "elsewhere", port, reason: "started-second" };
      log(`AeroForja bridge on port ${port} belongs to another AeroForja server; this one takes it on its first tool call`);
      return;
    }
    const answer = await localRequest(port, "POST", "/handover");
    if ("error" in answer || answer.status !== 200) {
      current = { kind: "elsewhere", port, reason: "takeover-failed" };
      log(`AeroForja bridge handover refused on port ${port}: ${"error" in answer ? answer.error : `HTTP ${answer.status}`}`);
      return;
    }
    for (let i = 0; i < TAKEOVER_ATTEMPTS; i++) {
      if ((await listen()) === null) {
        log(`AeroForja bridge taken over from another AeroForja server on port ${port}`);
        return;
      }
      await sleep(TAKEOVER_WAIT_MS);
    }
    current = { kind: "elsewhere", port, reason: "takeover-failed" };
  };

  const ensure = (): Promise<void> => {
    if (closed || server !== null) return Promise.resolve();
    if (inFlight !== null) return inFlight;
    // An AeroForja server that hands over is asked at once; anything else is not hammered.
    if (current.kind !== "elsewhere" && Date.now() - lastAttempt < retryGapMs) return Promise.resolve();
    inFlight = acquire(true)
      .catch((error: Error) => log(`AeroForja bridge: ${error.message}`))
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  await acquire(false);

  return {
    get url() {
      return current.kind === "serving" ? current.url : null;
    },
    browsers: () => clients.size,
    state: () => current,
    ensure,
    close: async () => {
      closed = true;
      unsubscribe();
      await release(false);
      current = { kind: "closed" };
    },
  };
}
