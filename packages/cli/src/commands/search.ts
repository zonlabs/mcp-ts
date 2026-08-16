import type { Writable } from "node:stream";
import pc from "picocolors";
import { McpGatewayRegistry } from "../gateway/registry.js";
import { loadMcpJson } from "../gateway/config.js";

function getLocalConfigs(dir: string | undefined): Record<string, any> {
  const target = dir ?? process.cwd();
  try {
    const { config } = loadMcpJson(target);
    return config.mcpServers ?? {};
  } catch {
    return {};
  }
}

function writeLine(stream: Pick<Writable, "write">, text: string): void {
  stream.write(`${text}\n`);
}

export async function cmdLocalSearch(
  query: string,
  limit: number,
  dir: string | undefined,
  output: Pick<Writable, "write">,
): Promise<void> {
  const configs = getLocalConfigs(dir);
  const manager = new McpGatewayRegistry(configs, undefined, { verbose: false });
  await manager.start();
  try {
    const matches = await manager.searchTools(query, limit);
    if (matches.length === 0) {
      writeLine(output, "No matching tools found.");
      return;
    }
    matches.forEach((result, index) => {
      const tool = manager.getTool(result.name);
      const paramCount = tool?.inputSchema?.properties ? Object.keys(tool.inputSchema.properties).length : 0;
      writeLine(
        output,
        `${pc.cyan(String(index + 1))}. ${pc.bold(result.name)} (server: ${result.serverName}, ${paramCount} params)`,
      );
      if (result.description) {
        writeLine(output, `   ${pc.dim(result.description)}`);
      }
    });
  } finally {
    await manager.close();
  }
}
