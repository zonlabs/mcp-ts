import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import { benchmarkStrategies, createRouter, generateWrappers, resolveTool, searchTools } from "./core.js";
import { connectRemote } from "./client.js";
import {
  loadMcpJson,
  loadState,
  saveState,
  writeDefaultMcpJson,
} from "./gateway/config.js";
import { ServerManager } from "./gateway/server-manager.js";
import { LocalHttpServer } from "./gateway/local-http.js";
import { RemoteBridge } from "./gateway/bridge.js";
import { linkToRemote } from "./gateway/oauth.js";
import { pc, intro, outro, spinner, step, success, info, warn, error, panel, ticker, clearTicker } from "./ux.js";
import { Traffic } from "./traffic.js";

const HELP = `mcp-ts — explore remote MCP servers and run a local gateway

Usage:
  mcp-ts connect <url>                          Explore a remote server (REPL)
  mcp-ts search <url> <query> [--limit <count>] Search a remote tool catalog
  mcp-ts bench <url>                            Compare tool-router strategies
  mcp-ts codegen <url> --out <file>             Generate typed tool wrappers
  mcp-ts init [--dir <path>]                    Write a default mcp.json
  mcp-ts link --remote <url>                    Pair this machine with a remote gateway
  mcp-ts serve [--host h] [--port p] [--remote url] [--device-id id] [--token tok]
                                                Run the local MCP gateway daemon

Connect REPL commands:
  search <query>             Search the remote tool catalog
  schema <tool|server::tool> Show a tool's JSON schemas
  call <tool> <json>         Call a tool with a JSON object
  help                       Show REPL commands
  exit                       Disconnect and exit`;

function writeLine(output: Pick<Writable, "write">, value = ""): void {
  output.write(`${value}\n`);
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function positional(args: string[]): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index].startsWith("--")) index += 1;
    else values.push(args[index]);
  }
  return values;
}

async function printSearch(
  output: Pick<Writable, "write">,
  router: Awaited<ReturnType<typeof createRouter>>,
  query: string,
  limit = 10
): Promise<void> {
  const results = await searchTools(router, query, limit);
  if (results.length === 0) {
    writeLine(output, "No matching tools.");
    return;
  }
  results.forEach((result, index) => {
    writeLine(
      output,
      `${pc.cyan(String(index + 1))}. ${pc.bold(result.name)} (server: ${result.serverName}, ~${result.estimatedTokens} tokens)`
    );
  });
}

async function runRepl(endpoint: string, input: Readable, output: Writable): Promise<void> {
  const client = await connectRemote(endpoint);
  try {
    const router = await createRouter(client);
    const catalog = await router.listTools({ limit: Number.MAX_SAFE_INTEGER });
    writeLine(output, `Connected — ${catalog.totalCount} tools discovered`);
    writeLine(output, 'Type "help" for commands.');

    const terminal = Boolean((output as Writable & { isTTY?: boolean }).isTTY);
    const readline = createInterface({ input, output, terminal });
    try {
      while (true) {
        const line = (await readline.question("> ")).trim();
        if (!line) continue;
        const [command, ...rest] = line.split(/\s+/);
        if (command === "exit" || command === "quit") break;
        if (command === "help") {
          writeLine(output, HELP.split("Connect REPL commands:\n")[1]);
          continue;
        }
        if (command === "search") {
          await printSearch(output, router, rest.join(" "));
          continue;
        }
        if (command === "schema") {
          const tool = resolveTool(router, rest[0] ?? "");
          if (!tool) throw new Error(`Tool "${rest[0] ?? ""}" was not found`);
          writeLine(output, JSON.stringify({ inputSchema: tool.inputSchema, outputSchema: tool.outputSchema }, null, 2));
          continue;
        }
        if (command === "call") {
          const reference = rest.shift() ?? "";
          const tool = resolveTool(router, reference);
          if (!tool) throw new Error(`Tool "${reference}" was not found`);
          const parsed = JSON.parse(rest.join(" ") || "{}") as unknown;
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("Tool arguments must be a JSON object");
          }
          const args = parsed as Record<string, unknown>;
          const result = await router.callTool(tool.name, args, tool.serverId);
          writeLine(output, JSON.stringify(result, null, 2));
          continue;
        }
        writeLine(output, `Unknown command: ${command}`);
      }
    } finally {
      readline.close();
    }
  } finally {
    await client.close();
  }
}

interface ServeArgs {
  host?: string;
  port?: number;
  path?: string;
  remote?: string;
  deviceId?: string;
  token?: string;
  login?: string;
}

async function cmdInit(dir: string | undefined): Promise<void> {
  const target = dir ?? process.cwd();
  const path = writeDefaultMcpJson(target);
  success(`Wrote ${path}`);
}

async function cmdLink(
  remote: string,
  dir: string | undefined,
  loginBase: string | undefined,
): Promise<void> {
  intro("mcp-ts link");
  const cwd = dir ?? process.cwd();
  const state = loadState(cwd);

  let deviceId = state.deviceId;
  if (!deviceId) {
    deviceId = `dev_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
    saveState({ ...state, deviceId }, cwd);
    info(`Generated new device identity: ${pc.bold(deviceId)}`);
  }

  const spin = spinner();
  spin.start("Waiting for sign-in in your browser…");
  try {
    await linkToRemote(remote, deviceId, cwd, loginBase);
  } finally {
    spin.stop("Sign-in complete");
  }

  const saved = loadState(cwd);
  success(`Device: ${saved.deviceId}`);
  success(`Remote: ${saved.remote}`);
  success(
    `Token expires at: ${saved.tokenExpiresAt ? new Date(saved.tokenExpiresAt).toISOString() : "n/a"}`,
  );
  outro("Done");
}

async function cmdServe(args: ServeArgs): Promise<void> {
  intro("mcp-ts serve");
  const { config } = loadMcpJson();
  const state = loadState();

  const traffic = new Traffic({ onUpdate: () => ticker(traffic.render()) });
  const manager = new ServerManager(config.mcpServers, traffic);
  const startSpin = spinner();
  startSpin.start("Starting local MCP servers…");
  await manager.start();
  startSpin.stop("Local MCP servers started");
  if (manager.serverInfos().length === 0) {
    error("No local MCP servers could be started. Exiting.");
    await manager.close();
    process.exit(1);
  }
  success(
    `Started ${manager.serverInfos().length} local MCP server(s): ${manager
      .serverInfos()
      .map((s) => s.name)
      .join(", ")}`,
  );

  const host = args.host ?? state.host ?? "0.0.0.0";
  const port = args.port ?? state.port ?? 8787;
  const path = args.path ?? state.path ?? "/mcp";
  const localHttp = new LocalHttpServer(manager, { host, port, path }, traffic);
  let localUrl: string;
  try {
    localUrl = await localHttp.start();
  } catch (err) {
    error(
      `Could not start local endpoint on ${host}:${port}${path} — ${(err as Error).message}. Is another process using this port?`,
    );
    await manager.close();
    process.exit(1);
  }
  success(`Local MCP endpoint: ${pc.cyan(localUrl)}`);

  const remote = args.remote ?? state.remote ?? process.env.REMOTE_GATEWAY_URL;
  let deviceId = args.deviceId ?? state.deviceId ?? process.env.DEVICE_ID;
  let token = args.token ?? state.token ?? process.env.DEVICE_TOKEN;

  if (remote && !args.token) {
    const expired = !state.tokenExpiresAt || state.tokenExpiresAt <= Date.now();
    if (!token || expired) {
      if (!deviceId) {
        deviceId = `dev_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
        info(`Generated new device identity: ${pc.bold(deviceId)}`);
      }
      const signInSpin = spinner();
      signInSpin.start(`Waiting for sign-in in your browser (${remote})…`);
      try {
        const linked = await linkToRemote(remote, deviceId, undefined, args.login);
        token = linked.token;
      } finally {
        signInSpin.stop("Sign-in complete");
      }
    }
  }

  let bridge: RemoteBridge | null = null;
  if (remote && deviceId && token) {
    bridge = new RemoteBridge(manager, { remoteUrl: remote, deviceId, token, traffic });
    bridge.start();
    step(`Bridging to remote gateway: ${pc.cyan(remote)}`);
  } else {
    warn("No remote gateway configured (need --remote, --device-id, --token). Local endpoint only.");
  }

  // @clack/prompts leaves stdin in raw mode after the sign-in spinner, which
  // swallows Ctrl+C (delivers \x03 instead of firing SIGINT). Restore canonical
  // mode so the terminal's Ctrl+C reaches us, and keep a byte-level fallback so
  // shutdown also triggers when the signal never arrives.
  try {
    process.stdin.setRawMode(false);
  } catch { /* stdin is not a TTY; nothing to restore */ }

  let shuttingDown = false;
  const shutdown = async (sig: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearTicker();
    warn(`Received ${sig}, shutting down…`);
    const forceExit = setTimeout(() => {
      warn("Cleanup timed out; forcing exit.");
      process.exit(0);
    }, 3000);
    forceExit.unref?.();
    try {
      await bridge?.stop();
      await localHttp.close();
      await manager.close();
    } catch (err) {
      warn(`Cleanup error: ${(err as Error).message}`);
    } finally {
      clearTimeout(forceExit);
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  try {
    process.stdin.on("data", (chunk) => {
      if (chunk && Buffer.from(chunk).includes(0x03)) void shutdown("SIGINT");
    });
  } catch { /* stdin unavailable */ }

  panel([
    ["Local endpoint", localUrl],
    ["Servers", manager.serverInfos().map((s) => s.name).join(", ") || "none"],
    ["Device", deviceId ?? "n/a"],
    ["Remote gateway", remote ?? "none (local only)"],
    ["Status", "Running — press Ctrl+C to stop"],
  ]);
  ticker(traffic.render());
}

export async function runCli(
  args: string[],
  streams: { input: Readable; output: Writable; error: Writable } = {
    input: process.stdin,
    output: process.stdout,
    error: process.stderr
  }
): Promise<number> {
  const [command, ...commandArgs] = args;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    writeLine(streams.output, HELP);
    return 0;
  }

  try {
    if (command === "init") {
      const dir = option(commandArgs, "--dir");
      await cmdInit(dir);
      return 0;
    }
    if (command === "link") {
      const remote = option(commandArgs, "--remote");
      if (!remote) throw new Error("link requires --remote <url>");
      await cmdLink(remote, option(commandArgs, "--dir"), option(commandArgs, "--login"));
      return 0;
    }
    if (command === "serve") {
      await cmdServe({
        host: option(commandArgs, "--host"),
        port: option(commandArgs, "--port") ? Number(option(commandArgs, "--port")) : undefined,
        path: option(commandArgs, "--path"),
        remote: option(commandArgs, "--remote"),
        deviceId: option(commandArgs, "--device-id"),
        token: option(commandArgs, "--token"),
        login: option(commandArgs, "--login"),
      });
      return 0;
    }
    if (!["connect", "search", "bench", "codegen"].includes(command)) {
      throw new Error(`Unknown command: ${command}`);
    }
    const values = positional(commandArgs);
    const endpoint = values[0];
    if (!endpoint) throw new Error(`${command} requires an MCP endpoint URL`);
    if (command === "connect") {
      await runRepl(endpoint, streams.input, streams.output);
      return 0;
    }

    const searchQuery = command === "search" ? values.slice(1).join(" ") : undefined;
    const searchLimit = Number(option(commandArgs, "--limit") ?? 10);
    const codegenOut = option(commandArgs, "--out");
    if (command === "search" && !searchQuery) throw new Error("search requires a query");
    if (command === "search" && (!Number.isInteger(searchLimit) || searchLimit < 1 || searchLimit > 100)) {
      throw new Error("--limit must be an integer between 1 and 100");
    }
    if (command === "codegen" && !codegenOut) throw new Error("codegen requires --out <file>");

    const client = await connectRemote(endpoint);
    try {
      if (command === "search") {
        await printSearch(streams.output, await createRouter(client), searchQuery!, searchLimit);
        return 0;
      }
      if (command === "bench") {
        writeLine(streams.output, pc.dim("Strategy  Tools  Estimated tokens"));
        for (const result of await benchmarkStrategies(client)) {
          writeLine(streams.output, `${pc.bold(result.strategy.padEnd(8))}  ${String(result.exposedTools).padStart(5)}  ${String(result.estimatedTokens).padStart(16)}`);
        }
        return 0;
      }
      if (command === "codegen") {
        const { tools } = await client.listTools();
        const target = resolve(codegenOut!);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, generateWrappers(tools), "utf8");
        success(`Generated ${tools.length} tool wrappers in ${target}`);
        return 0;
      }
      return 0;
    } finally {
      await client.close();
    }
  } catch (error) {
    writeLine(streams.error, error instanceof Error ? error.message : String(error));
    return 1;
  }
}
