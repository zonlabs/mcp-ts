import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadMcpJson,
  loadState,
  saveState,
  stateFilePath,
  writeDefaultMcpJson,
} from "./config.js";
import { ServerManager } from "./server-manager.js";
import { LocalHttpServer } from "./local-http.js";
import { RemoteBridge } from "./bridge.js";
import { linkToRemote } from "./oauth.js";

const VERSION = "0.1.0";

function printUsage(): void {
  console.log(`mcp-gateway v${VERSION}
Usage:
  mcp-gateway init [--dir <path>]        Write a default mcp.json
  mcp-gateway link --remote <url> [--login <login-app-url>]
                                         Pair this machine with a remote gateway
                                         (opens browser for Supabase sign-in)
  mcp-gateway run [--host h] [--port p] [--remote url] [--device-id id] [--token tok]
                                         Start the daemon (local MCP + remote bridge)
`);
}

interface RunArgs {
  host?: string;
  port?: number;
  path?: string;
  remote?: string;
  deviceId?: string;
  token?: string;
  login?: string;
}

function parseArgs(argv: string[], flags: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (flags.includes(argv[i]) && argv[i + 1] !== undefined) {
      out[argv[i]] = argv[++i];
    }
  }
  return out;
}

async function cmdRun(args: RunArgs): Promise<void> {
  const { config } = loadMcpJson();
  const state = loadState();

  const manager = new ServerManager(config.mcpServers);
  await manager.start();
  if (manager.serverInfos().length === 0) {
    console.error("No local MCP servers could be started. Exiting.");
    await manager.close();
    process.exit(1);
  }
  console.log(
    `Started ${manager.serverInfos().length} local MCP server(s): ${manager
      .serverInfos()
      .map((s) => s.name)
      .join(", ")}`,
  );

  const host = args.host ?? state.host ?? "0.0.0.0";
  const port = args.port ?? state.port ?? 8787;
  const path = args.path ?? state.path ?? "/mcp";
  const localHttp = new LocalHttpServer(manager, { host, port, path });
  const localUrl = await localHttp.start();
  console.log(`Local MCP endpoint: ${localUrl}`);

  const remote = args.remote ?? state.remote ?? process.env.REMOTE_GATEWAY_URL;
  let deviceId = args.deviceId ?? state.deviceId ?? process.env.DEVICE_ID;
  let token = args.token ?? state.token ?? process.env.DEVICE_TOKEN;

  // Auto-link: if a remote is configured but we have no valid token, open the
  // browser sign-in flow (Supabase) before bridging. Explicit --token overrides.
  if (remote && !args.token) {
    const expired = !state.tokenExpiresAt || state.tokenExpiresAt <= Date.now();
    if (!token || expired) {
      if (!deviceId) {
        deviceId = `dev_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
        console.log(`Generated new device identity: ${deviceId}`);
      }
      console.log(`No valid device token found; starting sign-in for ${remote}…`);
      const linked = await linkToRemote(remote, deviceId, undefined, args.login);
      token = linked.token;
      deviceId = deviceId;
    }
  }

  let bridge: RemoteBridge | null = null;
  if (remote && deviceId && token) {
    bridge = new RemoteBridge(manager, { remoteUrl: remote, deviceId, token });
    bridge.start();
    console.log(`Bridging to remote gateway: ${remote}`);
  } else {
    console.log(
      "No remote gateway configured (need --remote, --device-id, --token). Local endpoint only.",
    );
  }

  const shutdown = async (sig: string) => {
    console.log(`\nReceived ${sig}, shutting down…`);
    await bridge?.stop();
    await localHttp.close();
    await manager.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  console.log("Running. Press Ctrl+C to stop.");
}

async function cmdInit(dir: string | undefined): Promise<void> {
  const target = dir ?? process.cwd();
  const path = writeDefaultMcpJson(target);
  console.log(`Wrote ${path}`);
}

async function cmdLink(
  remote: string,
  dir: string | undefined,
  loginBase: string | undefined,
): Promise<void> {
  const cwd = dir ?? process.cwd();
  const state = loadState(cwd);

  let deviceId = state.deviceId;
  if (!deviceId) {
    deviceId = `dev_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
    saveState({ ...state, deviceId }, cwd);
    console.log(`Generated new device identity: ${deviceId}`);
  }

  // Browser sign-in against the login app (Supabase identity, same as mcp-client).
  await linkToRemote(remote, deviceId, cwd, loginBase);
  const saved = loadState(cwd);
  console.log(`Device: ${saved.deviceId}`);
  console.log(`Remote: ${saved.remote}`);
  console.log(`Token expires at: ${saved.tokenExpiresAt ? new Date(saved.tokenExpiresAt).toISOString() : "n/a"}`);
  console.log(`State saved to: ${stateFilePath(cwd)}`);
}

export async function main(argv: string[]): Promise<void> {
  const cmd = argv[0];
  const rest = argv.slice(1);
  switch (cmd) {
    case "--help":
    case "-h":
    case undefined:
      printUsage();
      break;
    case "--version":
    case "-v":
      console.log(VERSION);
      break;
    case "init": {
      const parsed = parseArgs(rest, ["--dir"]);
      await cmdInit(parsed["--dir"]);
      break;
    }
    case "link": {
      const parsed = parseArgs(rest, ["--remote", "--dir", "--login"]);
      const remote = parsed["--remote"];
      if (!remote) {
        console.error("link requires --remote <url>");
        process.exit(1);
      }
      await cmdLink(remote, parsed["--dir"], parsed["--login"]);
      break;
    }
    case "run": {
      const parsed = parseArgs(rest, [
        "--host",
        "--port",
        "--path",
        "--remote",
        "--device-id",
        "--token",
        "--login",
      ]);
      await cmdRun({
        host: parsed["--host"],
        port: parsed["--port"] ? Number(parsed["--port"]) : undefined,
        path: parsed["--path"],
        remote: parsed["--remote"],
        deviceId: parsed["--device-id"],
        token: parsed["--token"],
        login: parsed["--login"],
      });
      break;
    }
    default:
      console.error(`Unknown command: ${cmd}`);
      printUsage();
      process.exit(1);
  }
}

const isEntry =
  process.argv[1] != null &&
  fileURLToPath(import.meta.url).toLowerCase() ===
    process.argv[1].toLowerCase();
if (isEntry) {
  void main(process.argv.slice(2));
}
