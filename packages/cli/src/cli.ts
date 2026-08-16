import type { Readable, Writable } from "node:stream";
import { connectRemote } from "./client.js";
import { createRouter, searchTools } from "./core.js";
import { CLI_VERSION, printBanner, renderBanner } from "./ux.js";
import { cmdInit } from "./commands/init.js";
import { cmdLogin } from "./commands/login.js";
import { cmdLogout } from "./commands/logout.js";
import { cmdCall } from "./commands/call.js";
import { cmdList } from "./commands/list.js";
import { cmdLocalSchema } from "./commands/schema.js";
import { cmdLocalSearch } from "./commands/search.js";
import { cmdServe } from "./commands/serve.js";
import { cmdConnect } from "./commands/connect.js";
import { cmdBench } from "./commands/bench.js";
import { cmdCodegen } from "./commands/codegen.js";
import type { LocalMcpDiscoveryMode } from "./gateway/local-http-mcp.js";
import pc from "picocolors";

const HELP = `${renderBanner()}
Usage:
  mcpa serve [--host h] [--port p] [--mode <all|search>] [--verbose]
                                                Run the local MCP gateway daemon
  mcpa call <tool> [jsonArgs]                   Directly execute a local MCP tool
  mcpa search [url] <query> [--limit <count>]   Search local or remote tool catalog
  mcpa schema <tool...>                         Inspect tool JSON schemas
  mcpa list                                     List all local servers and tools
  mcpa login [--remote <url>]                   Sign in to the remote gateway
  mcpa logout [--remote <url>]                  Revoke the saved CLI session
  mcpa init [--dir <path>]                      Write a default mcp.json
  mcpa connect <url>                            Explore a remote server (REPL)
  mcpa bench <url>                              Compare tool-router strategies
  mcpa codegen <url> --out <file>               Generate typed tool wrappers

Flags:
  -v, --version                                 Show CLI version
  -h, --help                                    Show help information
  --verbose                                     Show verbose child process chatter
  --mode <all|search>                           Gateway tool discovery mode (default: search)

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
      const remote = option(commandArgs, "--remote") ?? process.env.REMOTE_GATEWAY_URL ?? "https://api.mcp-assistant.in";
      await cmdLogin(remote, option(commandArgs, "--login"));
      return 0;
    }

    if (command === "logout") {
      const remote = option(commandArgs, "--remote") ?? process.env.REMOTE_GATEWAY_URL ?? "https://api.mcp-assistant.in";
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
      await cmdList(dir, streams.output);
      return 0;
    }

    if (command === "schema") {
      const values = positional(commandArgs);
      if (values.length === 0) throw new Error("schema requires one or more tool names (e.g. mcpa schema <tool1> [tool2...])");
      await cmdLocalSchema(values, dir, streams.output);
      return 0;
    }

    if (command === "serve") {
      await cmdServe({
        host: option(commandArgs, "--host"),
        port: option(commandArgs, "--port") ? Number(option(commandArgs, "--port")) : undefined,
        path: option(commandArgs, "--path"),
        remote: option(commandArgs, "--remote"),
        login: option(commandArgs, "--login"),
        mode,
        verbose,
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

      if (isUrl(values[0])) {
        // Remote search against arbitrary endpoint URL
        const endpoint = values[0];
        const searchQuery = values.slice(1).join(" ");
        if (!searchQuery) throw new Error("search with a URL requires a query string");
        const client = await connectRemote(endpoint);
        try {
          const router = await createRouter(client);
          const results = await searchTools(router, searchQuery, searchLimit);
          if (results.length === 0) {
            writeLine(streams.output, "No matching tools.");
          } else {
            results.forEach((result, index) => {
              writeLine(
                streams.output,
                `${pc.cyan(String(index + 1))}. ${pc.bold(result.name)} (server: ${result.serverName}, ~${result.estimatedTokens} tokens)`,
              );
            });
          }
          return 0;
        } finally {
          await client.close();
        }
      } else {
        // Local search against mcp.json + remote bridge
        const searchQuery = values.join(" ");
        await cmdLocalSearch(searchQuery, searchLimit, dir, streams.output);
        return 0;
      }
    }

    if (command === "connect") {
      const values = positional(commandArgs);
      const endpoint = values[0];
      if (!endpoint) throw new Error("connect requires an MCP endpoint URL (e.g. mcpa connect <url>)");
      await cmdConnect(endpoint, streams.input, streams.output);
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
