/**
 * The MCP server as Claude Desktop sees it: JSON-RPC over stdio, tool list,
 * drawing, rendering and the tunnel; and the browser bridge.
 */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { afterAll, describe, expect, it } from "vitest";
import { startBridge } from "../src/bridge.ts";
import { handle } from "../src/server.ts";
import { ProjectStore } from "../src/project.ts";

const noBridge = { url: null, browsers: () => 0 };
const call = async (store: ProjectStore, name: string, args: Record<string, unknown> = {}) => {
  const reply = await handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, store, noBridge);
  return reply!.result as { content: { type: string; text?: string; data?: string; mimeType?: string }[]; isError?: boolean };
};
const textOf = (r: { content: { type: string; text?: string }[] }) => JSON.parse(r.content[0]!.text!);

describe("MCP protocol over stdio", () => {
  it("initialises, lists the tools and answers a call, one JSON message per line", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aeroforja-mcp-"));
    const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", join(import.meta.dirname, "../src/server.ts")], {
      env: { ...process.env, AEROFORJA_PROJECT: join(dir, "p.json"), AEROFORJA_BRIDGE_PORT: "0" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const lines = createInterface({ input: child.stdout });
    const replies: unknown[] = [];
    const next = () => new Promise<unknown>((resolve) => lines.once("line", (l) => resolve(JSON.parse(l))));
    const send = (m: unknown) => child.stdin.write(`${JSON.stringify(m)}\n`);
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
    replies.push(await next());
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    replies.push(await next());
    send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_design", arguments: {} } });
    replies.push(await next());
    child.stdin.end();
    const [init, list, design] = replies as { id: number; result: Record<string, unknown> }[];
    expect(init!.id).toBe(1);
    expect(init!.result["protocolVersion"]).toBe("2025-06-18");
    expect((init!.result["serverInfo"] as { name: string }).name).toBe("aeroforja");
    const names = (list!.result["tools"] as { name: string }[]).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["get_design", "add_elements", "render_views", "run_tunnel", "set_mass_components"]));
    expect(design!.id).toBe(3);
    child.kill();
  }, 20000);
});

describe("designing through the tools", () => {
  const store = new ProjectStore(null);

  it("draws a flying wing from the template, with tip fins in the perfil", async () => {
    const r = await call(store, "apply_template", { template: "wing", replace: true, params: { span_mm: 900, root_chord_mm: 260, tip_chord_mm: 140, sweep_deg: 28, fin_height_mm: 90 } });
    expect(r.isError).toBeUndefined();
    const design = textOf(await call(store, "get_design"));
    expect(design.elements.map((e: { plane: string }) => e.plane).sort()).toEqual(["side", "top"]);
    expect(design.geometry.span_mm).toBeCloseTo(900, 0);
  });

  it("adds a nose plate in mm and reports issues", async () => {
    const r = await call(store, "add_elements", {
      elements: [{ name: "Morro", role: "plate", plane: "top", shape: "polygon", points_mm: [[200, 0], [150, 30], [100, 30], [100, 0]], mirror: true, offset_mm: -5 }],
    });
    const out = textOf(r);
    expect(out.added).toHaveLength(1);
  });

  it("rejects a propeller drawn as a polygon with a message Claude can act on", async () => {
    const r = await call(store, "add_elements", { elements: [{ role: "rotor", plane: "top", shape: "polygon", points_mm: [[0, 0], [1, 0], [0, 1]] }] });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(/circle/);
  });

  it("renders the three views as a PNG", async () => {
    const r = await call(store, "render_views", { width_px: 800 });
    const image = r.content.find((c) => c.type === "image")!;
    expect(image.mimeType).toBe("image/png");
    const png = Buffer.from(image.data!, "base64");
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(800);
  });

  it("sets the mass model and runs the tunnel with provenance and validity", async () => {
    await call(store, "set_mass_components", {
      replace: true,
      components: [
        { name: "Batería 3S 1300", mass_g: 110, provenance: "ESTIMATED", position_mm: [40, 0, 0], shape: { kind: "box", size_mm: [72, 35, 25] } },
        { name: "Motor", mass_g: 35, provenance: "ESTIMATED", position_mm: [-150, 0, 0], shape: { kind: "cylinder", radius_mm: 14, length_mm: 20, axis: "x" } },
      ],
    });
    const out = textOf(await call(store, "run_tunnel", { alpha_min_deg: -2, alpha_max_deg: 8, alpha_step_deg: 2 }));
    expect(out.summary.CLalpha_per_rad).toBeGreaterThan(2);
    expect(out.provenance).toMatchObject({ lift: "CALCULATED", drag: "ESTIMATED" });
    expect(out.points.find((p: { alpha_deg: number }) => p.alpha_deg === 8).validity).toBe("amber");
  }, 20000);
});

describe("browser bridge", () => {
  const store = new ProjectStore(null);
  let close: () => Promise<void> = async () => {};
  afterAll(() => close());

  it("serves the project, takes the browser's edits and pushes Claude's", async () => {
    const bridge = await startBridge(store, 0 as number);
    close = bridge.close;
    // Port 0 picks a free port; read it back from the URL.
    expect(bridge.url).not.toBeNull();
    const base = bridge.url!;
    const state = (await (await fetch(`${base}/state`)).json()) as { revision: number; project: { kind: string } };
    expect(state.project.kind).toBe("aeroforja.project");

    const events = await fetch(`${base}/events`);
    const reader = events.body!.getReader();
    await reader.read(); // hello
    await call(store, "set_design_name", { name: "Ala de prueba" });
    let received = "";
    while (!received.includes("event: project")) received += new TextDecoder().decode((await reader.read()).value);
    expect(received).toContain("Ala de prueba");
    await reader.cancel();

    const edited = { ...store.toFile(), name: "Editado en el navegador" };
    const res = await fetch(`${base}/state`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project: edited }) });
    expect(res.status).toBe(200);
    expect(store.project.name).toBe("Editado en el navegador");
  });
});
