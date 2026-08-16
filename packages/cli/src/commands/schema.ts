import type { Writable } from "node:stream";
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

export async function cmdLocalSchema(
  toolNames: string[],
  dir: string | undefined,
  output: Pick<Writable, "write">,
): Promise<void> {
  const configs = getLocalConfigs(dir);
  const manager = new McpGatewayRegistry(configs, undefined, { verbose: false });
  await manager.start();
  try {
    if (toolNames.length === 1) {
      const tool = manager.getTool(toolNames[0]);
      if (!tool) {
        throw new Error(`Tool not found: "${toolNames[0]}"`);
      }
      writeLine(output, JSON.stringify(tool, null, 2));
    } else {
      const tools = toolNames.map((name) => {
        const tool = manager.getTool(name);
        return tool ?? { name, error: "Tool not found" };
      });
      writeLine(output, JSON.stringify(tools, null, 2));
    }
  } finally {
    await manager.close();
  }
}
