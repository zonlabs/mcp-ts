import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import { benchmarkStrategies, createRouter, generateWrappers, resolveTool, searchTools } from "./core.js";
import { connectRemote } from "./client.js";

const HELP = `mcp-ts — explore remote MCP servers

Usage:
  mcp-ts connect <url>
  mcp-ts search <url> <query> [--limit <count>]
  mcp-ts bench <url>
  mcp-ts codegen <url> --out <file>

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
      `${index + 1}. ${result.name} (server: ${result.serverName}, ~${result.estimatedTokens} tokens)`
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
        writeLine(streams.output, "Strategy  Tools  Estimated tokens");
        for (const result of await benchmarkStrategies(client)) {
          writeLine(streams.output, `${result.strategy.padEnd(8)}  ${String(result.exposedTools).padStart(5)}  ${String(result.estimatedTokens).padStart(16)}`);
        }
        return 0;
      }
      if (command === "codegen") {
        const { tools } = await client.listTools();
        const target = resolve(codegenOut!);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, generateWrappers(tools), "utf8");
        writeLine(streams.output, `Generated ${tools.length} tool wrappers in ${target}`);
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
