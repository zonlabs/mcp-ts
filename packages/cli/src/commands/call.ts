import type { Writable } from "node:stream";
import type { McpEndpointClient } from "../client.js";
import { createRouter, parseToolRef, searchTools } from "../core.js";
import { withGatewayClient } from "../gateway/command-client.js";
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

  // 3. Fallback direct JSON.parse
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid JSON argument payload: "${raw}"`);
  }
}

import { META_TOOL_NAMES_SET, DEFAULT_TOOL_SEARCH_LIMIT } from "../constants.js";

async function invokeThroughClient(
  client: McpEndpointClient,
  targetToolName: string,
  targetServerId: string | undefined,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (META_TOOL_NAMES_SET.has(targetToolName)) {
    return client.callTool(targetToolName, args);
  }

  const router = await createRouter(client);
  const matches = await searchTools(router, targetToolName, DEFAULT_TOOL_SEARCH_LIMIT);
  const exactMatches = matches.filter(
      (m) =>
        (!targetServerId ||
          m.serverId.toLowerCase() === targetServerId.toLowerCase() ||
          m.serverName.toLowerCase() === targetServerId.toLowerCase()) &&
        (m.toolName.toLowerCase() === targetToolName.toLowerCase() ||
          m.name.toLowerCase() === targetToolName.toLowerCase() ||
          m.toolId.toLowerCase().endsWith(`::${targetToolName.toLowerCase()}`)),
    );

  if (!targetServerId && exactMatches.length > 1) {
    throw new Error(`Tool name "${targetToolName}" is ambiguous. Use a canonical server::tool ID.`);
  }
  const match = exactMatches[0] ?? (targetServerId ? undefined : matches[0]);

  if (!match) {
    throw new Error(`Tool "${targetToolName}" not found on connected servers.`);
  }

  return client.callTool("call_mcp_tool", {
    server_id: match.serverId,
    tool_name: match.toolName,
    arguments: args,
  });
}

export async function cmdCall(
  toolName: string,
  rawArgs: string | undefined,
  dir: string | undefined,
  output: Pick<Writable, "write">,
): Promise<void> {
  const args = rawArgs ? parseJsonArgs(rawArgs) : {};
  const { serverId: targetServerId, toolName: targetToolName } = parseToolRef(toolName);

  await withGatewayClient(
    { onWarning: (message) => writeLine(output, message) },
    async (client) => {
      const result = await invokeThroughClient(client, targetToolName, targetServerId, args);
      writeLine(output, JSON.stringify(result, null, 2));
    },
  );
}
