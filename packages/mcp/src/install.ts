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
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function configPath(): string {
  if (platform() === "win32") return join(process.env["APPDATA"] ?? join(homedir(), "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  return join(process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config"), "Claude", "claude_desktop_config.json");
}

export function serverEntry() {
  const server = resolve(dirname(fileURLToPath(import.meta.url)), "server.ts");
  // The node that runs this script: the same version that will run the server.
  return { command: process.execPath, args: ["--disable-warning=ExperimentalWarning", server] };
}

function main(): void {
  const entry = serverEntry();
  if (process.argv.includes("--print")) {
    process.stdout.write(`${JSON.stringify({ mcpServers: { aeroforja: entry } }, null, 2)}\n`);
    return;
  }
  const path = configPath();
  let config: { mcpServers?: Record<string, unknown> } & Record<string, unknown> = {};
  if (existsSync(path)) {
    const raw = readFileSync(path, "utf8");
    try {
      config = raw.trim() === "" ? {} : (JSON.parse(raw) as typeof config);
    } catch {
      process.stderr.write(`${path} is not valid JSON; fix it or move it away, then run this again.\n`);
      process.exit(1);
    }
    copyFileSync(path, `${path}.bak`);
  } else {
    mkdirSync(dirname(path), { recursive: true });
  }
  config.mcpServers = { ...(config.mcpServers ?? {}), aeroforja: entry };
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  process.stdout.write(
    `AeroForja registered in ${path}${existsSync(`${path}.bak`) ? ` (backup: ${path}.bak)` : ""}.\nRestart Claude Desktop completely (quit it from the tray or menu bar) and look for "aeroforja" in the connectors/tools menu.\n`,
  );
}

const entryFile = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (entryFile === fileURLToPath(import.meta.url)) main();
