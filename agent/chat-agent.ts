import { initiateMcpConnection } from "@/tool/initiate-mcp-connection";
import { searchMcpServers } from "@/tool/search-mcp-servers";
import { createOpenAI } from "@ai-sdk/openai";
import { ToolLoopAgent, InferAgentUIMessage, stepCountIs, tool, type LanguageModelUsage, type ToolSet } from "ai";
import { MultiSessionClient } from "@mcp-ts/sdk/server";
import { AIAdapter } from "@mcp-ts/sdk/adapters/ai";
import { ToolRouter } from "@mcp-ts/sdk/shared";
import { z } from "zod";
import type { GatewayServerSelection, GatewayToolInfo } from "@/lib/gateway-access";
import { getModelFromConfig } from "@/lib/llm";
import {
  collectAgentServerPairs,
  getBridgeSubjectFromUserId,
  getRemoteAgents,
  getRemoteServerInfo,
  invokeRemoteServer,
} from "@/lib/remote-bridge";

interface CreateMcpAgentOptions {
  userId?: string;
  gatewaySelections?: GatewayServerSelection[];
}

function buildChatAgentInstructions(now: Date = new Date()): string {
  const currentDate = now.toISOString().split("T")[0];
  const currentTime = now.toLocaleTimeString("en-US", { hour12: false });

  return `
You are MCP Assistant, an AI agent that helps users complete tasks by discovering, connecting to, and using Model Context Protocol (MCP) servers.

## Current Date & Time
- Today's date: ${currentDate}
- Current time: ${currentTime}
- Use this for time-sensitive queries like "today's match", "current prices", or "latest update".

## Available Tool Types

1. Built-in assistant tools
   - \`MCPASSISTANT_SEARCH_SERVERS\`
   - \`MCPASSISTANT_INITIATE_CONNECTION\`

2. ToolRouter meta-tools
   - \`mcp_search_tool_bm25\`: discover relevant MCP tools
   - \`mcp_search_tool_regex\`: find tools by name or pattern
   - \`mcp_get_tool_schema\`: load the exact input schema for a discovered tool
   - \`mcp_execute_tool\`: execute a discovered tool

3. Local gateway tools
   - Tools prefixed with \`LOCAL_MCP__\` are already approved local gateway tools
   - If one directly matches the task, you may use it immediately

## Default Workflow

1. Call \`MCPASSISTANT_SEARCH_SERVERS\` to find a suitable MCP server. Search results include all connected servers plus connection status on matching catalog results when available.
2. If needed, call \`MCPASSISTANT_INITIATE_CONNECTION\` using the server details from search results.
3. When using the remote MCP tool catalog, follow this exact flow: search -> schema -> execute.
   - First call \`mcp_search_tool_bm25\` or \`mcp_search_tool_regex\`
   - Then call \`mcp_get_tool_schema\` for the chosen tool
   - Then call \`mcp_execute_tool\` with arguments that match the schema
4. If the user is vague about which connected server to use and ToolRouter search returns no suitable tools:
   - Call \`MCPASSISTANT_SEARCH_SERVERS\` with the user's core capability or task.
   - Inspect \`connectedServers\` from the search result, even when \`servers\` has no good catalog match.
   - Pick the most likely connected server by server name, URL, and the user's requested capability.
   - Retry ToolRouter search using focused terms from that connected server and the capability.
   - If multiple connected servers are plausible, ask the user to choose instead of guessing.

## Key Rules

- Be proactive: search for servers or tools when a task needs a capability you do not already have.
- Treat \`connectedServers\` from \`MCPASSISTANT_SEARCH_SERVERS\` as the current connected-server inventory. Use it to decide which already-connected server to query when the user did not name a specific server, tool etc.
- Never call a discovered remote MCP tool directly by its original name. Use \`mcp_execute_tool\`.
- Always inspect a discovered remote tool with \`mcp_get_tool_schema\` before executing it, unless the user already provided the exact required arguments and the schema is already known in the current context.
- Only call \`MCPASSISTANT_INITIATE_CONNECTION\` after getting server details from \`MCPASSISTANT_SEARCH_SERVERS\`.
- Present multiple server options when several are plausible and the choice is not obvious.
- Use \`connectionState\` from tool results to describe connection status accurately.
- Never say "connected successfully" unless \`connectionState\` is exactly \`"ready"\`.
- If \`connectionState\` is \`ready\`, do not add speculative warnings like "you may need to authenticate."
- Keep responses concise, transparent, and action-oriented.
- Handle errors clearly and suggest the next best step.
`.trim();
}

const INSTRUCTIONS = buildChatAgentInstructions();

const MAX_TOOL_NAME_LENGTH = 64;

type McpAgentCallOptions = {
  userId?: string;
  llmConfig?: {
    provider?: string;
    apiKey?: string;
    model?: string;
  };
  gatewaySelections?: { agentId: string; mcpServer: string }[];
};

function normalizeGatewaySelections(selections: GatewayServerSelection[]): GatewayServerSelection[] {
  const unique = new Map<string, GatewayServerSelection>();
  for (const value of selections) {
    const agentId = String(value?.agentId || "").trim();
    const mcpServer = String(value?.mcpServer || "").trim();
    if (!agentId || !mcpServer) continue;
    unique.set(`${agentId}::${mcpServer}`, { agentId, mcpServer });
  }
  return Array.from(unique.values());
}

function toSafeSegment(input: string): string {
  const safe = input
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || "tool";
}

function buildToolName(serverName: string, toolName: string, usedNames: Set<string>): string {
  const base = `LOCAL_MCP__${toSafeSegment(serverName)}__${toSafeSegment(toolName)}`;
  let candidate = base.slice(0, MAX_TOOL_NAME_LENGTH);
  let index = 2;
  while (usedNames.has(candidate)) {
    const suffix = `_${index}`;
    candidate = `${base.slice(0, Math.max(1, MAX_TOOL_NAME_LENGTH - suffix.length))}${suffix}`;
    index += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

function normalizeToolInfo(raw: GatewayToolInfo, fallbackName: string): GatewayToolInfo {
  const name = String(raw?.name || fallbackName).trim();
  return {
    ...raw,
    name,
    description: String(raw?.description || "").trim(),
  };
}

/** OpenAI (and several providers) cap tool/function names at 64 chars; @mcp-ts AIAdapter uses `tool_${serverId}_${name}` which often exceeds that. */
const PROVIDER_MAX_TOOL_NAME_LEN = 64;
const OPENAI_TOOL_NAME_RE = /^[a-zA-Z0-9_-]+$/;

function hashToolKeyForShortName(key: string): string {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).padStart(7, "0");
}

function needsToolKeyRewrite(key: string): boolean {
  return (
    key.length > PROVIDER_MAX_TOOL_NAME_LEN ||
    !OPENAI_TOOL_NAME_RE.test(key) ||
    !/^[a-zA-Z_]/.test(key)
  );
}

/**
 * Rewrites tool object keys so provider API limits are satisfied. Original key is appended to description for transparency.
 */
function shortenToolKeysForProvider(tools: Record<string, any>): Record<string, any> {
  const used = new Set<string>();
  const out: Record<string, any> = {};

  for (const [key, spec] of Object.entries(tools)) {
    if (!needsToolKeyRewrite(key) && !used.has(key)) {
      used.add(key);
      out[key] = spec;
      continue;
    }
    /* Long / invalid name, or original key already used by another aliased tool */

    const h = hashToolKeyForShortName(key);
    let newKey: string;
    let n = 0;
    do {
      const suffix = n === 0 ? "" : `x${n}`;
      newKey = `mcp_${h}${suffix}`.slice(0, PROVIDER_MAX_TOOL_NAME_LEN);
      n += 1;
    } while (used.has(newKey));

    used.add(newKey);
    const prevDesc =
      spec && typeof spec === "object" && typeof spec.description === "string"
        ? spec.description
        : "";
    const registryNote = `[MCP tool registry key: ${key}]`;
    out[newKey] =
      spec && typeof spec === "object"
        ? {
            ...spec,
            description: prevDesc ? `${prevDesc}\n\n${registryNote}` : registryNote,
          }
        : spec;
  }

  return out;
}

async function getLocalMcpTools(identity: string, gatewaySelections?: GatewayServerSelection[]) {
  const normalizedSelections = normalizeGatewaySelections(gatewaySelections || []);

  let subject: string;
  try {
    subject = getBridgeSubjectFromUserId(identity);
  } catch {
    return { tools: {}, toolIndex: new Map<string, string[]>() };
  }

  const agents = await getRemoteAgents(subject);
  const availablePairs = collectAgentServerPairs(agents);
  const allowedSelections = normalizedSelections.length > 0
    ? normalizedSelections.filter((selection) =>
        availablePairs.has(`${selection.agentId}::${selection.mcpServer}`)
      )
    : Array.from(availablePairs).map((pair) => {
        const [agentId, mcpServer] = pair.split("::");
        return { agentId, mcpServer } as GatewayServerSelection;
      });

  if (allowedSelections.length === 0) {
    return { tools: {}, toolIndex: new Map<string, string[]>() };
  }

  const serverInfos = await Promise.all(
    allowedSelections.map(async (selection) => {
      try {
        const info = await getRemoteServerInfo(subject, selection.agentId, selection.mcpServer);
        return { selection, info };
      } catch (error) {
        console.error("[MCP][Gateway] Failed to fetch server info", selection, error);
        return null;
      }
    })
  );

  const gatewayTools: Record<string, any> = {};
  const toolIndex = new Map<string, string[]>();
  const usedToolNames = new Set<string>();

  for (const entry of serverInfos) {
    if (!entry || !Array.isArray(entry.info.tools)) continue;
    const { selection, info } = entry;

    for (const rawTool of info.tools) {
      const normalizedTool = normalizeToolInfo(rawTool, "tool");
      if (!normalizedTool.name) continue;

      const runtimeName = buildToolName(selection.mcpServer, normalizedTool.name, usedToolNames);
      const description = normalizedTool.description || `Local MCP tool ${normalizedTool.name}`;

      gatewayTools[runtimeName] = tool({
        description: `${description} [Gateway server: ${selection.mcpServer}] [Original tool: ${normalizedTool.name}]`,
        inputSchema: z.object({}).passthrough(),
        async *execute(input: Record<string, unknown>) {
          yield { state: "loading" as const };

          const payload = {
            jsonrpc: "2.0",
            id: `${runtimeName}-call`,
            method: "tools/call",
            params: {
              name: normalizedTool.name,
              arguments: input && typeof input === "object" ? input : {},
            },
          };

          try {
            const result = (await invokeRemoteServer(selection.agentId, selection.mcpServer, payload)) as Record<string, unknown>;
            if (result?.error) {
              yield {
                state: "output-error" as const,
                success: false,
                error: result.error,
              };
              return;
            }
            yield {
              state: "output-available" as const,
              success: true,
              data: result?.result ?? result,
            };
          } catch (error) {
            yield {
              state: "output-error" as const,
              success: false,
              error: error instanceof Error ? error.message : "Gateway tool execution failed",
            };
          }
        },
      });

      const list = toolIndex.get(selection.mcpServer) || [];
      list.push(runtimeName);
      toolIndex.set(selection.mcpServer, list);
    }
  }

  return { tools: gatewayTools, toolIndex };
}

async function getRemoteMcpTools(identity: string, client?: MultiSessionClient) {
  const manager = client || new MultiSessionClient(identity);

  if (!client) {
    try {
      await manager.connect();
    } catch (error) {
      console.error("[MCP] Connection failed:", error);
    }
  }

  const baseTools = {
    MCPASSISTANT_SEARCH_SERVERS: searchMcpServers,
    MCPASSISTANT_INITIATE_CONNECTION: initiateMcpConnection,
  };

  let mcpTools: Record<string, any> = { ...baseTools };

  try {
    const router = new ToolRouter(manager, { strategy: "search", maxTools: 5 });
    const discoveredTools = await AIAdapter.getTools(manager, { toolRouter: router });
    mcpTools = { ...mcpTools, ...discoveredTools };
  } catch (error) {
    console.error("[MCP] Failed to load MCP tools:", error);
  }

  mcpTools = shortenToolKeysForProvider(mcpTools);

  return { manager, tools: mcpTools };
}

export async function createMcpAgent(options: CreateMcpAgentOptions = {}) {
  const identity = options.userId?.trim() || "demo-user-123";

  const { tools: localTools, toolIndex: localIndex } = await getLocalMcpTools(
    identity,
    options.gatewaySelections
  );

  const { manager, tools: remoteTools } = await getRemoteMcpTools(identity);

  console.log(
    `[MCP] Loaded ${Object.keys(localTools).length} local tools (including built-ins) and ${Object.keys(remoteTools).length} remote tools.`
  );

  const combinedTools = {
    ...localTools,
    ...remoteTools,
  };

  const agent = new ToolLoopAgent<McpAgentCallOptions, ToolSet>({
    instructions: INSTRUCTIONS,
    model: createOpenAI()("gpt-4o-mini"),
    callOptionsSchema: z.object({
      userId: z.string().optional(),
      llmConfig: z
        .object({
          provider: z.string().optional(),
          apiKey: z.string().optional(),
          model: z.string().optional(),
        })
        .optional(),
      gatewaySelections: z
        .array(
          z.object({
            agentId: z.string(),
            mcpServer: z.string(),
          })
        )
        .optional(),
    }),
    prepareCall: async ({ options: callOptions, abortSignal, messages, ...settings }) => {
      const model = getModelFromConfig(callOptions?.llmConfig);

      if (abortSignal) {
        abortSignal.addEventListener("abort", () => {
          manager.disconnect();
        }, { once: true });
      }

      const instructions = INSTRUCTIONS;
      const messagesToUse = messages || [];

      const selectedServers = callOptions?.gatewaySelections?.map((s) => s.mcpServer) || options.gatewaySelections?.map((s) => s.mcpServer) || [];
      const gatewayToolNames = selectedServers.flatMap((server) => localIndex.get(server) || []);
      
      const toolsForCall = {
        ...combinedTools,
      };

      const activeTools: string[] = selectedServers.length > 0
        ? [
            ...Object.keys(combinedTools).filter(
              (k) => k.startsWith("MCPASSISTANT_")
            ),
            ...gatewayToolNames,
          ]
        : Object.keys(toolsForCall);

      return {
        ...settings,
        model,
        tools: toolsForCall,
        activeTools,
        messages: messagesToUse,
        instructions,
      };
    },
    tools: {},
    stopWhen: stepCountIs(30),
    onFinish: () => {
      manager.disconnect();
    },
  });

  return {
    agent,
    cleanup: () => {
      manager.disconnect();
    },
  };
}

type AgentMessageMetadata = {
  usage?: LanguageModelUsage;
  isNewChat?: boolean;
  chatTitle?: string;
};
export type McpAgentUIMessage = InferAgentUIMessage<
  Awaited<ReturnType<typeof createMcpAgent>>["agent"],
  AgentMessageMetadata
>;
