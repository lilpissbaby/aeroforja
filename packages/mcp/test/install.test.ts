/**
 * Where `pnpm mcp:install` registers the server, and how it merges into a
 * config that already exists.
 *
 * The real location on Windows, found by inspecting an actual install (none
 * of this is documented): the build that also runs Cowork/Code sessions
 * keeps its live claude_desktop_config.json under
 * %LOCALAPPDATA%\Claude-Data\<profile>\, mixed with its own session state —
 * confirmed because Settings → Desarrollador → "Editar configuración" opens
 * exactly that file, and its mcpServers matches what that screen lists.
 * %APPDATA%\Claude (the documented path) and the Microsoft Store's
 * virtualized Packages path (anthropics/claude-code issues 26073, 29100,
 * 38830) are written too as fallbacks, since we have not seen a build that
 * reads either on this computer.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { configPaths, register } from "../src/install.ts";

const FILE = "claude_desktop_config.json";
const WIN_ENV = { APPDATA: "C:\\Users\\u\\AppData\\Roaming", LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" };
const CLASSIC = `C:\\Users\\u\\AppData\\Roaming\\Claude\\${FILE}`;
/** listDirs stub: Claude-Data has `profiles`, Packages has `packages`. */
const dirs = (profiles: string[], packages: string[] = []) => (dir: string) => {
  if (dir === "C:\\Users\\u\\AppData\\Local\\Claude-Data") return profiles;
  if (dir === "C:\\Users\\u\\AppData\\Local\\Packages") return packages;
  throw new Error(`unexpected directory listed: ${dir}`);
};

describe("Claude Desktop config locations", () => {
  it("Windows: every Claude-Data profile first, then a Microsoft Store package, then %APPDATA%", () => {
    const paths = configPaths("win32", WIN_ENV, "C:\\Users\\u", dirs(["claude_pzs8sxrjxfjjc"], ["Claude_pzs8sxrjxfjjc", "Microsoft.WindowsStore_8wekyb3d8bbwe"]));
    expect(paths).toEqual([
      `C:\\Users\\u\\AppData\\Local\\Claude-Data\\claude_pzs8sxrjxfjjc\\${FILE}`,
      `C:\\Users\\u\\AppData\\Local\\Packages\\Claude_pzs8sxrjxfjjc\\LocalCache\\Roaming\\Claude\\${FILE}`,
      CLASSIC,
    ]);
  });

  it("lists every Claude-Data profile found, unfiltered by name", () => {
    const paths = configPaths("win32", WIN_ENV, "C:\\Users\\u", dirs(["default", "work"]));
    expect(paths).toEqual([
      `C:\\Users\\u\\AppData\\Local\\Claude-Data\\default\\${FILE}`,
      `C:\\Users\\u\\AppData\\Local\\Claude-Data\\work\\${FILE}`,
      CLASSIC,
    ]);
  });

  it("Windows, classic installer: only %APPDATA%, when neither Claude-Data nor a Store package exists", () => {
    expect(configPaths("win32", WIN_ENV, "C:\\Users\\u", dirs([]))).toEqual([CLASSIC]);
  });

  it("Windows without APPDATA or LOCALAPPDATA in the environment falls back to the home folder", () => {
    const paths = configPaths("win32", {}, "C:\\Users\\u", dirs(["claude_abc123"]));
    expect(paths).toEqual([`C:\\Users\\u\\AppData\\Local\\Claude-Data\\claude_abc123\\${FILE}`, CLASSIC]);
  });

  it("treats an empty variable as unset instead of writing to a relative path", () => {
    expect(configPaths("win32", { APPDATA: "", LOCALAPPDATA: "" }, "C:\\Users\\u", dirs([]))).toEqual([CLASSIC]);
  });

  it("macOS and Linux keep their single documented location", () => {
    const none = () => {
      throw new Error("directory listing is only used on Windows");
    };
    expect(configPaths("darwin", {}, "/Users/u", none)).toEqual([`/Users/u/Library/Application Support/Claude/${FILE}`]);
    expect(configPaths("linux", {}, "/home/u", none)).toEqual([`/home/u/.config/Claude/${FILE}`]);
    expect(configPaths("linux", { XDG_CONFIG_HOME: "/xdg" }, "/home/u", none)).toEqual([`/xdg/Claude/${FILE}`]);
    expect(configPaths("linux", { XDG_CONFIG_HOME: "" }, "/home/u", none)).toEqual([`/home/u/.config/Claude/${FILE}`]);
  });
});

describe("registering the server", () => {
  const entry = { command: "node", args: ["server.ts"] };

  it("creates the config and its folders when Claude Desktop has not written one yet", () => {
    const path = join(mkdtempSync(join(tmpdir(), "aeroforja-install-")), "Claude-Data", "default", FILE);
    expect(register(path, entry)).toEqual({ created: true, backup: null });
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ mcpServers: { aeroforja: entry } });
  });

  it("keeps the other servers and the app's own live state, and backs up the previous file", () => {
    const dir = mkdtempSync(join(tmpdir(), "aeroforja-install-"));
    const path = join(dir, FILE);
    const before = `${JSON.stringify({
      mcpServers: { blender: { command: "uvx", args: ["blender-mcp"] } },
      coworkUserFilesPath: "C:\\Users\\u\\Claude",
      preferences: { sidebarMode: "chat" },
    })}\n`;
    writeFileSync(path, before);
    expect(register(path, entry)).toEqual({ created: false, backup: `${path}.bak` });
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      mcpServers: { blender: { command: "uvx", args: ["blender-mcp"] }, aeroforja: entry },
      coworkUserFilesPath: "C:\\Users\\u\\Claude",
      preferences: { sidebarMode: "chat" },
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
