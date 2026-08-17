import type { Writable } from "node:stream";
import { withMcpGateway } from "../gateway/context.js";
import { writeLine } from "../ux.js";

export async function cmdLocalSchema(
  toolNames: string[],
  dir: string | undefined,
  output: Pick<Writable, "write">,
): Promise<void> {
  await withMcpGateway({ cwd: dir }, async (gateway) => {
    if (toolNames.length === 1) {
      const tool = gateway.getTool(toolNames[0]);
      if (!tool) {
        throw new Error(`Tool not found: "${toolNames[0]}"`);
      }
      writeLine(output, JSON.stringify(tool, null, 2));
    } else {
      const tools = toolNames.map((name) => {
        const tool = gateway.getTool(name);
        return tool ?? { name, error: "Tool not found" };
      });
      writeLine(output, JSON.stringify(tools, null, 2));
    }
  });
}
