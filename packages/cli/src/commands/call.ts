import type { Writable } from "node:stream";
import { pingGateway, withMcpGateway } from "../gateway/context.js";
import { connectRemote } from "../client.js";
import { createRouter, parseToolRef, searchTools } from "../core.js";
import { writeLine } from "../ux.js";

function parseJsonArgs(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      const fixed = trimmed
        .replace(/([{,]\s*)([a-zA-Z0-9_-]+)\s*:/g, '$1"$2":')
        .replace(/:\s*([a-zA-Z0-9_.-]+)(\s*[,}])/g, ':"$1"$2');
      try {
        return JSON.parse(fixed) as Record<string, unknown>;
      } catch {
        // Fall through
      }
    }
  }

  if (trimmed.includes("=")) {
    const result: Record<string, unknown> = {};
    const pairs = trimmed.split(",");
    for (const pair of pairs) {
      const [k, ...vParts] = pair.split("=");
      if (k && vParts.length > 0) {
        const val = vParts.join("=").trim();
        result[k.trim()] = val === "true" ? true : val === "false" ? false : isNaN(Number(val)) ? val : Number(val);
      }
    }
    if (Object.keys(result).length > 0) return result;
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid JSON argument payload: "${raw}"`);
  }
}

import { META_TOOL_NAMES_SET, DEFAULT_TOOL_SEARCH_LIMIT } from "../constants.js";

async function invokeThroughClient(
  client: Awaited<ReturnType<typeof connectRemote>>,
  targetToolName: string,
  targetServerId: string | undefined,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (META_TOOL_NAMES_SET.has(targetToolName)) {
    return client.callTool(targetToolName, args);
  }

  const router = await createRouter(client);
  const matches = await searchTools(router, targetToolName, DEFAULT_TOOL_SEARCH_LIMIT);
  const match =
    matches.find(
      (m) =>
        (!targetServerId ||
          m.serverId.toLowerCase() === targetServerId.toLowerCase() ||
          m.serverName.toLowerCase() === targetServerId.toLowerCase()) &&
        (m.toolName.toLowerCase() === targetToolName.toLowerCase() ||
          m.name.toLowerCase() === targetToolName.toLowerCase() ||
          m.toolId.toLowerCase().endsWith(`::${targetToolName.toLowerCase()}`)),
    ) ?? matches[0];

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

  // 1. If local daemon is running, call it directly
  const runningGateway = await pingGateway();
  if (runningGateway) {
    try {
      const client = await connectRemote(runningGateway);
      try {
        const result = await invokeThroughClient(client, targetToolName, targetServerId, args);
        writeLine(output, JSON.stringify(result, null, 2));
        return;
      } finally {
        await client.close();
      }
    } catch (err) {
      if (targetServerId) throw err;
    }
  }

  // 2. If remote session exists, call remote gateway directly via HTTP
  const remote = process.env.REMOTE_GATEWAY_URL ?? "https://api.mcp-assistant.in";
  try {
    const client = await connectRemote(remote);
    try {
      const result = await invokeThroughClient(client, targetToolName, targetServerId, args);
      writeLine(output, JSON.stringify(result, null, 2));
      return;
    } finally {
      await client.close();
    }
  } catch {
    // Fallback to local gateway
  }

  // 3. Fallback to local-only configuration
  await withMcpGateway({ cwd: dir, enableBridge: false }, async (gateway) => {
    const result = await gateway.callTool(toolName, args);
    writeLine(output, JSON.stringify(result, null, 2));
  });
}
