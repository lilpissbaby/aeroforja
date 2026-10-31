/**
 * Local bridge between this server and the AeroForja web app open in a
 * browser on the same computer, so Claude's changes appear live and the
 * user's edits reach Claude.
 *
 *   GET  /state   → { revision, project }       current project (schema v3)
 *   POST /state   ← { project }                 the browser's edits (no meshes)
 *   GET  /events  → text/event-stream           "project" events with { revision, project }
 *
 * Listens on 127.0.0.1 only. CORS is open to any origin because the app can
 * be served from localhost or from the user's VPS; the Private Network
 * Access header lets an HTTPS page reach this local server in Chromium.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { parseProjectJson } from "../../app/src/model/projectFile.ts";
import type { ProjectStore } from "./project.ts";

export const DEFAULT_BRIDGE_PORT = 47615;
const MAX_BODY = 20 * 1024 * 1024;

export interface Bridge {
  readonly url: string | null;
  browsers(): number;
  close(): Promise<void>;
}

function cors(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}

export function startBridge(store: ProjectStore, port = DEFAULT_BRIDGE_PORT, log: (m: string) => void = () => {}): Promise<Bridge> {
  const clients = new Set<ServerResponse>();
  const payload = () => JSON.stringify({ revision: store.revision, project: store.toFile() });

  const unsubscribe = store.onChange((_p, _v, origin) => {
    if (origin !== "claude") return;
    const data = `event: project\ndata: ${payload()}\n\n`;
    for (const c of clients) c.write(data);
  });

  const server = createServer((req, res) => {
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
  });

  return new Promise((resolve) => {
    server.once("error", (error: NodeJS.ErrnoException) => {
      // Another Claude window already runs a bridge: tools still work, the browser follows the other one.
      log(`AeroForja bridge not started on port ${port}: ${error.code ?? error.message}`);
      unsubscribe();
      resolve({ url: null, browsers: () => 0, close: async () => {} });
    });
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const actual = typeof address === "object" && address !== null ? address.port : port;
      log(`AeroForja bridge on http://127.0.0.1:${actual}`);
      resolve({
        url: `http://127.0.0.1:${actual}`,
        browsers: () => clients.size,
        close: () =>
          new Promise<void>((done) => {
            unsubscribe();
            for (const c of clients) c.end();
            server.close(() => done());
          }),
      });
    });
  });
}
