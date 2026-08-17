import type { Writable } from "node:stream";
import { withMcpGateway } from "../gateway/context.js";
import { writeLine } from "../ux.js";

export async function cmdCall(
  toolName: string,
  rawArgs: string | undefined,
  dir: string | undefined,
  output: Pick<Writable, "write">,
): Promise<void> {
  let args: Record<string, unknown> = {};
  if (rawArgs) {
    try {
      args = JSON.parse(rawArgs) as Record<string, unknown>;
    } catch {
      throw new Error(`Invalid JSON argument payload: "${rawArgs}"`);
    }
  }

  await withMcpGateway({ cwd: dir }, async (gateway) => {
    const result = await gateway.callTool(toolName, args);
    writeLine(output, JSON.stringify(result, null, 2));
  });
}
