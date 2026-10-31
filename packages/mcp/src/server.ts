/**
 * AeroForja MCP server for Claude Desktop (Model Context Protocol, stdio
 * transport): JSON-RPC 2.0 messages, one per line, on stdin and stdout.
 * Logs go to stderr only, as the transport requires.
 *
 * Spec: https://modelcontextprotocol.io/specification (lifecycle,
 * tools). Implemented by hand to keep the server dependency-free: it only
 * needs Node ≥ 22.18, which runs the TypeScript sources directly.
 *
 * Run: node packages/mcp/src/server.ts   (pnpm mcp:install registers it in Claude Desktop)
 */
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { DEFAULT_BRIDGE_PORT, startBridge, type Bridge } from "./bridge.ts";
import { ProjectStore } from "./project.ts";
import { INSTRUCTIONS, TOOLS, type ToolResult } from "./tools.ts";

export const SERVER_INFO = { name: "aeroforja", title: "AeroForja", version: "0.2.0" } as const;
const SUPPORTED = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

interface Request {
  readonly jsonrpc: "2.0";
  readonly id?: string | number | null;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

type Reply = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

/** Handles one message; returns the reply, or null for notifications. */
export async function handle(message: Request, store: ProjectStore, bridge: Pick<Bridge, "url" | "browsers">): Promise<Reply | null> {
  const id = message.id ?? null;
  const isNotification = message.id === undefined;
  const ok = (result: unknown): Reply => ({ jsonrpc: "2.0", id, result });
  const err = (code: number, text: string): Reply => ({ jsonrpc: "2.0", id, error: { code, message: text } });
  switch (message.method) {
    case "initialize": {
      const asked = String(message.params?.["protocolVersion"] ?? "");
      return ok({
        protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return ok({});
    case "tools/list":
      return ok({
        tools: TOOLS.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          ...(t.annotations !== undefined ? { annotations: t.annotations } : {}),
        })),
      });
    case "tools/call": {
      const name = String(message.params?.["name"] ?? "");
      const tool = TOOLS.find((t) => t.name === name);
      if (tool === undefined) return err(-32602, `Unknown tool: ${name}`);
      let result: ToolResult;
      try {
        result = await tool.run((message.params?.["arguments"] as Record<string, unknown> | undefined) ?? {}, store, bridge);
      } catch (error) {
        result = { content: [{ type: "text", text: `Error: ${(error as Error).message}` }], isError: true };
      }
      return ok(result);
    }
    default:
      return isNotification ? null : err(-32601, `Method not found: ${message.method}`);
  }
}

async function main(): Promise<void> {
  const log = (m: string) => process.stderr.write(`${m}\n`);
  const store = new ProjectStore();
  const port = Number(process.env["AEROFORJA_BRIDGE_PORT"] ?? DEFAULT_BRIDGE_PORT);
  const bridge = await startBridge(store, port, log);
  const send = (reply: Reply) => process.stdout.write(`${JSON.stringify(reply)}\n`);
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    if (line.trim() === "") return;
    let message: Request;
    try {
      message = JSON.parse(line) as Request;
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }
    void handle(message, store, bridge).then((reply) => {
      if (reply !== null) send(reply);
    });
  });
  rl.on("close", () => {
    void bridge.close().then(() => process.exit(0));
  });
}

const entry = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (entry === fileURLToPath(import.meta.url)) void main();
