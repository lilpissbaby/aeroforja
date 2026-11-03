/**
 * Registers the AeroForja MCP server in Claude Desktop's configuration
 * (claude_desktop_config.json), keeping every other server already there.
 *
 *   pnpm mcp:install            add or update the "aeroforja" entry
 *   pnpm mcp:install --print    only print the entry, change nothing
 *
 * Config locations (Claude Desktop documentation):
 *   Windows  %APPDATA%\Claude\claude_desktop_config.json
 *   macOS    ~/Library/Application Support/Claude/claude_desktop_config.json
 *   Linux    ~/.config/Claude/claude_desktop_config.json
 *
 * Neither is where the current Windows build actually keeps it. Two things
 * we found by inspecting a real install (none of this is documented):
 *
 * - The build that also runs Cowork/Code sessions keeps its live config,
 *   mixed with its own session and preference state, at
 *   %LOCALAPPDATA%\Claude-Data\<profile>\claude_desktop_config.json
 *   (the "Editar configuración" button in Settings → Desarrollador opens
 *   this exact file). This is the one Settings → Desarrollador →
 *   "Servidores MCP locales" reads, and the one that matters.
 * - On a Microsoft Store (MSIX) install, the package's AppData is also
 *   virtualized to
 *   %LOCALAPPDATA%\Packages\Claude_<publisher id>\LocalCache\Roaming\Claude\
 *   (anthropics/claude-code issues 26073, 29100, 38830). We write there too
 *   in case some build reads it, though we have not confirmed one that does.
 *
 * Because Claude-Data's file is live app state, not a static config, write
 * it only while Claude Desktop is fully closed — otherwise the running app
 * can overwrite the entry when it next saves its own state.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, posix, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";

const FILE = "claude_desktop_config.json";
const MSIX_PACKAGE = /^Claude_[0-9a-z]+$/i;

export interface ServerEntry {
  readonly command: string;
  readonly args: readonly string[];
}

function listDirectories(dir: string): readonly string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

/** Every config file Claude Desktop may read on this computer, most specific (most likely real) first. */
export function configPaths(
  os: NodeJS.Platform = platform(),
  env: Readonly<Record<string, string | undefined>> = process.env,
  home: string = homedir(),
  listDirs: (dir: string) => readonly string[] = listDirectories,
): string[] {
  // An empty variable counts as unset: it would otherwise give a path relative to the working directory.
  const dir = (name: string): string | undefined => (env[name] === "" ? undefined : env[name]);
  if (os === "win32") {
    const appData = dir("APPDATA") ?? win32.join(home, "AppData", "Roaming");
    const localAppData = dir("LOCALAPPDATA") ?? win32.join(home, "AppData", "Local");
    const claudeData = win32.join(localAppData, "Claude-Data");
    const profiles = listDirs(claudeData).map((name) => win32.join(claudeData, name, FILE));
    const packages = win32.join(localAppData, "Packages");
    const store = listDirs(packages)
      .filter((name) => MSIX_PACKAGE.test(name))
      .map((name) => win32.join(packages, name, "LocalCache", "Roaming", "Claude", FILE));
    return [...profiles, ...store, win32.join(appData, "Claude", FILE)];
  }
  if (os === "darwin") return [posix.join(home, "Library", "Application Support", "Claude", FILE)];
  return [posix.join(dir("XDG_CONFIG_HOME") ?? posix.join(home, ".config"), "Claude", FILE)];
}

export function serverEntry(): ServerEntry {
  const server = resolve(dirname(fileURLToPath(import.meta.url)), "server.ts");
  // The node that runs this script: the same version that will run the server.
  return { command: process.execPath, args: ["--disable-warning=ExperimentalWarning", server] };
}

/**
 * Adds or replaces the "aeroforja" entry in one config file, keeping the rest
 * of it. Backs up an existing file to `<file>.bak`; throws, changing nothing,
 * if that file is not valid JSON.
 */
export function register(path: string, entry: ServerEntry): { created: boolean; backup: string | null } {
  let config: { mcpServers?: Record<string, unknown> } & Record<string, unknown> = {};
  const created = !existsSync(path);
  if (created) {
    mkdirSync(dirname(path), { recursive: true });
  } else {
    const raw = readFileSync(path, "utf8");
    try {
      config = raw.trim() === "" ? {} : (JSON.parse(raw) as typeof config);
    } catch {
      throw new Error(`${path} is not valid JSON; fix it or move it away, then run this again.`);
    }
    copyFileSync(path, `${path}.bak`);
  }
  config.mcpServers = { ...(config.mcpServers ?? {}), aeroforja: entry };
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  return { created, backup: created ? null : `${path}.bak` };
}

function main(): void {
  const entry = serverEntry();
  if (process.argv.includes("--print")) {
    process.stdout.write(`${JSON.stringify({ mcpServers: { aeroforja: entry } }, null, 2)}\n`);
    return;
  }
  const paths = configPaths();
  if (paths.length === 0) {
    process.stderr.write("No Claude Desktop config location found on this computer.\n");
    process.exit(1);
  }
  let failed = false;
  for (const path of paths) {
    try {
      const { created, backup } = register(path, entry);
      process.stdout.write(`AeroForja registered in ${path}${created ? " (new file)" : ` (backup: ${backup})`}\n`);
    } catch (error) {
      process.stderr.write(`${(error as Error).message}\n`);
      failed = true;
    }
  }
  process.stdout.write('Restart Claude Desktop completely (quit it from the tray or menu bar) and look for "aeroforja" in the connectors/tools menu.\n');
  if (failed) process.exit(1);
}

const entryFile = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (entryFile === fileURLToPath(import.meta.url)) main();
