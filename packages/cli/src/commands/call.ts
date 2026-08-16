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

export async function cmdCall(
  toolName: string,
  rawArgs: string | undefined,
  dir: string | undefined,
  output: Pick<Writable, "write">,
): Promise<void> {
  const configs = getLocalConfigs(dir);
  const manager = new McpGatewayRegistry(configs, undefined, { verbose: false });
  await manager.start();
  try {
    let args: Record<string, unknown> = {};
    if (rawArgs) {
      try {
        args = JSON.parse(rawArgs) as Record<string, unknown>;
      } catch {
        throw new Error(`Invalid JSON argument payload: "${rawArgs}"`);
      }
    }
    const result = await manager.callTool(toolName, args);
    writeLine(output, JSON.stringify(result, null, 2));
  } finally {
    await manager.close();
  }
}
