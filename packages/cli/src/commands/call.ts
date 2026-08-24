import type { Writable } from "node:stream";
import { withGatewayClient } from "../gateway/command-client.js";
import { callGatewayTool, resolveGatewayToolId } from "../gateway/meta-tools.js";
import { writeLine } from "../ux.js";

function parseJsonArgs(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) return {};

  // 1. Standard JSON object
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      throw new Error(
        `Invalid JSON argument payload: "${raw}". In PowerShell, escape inner quotes like '{\\"key\\": \\"value\\"}' or use key=value syntax (e.g. key="value").`,
      );
    }
  }

  // 2. Key-Value shorthand (e.g. query="latest AI news", limit=5)
  if (trimmed.includes("=")) {
    const result: Record<string, unknown> = {};
    for (const pair of trimmed.split(",")) {
      const [k, ...vParts] = pair.split("=");
      if (k && vParts.length > 0) {
        const key = k.trim();
        let val: unknown = vParts.join("=").trim().replace(/^["']|["']$/g, "");
        if (val === "true") val = true;
        else if (val === "false") val = false;
        else if (!isNaN(Number(val)) && val !== "") val = Number(val);
        result[key] = val;
      }
    }
    if (Object.keys(result).length > 0) return result;
  }

  // 3. Remaining JSON values
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid JSON argument payload: "${raw}"`);
  }
}

export async function cmdCall(
  toolName: string,
  rawArgs: string | undefined,
  output: Pick<Writable, "write">,
): Promise<void> {
  const args = rawArgs ? parseJsonArgs(rawArgs) : {};

  await withGatewayClient(
    { onWarning: (message) => writeLine(output, message) },
    async (client) => {
      const toolId = await resolveGatewayToolId(client, toolName);
      const result = await callGatewayTool(client, toolId, args);
      writeLine(output, JSON.stringify(result, null, 2));
    },
  );
}
