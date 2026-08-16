import type { Writable } from "node:stream";
import pc from "picocolors";
import { McpGatewayRegistry } from "../gateway/registry.js";
import { loadMcpJson } from "../gateway/config.js";

function writeLine(stream: Pick<Writable, "write">, text = ""): void {
  stream.write(`${text}\n`);
}

export async function cmdList(dir: string | undefined, output: Pick<Writable, "write">): Promise<void> {
  let configs: Record<string, any> = {};
  try {
    configs = loadMcpJson(dir ?? process.cwd()).config.mcpServers ?? {};
  } catch {
    // An empty configuration is a valid local-only result.
  }
  const registry = new McpGatewayRegistry(configs);
  await registry.start();
  try {
    const servers = registry.getLocalCatalog().servers;
    if (servers.length === 0) {
      writeLine(output, "No servers configured in mcp.json.");
      return;
    }
    writeLine(output, pc.bold(`Connected MCP Servers (${servers.length}):`));
    writeLine(output);
    for (const server of servers) {
      writeLine(output, `${pc.cyan("-")} ${pc.bold(server.serverName)} - ${server.tools.length} tool(s)`);
      for (const tool of server.tools) {
        writeLine(output, `    - ${tool.name}: ${pc.dim(tool.description || "No description")}`);
      }
      writeLine(output);
    }
  } finally {
    await registry.close();
  }
}
