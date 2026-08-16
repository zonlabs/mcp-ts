import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import pc from "picocolors";
import { connectRemote } from "../client.js";
import { createRouter, resolveTool, searchTools } from "../core.js";
import { intro, outro, printBanner, success, treeNote } from "../ux.js";

function writeLine(stream: Pick<Writable, "write">, text: string): void {
  stream.write(`${text}\n`);
}

async function printSearch(
  output: Pick<Writable, "write">,
  router: Awaited<ReturnType<typeof createRouter>>,
  query: string,
  limit = 10,
): Promise<void> {
  const results = await searchTools(router, query, limit);
  if (results.length === 0) {
    writeLine(output, "No matching tools.");
    return;
  }
  results.forEach((result, index) => {
    writeLine(
      output,
      `${pc.cyan(String(index + 1))}. ${pc.bold(result.name)} (server: ${result.serverName}, ~${result.estimatedTokens} tokens)`,
    );
  });
}

export async function cmdConnect(endpoint: string, input: Readable, output: Writable): Promise<void> {
  printBanner();
  intro(pc.bold(`Connect to ${endpoint}`));
  const client = await connectRemote(endpoint);
  try {
    const router = await createRouter(client);
    const toolCount = router.listServers().reduce((total, server) => total + server.toolCount, 0);
    success(`Connected — ${toolCount} tools discovered`);
    treeNote(pc.dim('Type "help" for commands, "exit" to quit.'));

    const terminal = Boolean((output as Writable & { isTTY?: boolean }).isTTY);
    const readline = createInterface({ input, output, terminal });
    try {
      while (true) {
        const line = (await readline.question(`${pc.cyan("mcp")} > `)).trim();
        if (!line) continue;
        const [command, ...rest] = line.split(/\s+/);
        if (command === "exit" || command === "quit") break;
        if (command === "help") {
          writeLine(output, `Available REPL commands:
  search <query>             Search the remote tool catalog
  schema <tool|server::tool> Show a tool's JSON schemas
  call <tool> <json>         Execute a tool call
  exit                       Leave the REPL`);
          continue;
        }
        if (command === "search") {
          await printSearch(output, router, rest.join(" "));
          continue;
        }
        if (command === "schema") {
          const name = rest[0];
          if (!name) {
            writeLine(output, "Usage: schema <tool>");
            continue;
          }
          const tool = resolveTool(router, name);
          if (!tool) {
            writeLine(output, `Tool not found: ${name}`);
            continue;
          }
          writeLine(
            output,
            JSON.stringify(
              {
                name: tool.name,
                serverName: tool.serverName,
                description: tool.description,
                inputSchema: tool.inputSchema,
                outputSchema: tool.outputSchema,
              },
              null,
              2,
            ),
          );
          continue;
        }
        if (command === "call") {
          const name = rest[0];
          const payload = rest.slice(1).join(" ");
          if (!name || !payload) {
            writeLine(output, "Usage: call <tool> <json>");
            continue;
          }
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(payload) as Record<string, unknown>;
          } catch {
            writeLine(output, "Invalid JSON payload");
            continue;
          }
          const tool = resolveTool(router, name);
          if (!tool) {
            writeLine(output, `Tool not found: ${name}`);
            continue;
          }
          const result = await router.callTool({ toolId: tool.toolId, args: parsed });
          writeLine(output, JSON.stringify(result, null, 2));
          continue;
        }
        writeLine(output, `Unknown command: ${command}. Type "help".`);
      }
    } finally {
      readline.close();
      outro("Disconnected");
    }
  } finally {
    await client.close();
  }
}
