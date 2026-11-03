/**
 * The browser bridge when several AeroForja servers run on one computer
 * (one per Claude window or linked session): the server Claude is using
 * takes the port and the browser follows it; an older server or another
 * program on the port is reported instead of fought over; a web page
 * cannot take the bridge away.
 */
import { createServer, request, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { startBridge, type Bridge } from "../src/bridge.ts";
import { ProjectStore } from "../src/project.ts";
import { handle } from "../src/server.ts";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((done) => s.listen(0, "127.0.0.1", done));
  const port = (s.address() as { port: number }).port;
  await new Promise<void>((done) => s.close(() => done()));
  return port;
}

async function serverOn(port: number, name: string, retryGapMs = 0): Promise<{ bridge: Bridge; store: ProjectStore }> {
  const store = new ProjectStore(null);
  store.set({ ...store.project, name });
  const bridge = await startBridge(store, port, () => {}, { retryGapMs });
  cleanups.push(() => bridge.close());
  return { bridge, store };
}

async function fakeServer(port: number, onRequest: (req: IncomingMessage, res: ServerResponse) => void): Promise<() => Promise<void>> {
  const s = createServer(onRequest);
  await new Promise<void>((done) => s.listen(port, "127.0.0.1", done));
  const stop = () =>
    new Promise<void>((done) => {
      s.close(() => done());
      s.closeAllConnections();
    });
  cleanups.push(stop);
  return stop;
}

/** Plain Node request without a pooled connection (servers close theirs on handover). */
function ask(port: number, method: string, path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method, path, agent: false, headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c: string) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

const designName = async (port: number) => (JSON.parse((await ask(port, "GET", "/state")).body) as { project: { name: string } }).project.name;

const callTool = (store: ProjectStore, bridge: Bridge, name: string) =>
  handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: {} } }, store, bridge);

const appStatus = async (store: ProjectStore, bridge: Bridge) => {
  const reply = await callTool(store, bridge, "app_status");
  return JSON.parse((reply!.result as { content: { text: string }[] }).content[0]!.text) as { bridge: string | null; bridgeState: string; hint: string };
};

describe("several AeroForja servers on one computer", () => {
  it("the second server waits, takes the bridge on its first tool call, and the browser is told to follow", async () => {
    const port = await freePort();
    const a = await serverOn(port, "Diseño A");
    const b = await serverOn(port, "Diseño B");
    expect(a.bridge.url).toBe(`http://127.0.0.1:${port}`);
    expect(b.bridge.url).toBeNull();
    expect(b.bridge.state()).toMatchObject({ kind: "elsewhere", reason: "started-second" });
    expect(await designName(port)).toBe("Diseño A");

    // A browser follows A.
    const events = await fetch(`http://127.0.0.1:${port}/events`);
    const reader = events.body!.getReader();
    await reader.read(); // hello

    await callTool(b.store, b.bridge, "get_design");

    let received = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      received += new TextDecoder().decode(value);
    }
    expect(received).toContain("event: handover");
    expect(b.bridge.url).toBe(`http://127.0.0.1:${port}`);
    expect(a.bridge.url).toBeNull();
    expect(a.bridge.state()).toMatchObject({ kind: "elsewhere", reason: "handed-over" });
    expect(await designName(port)).toBe("Diseño B");
    expect((await appStatus(b.store, b.bridge)).bridgeState).toBe("serving");
  });

  it("the first server takes the bridge back when Claude uses it again", async () => {
    const port = await freePort();
    const a = await serverOn(port, "Diseño A");
    const b = await serverOn(port, "Diseño B");
    await callTool(b.store, b.bridge, "get_design");
    expect(await designName(port)).toBe("Diseño B");
    await callTool(a.store, a.bridge, "get_design");
    expect(a.bridge.url).toBe(`http://127.0.0.1:${port}`);
    expect(b.bridge.url).toBeNull();
    expect(await designName(port)).toBe("Diseño A");
  });

  it("refuses a handover asked by a web page (Origin header) and keeps serving", async () => {
    const port = await freePort();
    const a = await serverOn(port, "Diseño A");
    const res = await ask(port, "POST", "/handover", { Origin: "https://example.com" });
    expect(res.status).toBe(403);
    expect(a.bridge.state().kind).toBe("serving");
    expect(await designName(port)).toBe("Diseño A");
  });

  it("reports an older AeroForja server that cannot hand over, and leaves it alone", async () => {
    const port = await freePort();
    let handoverAsked = false;
    await fakeServer(port, (req, res) => {
      if (req.url === "/handover") handoverAsked = true;
      if (req.method === "GET" && req.url === "/state") {
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ revision: 15, project: { kind: "aeroforja.project", schemaVersion: 3 } }));
        return;
      }
      res.writeHead(404).end();
    });
    const b = await serverOn(port, "Diseño B");
    expect(b.bridge.state()).toMatchObject({ kind: "legacy-server", port });
    const status = await appStatus(b.store, b.bridge);
    expect(status.bridge).toBeNull();
    expect(status.bridgeState).toBe("legacy-server");
    expect(status.hint).toMatch(/older AeroForja server/);
    expect(handoverAsked).toBe(false);
  });

  it("reports another program on the port, and takes the port once it is free", async () => {
    const port = await freePort();
    const stop = await fakeServer(port, (_req, res) => res.writeHead(404).end());
    const b = await serverOn(port, "Diseño B");
    expect(b.bridge.state()).toMatchObject({ kind: "other-program", port });
    expect((await appStatus(b.store, b.bridge)).hint).toMatch(/another program/);
    await stop();
    await callTool(b.store, b.bridge, "get_design");
    expect(b.bridge.state().kind).toBe("serving");
    expect(await designName(port)).toBe("Diseño B");
  });

  it("does not hammer a port held by another program between tool calls", async () => {
    const port = await freePort();
    let probes = 0;
    await fakeServer(port, (_req, res) => {
      probes++;
      res.writeHead(404).end();
    });
    const b = await serverOn(port, "Diseño B", 60_000);
    const afterStart = probes;
    await callTool(b.store, b.bridge, "get_design");
    await callTool(b.store, b.bridge, "get_design");
    expect(probes).toBe(afterStart);
  });
});
