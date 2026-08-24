import type { Readable, Writable } from "node:stream";
import { CLI_VERSION, printBanner, renderBanner } from "./ux.js";
import { cmdInit } from "./commands/init.js";
import { cmdLogin } from "./commands/login.js";
import { cmdLogout } from "./commands/logout.js";
import { cmdCall } from "./commands/call.js";
import { cmdList } from "./commands/list.js";
import { cmdLocalSchema } from "./commands/schema.js";
import { cmdSearch } from "./commands/search.js";
import { cmdServe } from "./commands/serve.js";
import { cmdDaemon } from "./commands/daemon.js";
import { cmdConnect } from "./commands/connect.js";
import { cmdDisconnect } from "./commands/disconnect.js";
import { cmdEnable, cmdDisable } from "./commands/toggle.js";
import { cmdBench } from "./commands/bench.js";
import { cmdCodegen } from "./commands/codegen.js";
import type { LocalMcpDiscoveryMode } from "./gateway/local-http-mcp.js";
import { setupDaemonLogging } from "./gateway/daemon.js";
import { DEFAULT_REMOTE_GATEWAY_URL } from "./constants.js";

const HELP = `${renderBanner()}
Usage:
  mcpa serve [--host h] [--port p] [--mode <all|search>] [--detached] [--verbose]
                                                Run the local MCP gateway
  mcpa daemon <start|stop|status|logs>          Manage persistent background daemon
  mcpa call <tool> [jsonArgs]                   Execute an MCP tool through the gateway
  mcpa search [url] <query> [--limit <count>]   Search local or remote tool catalog
  mcpa schema <tool...>                         Inspect tool JSON schemas
  mcpa list [server] [--tools]                  List configured MCP servers (or tools)
  mcpa connect [name] [url] [--auth <token>]    Test & register a remote/local MCP server
  mcpa disconnect <name>                        Remove a server from mcp.json (aliases: remove, rm)
  mcpa enable <name>                            Enable a disabled MCP server in mcp.json
  mcpa disable <name>                           Disable an MCP server in mcp.json
  mcpa login [--remote <url>]                   Sign in to the remote gateway
  mcpa logout [--remote <url>]                  Revoke the saved CLI session
  mcpa init [--dir <path>]                      Write a default mcp.json
  mcpa bench <url>                              Compare tool-router strategies
  mcpa codegen <url> --out <file>               Generate typed tool wrappers

Flags:
  -v, --version                                 Show CLI version
  -h, --help                                    Show help information
  -d, --detached                                Run server as a detached background daemon
  --verbose                                     Show verbose child process chatter
  --mode <all|search>                           Gateway tool discovery mode (default: search)
  --name <name>                                 Server name for connect
  --url <url>                                   Remote endpoint URL for connect
  --auth <token>                                Bearer token authentication
  --header <key=value>                          Custom HTTP headers
  --no-save                                     Test connection without saving to mcp.json`;

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

function isUrl(str: string): boolean {
  return str.startsWith("http://") || str.startsWith("https://");
}

export function parseDiscoveryMode(value?: string): LocalMcpDiscoveryMode | undefined {
  if (value === undefined || value === "search" || value === "all") return value;
  throw new Error('--mode must be "search" or "all"');
}

export async function runCli(
  args: string[],
  streams: { input: Readable; output: Writable; error: Writable } = {
    input: process.stdin,
    output: process.stdout,
    error: process.stderr,
  },
): Promise<number> {
  setupDaemonLogging();

  const [command, ...commandArgs] = args;
  if (command === "-v" || command === "--version" || command === "version") {
    writeLine(streams.output, `@mcp-ts/cli v${CLI_VERSION}`);
    return 0;
  }
  if (!command || command === "help" || command === "--help" || command === "-h") {
    writeLine(streams.output, HELP);
    return 0;
  }

  const verbose = args.includes("--verbose");
  const dir = option(commandArgs, "--dir");
  const mode = parseDiscoveryMode(option(commandArgs, "--mode"));

  try {
    if (command === "init") {
      await cmdInit(dir);
      return 0;
    }

    if (command === "login") {
      const remote = option(commandArgs, "--remote") ?? process.env.REMOTE_GATEWAY_URL ?? DEFAULT_REMOTE_GATEWAY_URL;
      await cmdLogin(remote, option(commandArgs, "--login"));
      return 0;
    }

    if (command === "logout") {
      const remote = option(commandArgs, "--remote") ?? process.env.REMOTE_GATEWAY_URL ?? DEFAULT_REMOTE_GATEWAY_URL;
      await cmdLogout(remote);
      return 0;
    }

    if (command === "call") {
      const values = positional(commandArgs);
      const toolName = values[0];
      if (!toolName) throw new Error("call requires a tool name (e.g. mcpa call <tool> [jsonArgs])");
      const rawArgs = values.slice(1).join(" ") || undefined;
      await cmdCall(toolName, rawArgs, dir, streams.output);
      return 0;
    }

    if (command === "list" || command === "servers") {
      const values = positional(commandArgs);
      const serverName = values[0];
      const showTools = commandArgs.includes("--tools") || commandArgs.includes("-t");
      await cmdList(dir, streams.output, { showTools, serverName });
      return 0;
    }

    if (command === "schema") {
      const values = positional(commandArgs);
      if (values.length === 0) throw new Error("schema requires one or more tool names (e.g. mcpa schema <tool1> [tool2...])");
      await cmdLocalSchema(values, dir, streams.output);
      return 0;
    }

    if (command === "daemon") {
      const values = positional(commandArgs);
      const action = values[0] || "status";
      await cmdDaemon(
        action,
        {
          port: option(commandArgs, "--port") ? Number(option(commandArgs, "--port")) : undefined,
          verbose,
          lines: (option(commandArgs, "--lines") ?? option(commandArgs, "--limit") ?? option(commandArgs, "-n"))
            ? Number(option(commandArgs, "--lines") ?? option(commandArgs, "--limit") ?? option(commandArgs, "-n"))
            : undefined,
        },
        streams.output,
      );
      return 0;
    }

    if (command === "serve") {
      const detached = args.includes("-d") || args.includes("--detached");
      await cmdServe({
        host: option(commandArgs, "--host"),
        port: option(commandArgs, "--port") ? Number(option(commandArgs, "--port")) : undefined,
        path: option(commandArgs, "--path"),
        remote: option(commandArgs, "--remote"),
        login: option(commandArgs, "--login"),
        mode,
        verbose,
        detached,
      });
      return 0;
    }

    if (command === "search") {
      const values = positional(commandArgs);
      if (values.length === 0) throw new Error("search requires a query (e.g. mcpa search <query> or mcpa search <url> <query>)");
      const searchLimit = Number(option(commandArgs, "--limit") ?? 10);
      if (!Number.isInteger(searchLimit) || searchLimit < 1 || searchLimit > 100) {
        throw new Error("--limit must be an integer between 1 and 100");
      }

      let endpoint: string | undefined;
      let searchQuery: string;
      if (isUrl(values[0])) {
        endpoint = values[0];
        searchQuery = values.slice(1).join(" ");
        if (!searchQuery) throw new Error("search with a URL requires a query string");
      } else {
        searchQuery = values.join(" ");
      }

      await cmdSearch(searchQuery, searchLimit, endpoint ? { endpoint } : undefined, streams.output);
      return 0;
    }

    if (command === "connect" || command === "add") {
      const values = positional(commandArgs);
      const name = option(commandArgs, "--name") ?? (values[0] && !isUrl(values[0]) ? values[0] : undefined);
      const url = option(commandArgs, "--url") ?? (values.find(isUrl) ?? (values[1] && isUrl(values[1]) ? values[1] : undefined));
      const commandName = option(commandArgs, "--command");
      const cmdArgsStr = option(commandArgs, "--args");
      const cmdArgs = cmdArgsStr ? cmdArgsStr.split(/\s+/) : undefined;
      const auth = option(commandArgs, "--auth");
      const save = !commandArgs.includes("--no-save");

      const headers: Record<string, string> = {};
      for (let i = 0; i < commandArgs.length; i++) {
        if (commandArgs[i] === "--header" && commandArgs[i + 1]) {
          const headerPair = commandArgs[i + 1];
          const colonIdx = headerPair.indexOf("=");
          const splitIdx = colonIdx !== -1 ? colonIdx : headerPair.indexOf(":");
          if (splitIdx !== -1) {
            const k = headerPair.slice(0, splitIdx).trim();
            const v = headerPair.slice(splitIdx + 1).trim();
            if (k && v) headers[k] = v;
          }
        }
      }

      await cmdConnect(
        { name, url, command: commandName, args: cmdArgs },
        { name, url, command: commandName, args: cmdArgs, headers, auth, dir, save },
        streams.output,
      );
      return 0;
    }

    if (command === "disconnect" || command === "remove" || command === "rm") {
      const values = positional(commandArgs);
      const name = option(commandArgs, "--name") ?? values[0];
      if (!name) {
        throw new Error("disconnect requires a server name (e.g. mcpa disconnect <name> or mcpa remove <name>)");
      }
      await cmdDisconnect(name, dir, streams.output);
      return 0;
    }

    if (command === "enable") {
      const values = positional(commandArgs);
      const name = option(commandArgs, "--name") ?? values[0];
      if (!name) {
        throw new Error("enable requires a server name (e.g. mcpa enable <name>)");
      }
      await cmdEnable(name, dir, streams.output);
      return 0;
    }

    if (command === "disable") {
      const values = positional(commandArgs);
      const name = option(commandArgs, "--name") ?? values[0];
      if (!name) {
        throw new Error("disable requires a server name (e.g. mcpa disable <name>)");
      }
      await cmdDisable(name, dir, streams.output);
      return 0;
    }

    if (command === "bench") {
      const values = positional(commandArgs);
      const endpoint = values[0];
      if (!endpoint) throw new Error("bench requires an MCP endpoint URL (e.g. mcpa bench <url>)");
      await cmdBench(endpoint, streams.output);
      return 0;
    }

    if (command === "codegen") {
      const values = positional(commandArgs);
      const endpoint = values[0];
      if (!endpoint) throw new Error("codegen requires an MCP endpoint URL (e.g. mcpa codegen <url> --out <file>)");
      const codegenOut = option(commandArgs, "--out");
      if (!codegenOut) throw new Error("codegen requires --out <file>");
      await cmdCodegen(endpoint, codegenOut);
      return 0;
    }

    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    writeLine(streams.error, error instanceof Error ? error.message : String(error));
    return 1;
  }
}
