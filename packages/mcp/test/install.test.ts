/**
 * Where `pnpm mcp:install` registers the server, and how it merges into a
 * config that already exists.
 *
 * The Microsoft Store (MSIX) build of Claude Desktop reads its config from
 * the package's virtualized AppData, not from %APPDATA%\Claude: writing only
 * to %APPDATA% left the server invisible to the app (anthropics/claude-code
 * issues 26073, 29100, 38830).
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { configPaths, register } from "../src/install.ts";

const FILE = "claude_desktop_config.json";
const WIN_ENV = { APPDATA: "C:\\Users\\u\\AppData\\Roaming", LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" };
const CLASSIC = `C:\\Users\\u\\AppData\\Roaming\\Claude\\${FILE}`;

describe("Claude Desktop config locations", () => {
  it("Windows, Microsoft Store install: the package's virtualized AppData first, then %APPDATA%", () => {
    const listed: string[] = [];
    const paths = configPaths("win32", WIN_ENV, "C:\\Users\\u", (dir) => {
      listed.push(dir);
      return ["Claude_pzs8sxrjxfjjc", "Microsoft.WindowsStore_8wekyb3d8bbwe", "ClaudeHelper"];
    });
    expect(listed).toEqual(["C:\\Users\\u\\AppData\\Local\\Packages"]);
    expect(paths).toEqual([`C:\\Users\\u\\AppData\\Local\\Packages\\Claude_pzs8sxrjxfjjc\\LocalCache\\Roaming\\Claude\\${FILE}`, CLASSIC]);
  });

  it("Windows, classic installer: only %APPDATA%", () => {
    expect(configPaths("win32", WIN_ENV, "C:\\Users\\u", () => [])).toEqual([CLASSIC]);
  });

  it("Windows without APPDATA or LOCALAPPDATA in the environment falls back to the home folder", () => {
    const paths = configPaths("win32", {}, "C:\\Users\\u", () => ["Claude_abc123"]);
    expect(paths).toEqual([`C:\\Users\\u\\AppData\\Local\\Packages\\Claude_abc123\\LocalCache\\Roaming\\Claude\\${FILE}`, CLASSIC]);
  });

  it("macOS and Linux keep their single documented location", () => {
    const none = () => {
      throw new Error("Packages is only listed on Windows");
    };
    expect(configPaths("darwin", {}, "/Users/u", none)).toEqual([`/Users/u/Library/Application Support/Claude/${FILE}`]);
    expect(configPaths("linux", {}, "/home/u", none)).toEqual([`/home/u/.config/Claude/${FILE}`]);
    expect(configPaths("linux", { XDG_CONFIG_HOME: "/xdg" }, "/home/u", none)).toEqual([`/xdg/Claude/${FILE}`]);
  });

  it("treats an empty variable as unset instead of writing to a relative path", () => {
    expect(configPaths("linux", { XDG_CONFIG_HOME: "" }, "/home/u", () => [])).toEqual([`/home/u/.config/Claude/${FILE}`]);
    expect(configPaths("win32", { APPDATA: "", LOCALAPPDATA: "" }, "C:\\Users\\u", () => [])).toEqual([CLASSIC]);
  });
});

describe("registering the server", () => {
  const entry = { command: "node", args: ["server.ts"] };

  it("creates the config and its folders when Claude Desktop has not written one yet", () => {
    const path = join(mkdtempSync(join(tmpdir(), "aeroforja-install-")), "LocalCache", "Roaming", "Claude", FILE);
    expect(register(path, entry)).toEqual({ created: true, backup: null });
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ mcpServers: { aeroforja: entry } });
  });

  it("keeps the other servers and settings, and backs up the previous file", () => {
    const dir = mkdtempSync(join(tmpdir(), "aeroforja-install-"));
    const path = join(dir, FILE);
    const before = `${JSON.stringify({ mcpServers: { blender: { command: "uvx", args: ["blender-mcp"] }, aeroforja: { command: "old" } }, preferences: { x: 1 } })}\n`;
    writeFileSync(path, before);
    expect(register(path, entry)).toEqual({ created: false, backup: `${path}.bak` });
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      mcpServers: { blender: { command: "uvx", args: ["blender-mcp"] }, aeroforja: entry },
      preferences: { x: 1 },
    });
    expect(readFileSync(`${path}.bak`, "utf8")).toBe(before);
  });

  it("refuses to touch a config that is not valid JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "aeroforja-install-"));
    mkdirSync(dir, { recursive: true });
    const path = join(dir, FILE);
    writeFileSync(path, "{ not json");
    expect(() => register(path, entry)).toThrow(/not valid JSON/);
    expect(readFileSync(path, "utf8")).toBe("{ not json");
    expect(existsSync(`${path}.bak`)).toBe(false);
  });
});
