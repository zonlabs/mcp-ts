import type { Writable } from "node:stream";
import type { McpEndpointClient } from "../client.js";
import { createRouter, parseToolRef, searchTools } from "../core.js";
import { withGatewayClient } from "../gateway/command-client.js";
import { writeLine } from "../ux.js";

function parseSchemaResult(raw: unknown, originalName: string): unknown {
  if (raw && typeof raw === "object") {
    const res = raw as { isError?: boolean; content?: Array<{ type?: string; text?: string }> };
    if (res.isError) {
      return { name: originalName, error: "Tool not found" };
    }
    if (Array.isArray(res.content) && res.content[0]?.type === "text" && res.content[0]?.text) {
      try {
        const parsed = JSON.parse(res.content[0].text);
        if (parsed.tool) return parsed.tool;
        if (parsed.tools && Array.isArray(parsed.tools) && parsed.tools.length === 1) {
          return parsed.tools[0];
        }
        return parsed;
      } catch {
        return res.content[0].text;
      }
    }
  }
  return raw ?? { name: originalName, error: "Tool not found" };
}

async function fetchSchemaThroughClient(
  client: McpEndpointClient,
  name: string,
): Promise<unknown> {
  const { serverId: targetServerId, toolName: targetToolName } = parseToolRef(name);

  // 1. Try batch schemas endpoint first if canonical ID is given
  try {
    const rawPlural = await client.callTool("get_mcp_tool_schemas", {
      toolIds: [name],
    });
    const parsed = parseSchemaResult(rawPlural, name);
    if (parsed && typeof parsed === "object" && !("error" in parsed)) {
      return parsed;
    }
  } catch {
    // Fall back to discovery search
  }

  // 2. Discover via router search
  const router = await createRouter(client);
  const matches = await searchTools(router, targetToolName, 10);
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
  const match = exactMatches[0];

  if (match) {
    try {
      const raw = await client.callTool("get_mcp_tool_schemas", {
        toolIds: [match.toolId],
      });
      return parseSchemaResult(raw, name);
    } catch {
      // Fall through
    }
  }

  if (targetServerId) {
    try {
      const raw = await client.callTool("get_mcp_tool_schemas", {
        toolIds: [`${targetServerId}::${targetToolName}`],
      });
      return parseSchemaResult(raw, name);
    } catch {
      // Fall through
    }
  }

  return { name, error: "Tool not found" };
}

async function fetchAllSchemasThroughClient(
  client: McpEndpointClient,
  names: string[],
): Promise<unknown[]> {
  // If multiple canonical names, try batch get_mcp_tool_schemas directly
  if (names.length > 1 && names.every((n) => n.includes("::"))) {
    try {
      const raw = await client.callTool("get_mcp_tool_schemas", {
        toolIds: names,
      });
      if (raw && typeof raw === "object") {
        const res = raw as { isError?: boolean; content?: Array<{ type?: string; text?: string }> };
        if (!res.isError && Array.isArray(res.content) && res.content[0]?.text) {
          const parsed = JSON.parse(res.content[0].text);
          if (Array.isArray(parsed.tools) && parsed.tools.length === names.length) {
            return parsed.tools;
          }
        }
      }
    } catch {
      // Fall through to parallel single fetches
    }
  }

  return Promise.all(names.map((n) => fetchSchemaThroughClient(client, n)));
}

export async function cmdLocalSchema(
  names: string[],
  dir: string | undefined,
  output: Pick<Writable, "write">,
): Promise<void> {
  await withGatewayClient(
    { onWarning: (message) => writeLine(output, message) },
    async (client) => {
      const results = await fetchAllSchemasThroughClient(client, names);
      writeLine(output, JSON.stringify(names.length === 1 ? results[0] : results, null, 2));
    },
  );
}
