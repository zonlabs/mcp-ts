import { checkMcpConnections } from "@/tool/check-mcp-connections";
import { initiateMcpConnection } from "@/tool/initiate-mcp-connection";
import { searchMcpServers } from "@/tool/search-mcp-servers";
import { createOpenAI } from "@ai-sdk/openai";
import { ToolLoopAgent, InferAgentUIMessage, stepCountIs, tool, type LanguageModelUsage, type ToolSet } from "ai";
import { MultiSessionClient } from "@mcp-ts/sdk/server";
import { AIAdapter } from "@mcp-ts/sdk/adapters/ai";
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

const COMPACTION_THRESHOLD = 150;
const TOKEN_COMPACTION_THRESHOLD = 25000;
const KEEP_RECENT_MESSAGES = 20;

async function generateSummary(messages: any[]): Promise<string> {
  const model = createOpenAI()("gpt-4o-mini");
  const { generateText } = await import('ai');
  
  const conversationText = messages.map(m => {
    const role = m.role || 'unknown';
    const content = Array.isArray(m.parts) 
      ? m.parts.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n')
      : m.content || '';
    return `${role}: ${content}`;
  }).join('\n\n');

  const result = await generateText({
    model,
    prompt: `Summarize this conversation concisely, capturing key topics, decisions, and context. Keep it brief (2-4 sentences):\n\n${conversationText}`,
    maxOutputTokens: 200,
  });

  return result.text?.trim() || '';
}

const INSTRUCTIONS = `
You are MCP Assistant, an AI agent that helps users complete tasks by discovering and connecting to Model Context Protocol (MCP) servers.

## Current Date & Time
- Today's date: ${new Date().toISOString().split('T')[0]}
- Current time: ${new Date().toLocaleTimeString('en-US', { hour12: false })}
- Use this for time-sensitive queries like "today's match", "current prices", etc.

## Workflow

1. **Check Available Tools**
   - Either check the existing tools you have or Call "MCPASSISTANT_CHECK_ACTIVE_CONNECTIONS" to see connected servers
   - If you have the right tools already, use them immediately

2. **Search for MCP Servers** (if needed)
   - Call "MCPASSISTANT_SEARCH_SERVERS" to find servers with the required capability
   - Select the most relevant server from search results

3. **Connect to Server**
   - Call "MCPASSISTANT_INITIATE_CONNECTION" with the server_url and server_name from search results
   - Inform the user about the connection

4. **Complete the Task**
   - Use the mcp_* tools to fulfill the request
   - If tools prefixed with "LOCAL_MCP__" are available, they are approved local gateway tools. Use them directly for matching tasks.
   - Be transparent about what you're doing

## Key Rules

- Be proactive: automatically search and connect when a task needs a specific capability
- Always extract capability keywords from user intent (see MCPASSISTANT_SEARCH_SERVERS tool description for examples)
- Only call MCPASSISTANT_INITIATE_CONNECTION after getting server details from MCPASSISTANT_SEARCH_SERVERS
- Present multiple options if several servers match, let the user choose
- Handle errors gracefully: explain issues clearly and suggest solutions
- Keep responses concise and actionable
`;

const MAX_TOOL_NAME_LENGTH = 64;

interface CreateMcpAgentOptions {
  userId?: string;
  gatewaySelections?: GatewayServerSelection[];
  conversationSummary?: string | null;
  compactedUpToIndex?: number;
  totalSessionTokens?: number;
}
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
    MCPASSISTANT_CHECK_ACTIVE_CONNECTIONS: checkMcpConnections,
    MCPASSISTANT_SEARCH_SERVERS: searchMcpServers,
    MCPASSISTANT_INITIATE_CONNECTION: initiateMcpConnection,
  };

  let mcpTools: Record<string, any> = { ...baseTools };

  try {
    const discoveredTools = await AIAdapter.getTools(manager);
    mcpTools = { ...mcpTools, ...discoveredTools };
  } catch (error) {
    console.error("[MCP] Failed to load MCP tools:", error);
  }

  return { manager, tools: mcpTools };
}

export async function createMcpAgent(options: CreateMcpAgentOptions = {}) {
  const identity = options.userId?.trim() || "demo-user-123";

  // Store compaction options in closure for use in prepareCall
  const conversationSummary = options.conversationSummary;
  const compactedUpToIndex = options.compactedUpToIndex;
  const totalSessionTokens = options.totalSessionTokens;

  // Local tools = Gateway/Bridge + Built-ins
  const { tools: localTools, toolIndex: localIndex } = await getLocalMcpTools(
    identity,
    options.gatewaySelections
  );

  // Remote tools = SSE/MultiSession (Direct connections)
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

      // Handle conversation compaction
      let instructions = INSTRUCTIONS;
      let messagesToUse = messages || [];

      const { conversationSummary, compactedUpToIndex } = options;

      // If we already have a summary, prepend it to instructions and trim messages
      if (conversationSummary && compactedUpToIndex && compactedUpToIndex > 0) {
        instructions = `${INSTRUCTIONS}\n\n[SUMMARY OF PREVIOUS CONVERSATION]\n${conversationSummary}`;
        messagesToUse = messagesToUse.slice(compactedUpToIndex);
      }
      // Check if we need to compact (token-based: 50k tokens threshold)
      else if (totalSessionTokens && totalSessionTokens >= TOKEN_COMPACTION_THRESHOLD) {
        const toSummarize = messagesToUse.slice(0, -KEEP_RECENT_MESSAGES);
        const summary = await generateSummary(toSummarize);
        
        instructions = `${INSTRUCTIONS}\n\n[SUMMARY OF PREVIOUS CONVERSATION]\n${summary}`;
        messagesToUse = messagesToUse.slice(-KEEP_RECENT_MESSAGES);
        
        console.log(`[Compaction] Token threshold reached (${totalSessionTokens}), summarized ${toSummarize.length} messages, keeping last ${KEEP_RECENT_MESSAGES}`);
      }
      // Fallback to message count threshold for backward compatibility
      else if (messagesToUse.length >= COMPACTION_THRESHOLD) {
        const toSummarize = messagesToUse.slice(0, -KEEP_RECENT_MESSAGES);
        const summary = await generateSummary(toSummarize);
        
        instructions = `${INSTRUCTIONS}\n\n[SUMMARY OF PREVIOUS CONVERSATION]\n${summary}`;
        messagesToUse = messagesToUse.slice(-KEEP_RECENT_MESSAGES);
        
        console.log(`[Compaction] Message count threshold reached (${messagesToUse.length}), summarized ${toSummarize.length} messages, keeping last ${KEEP_RECENT_MESSAGES}`);
      }

      // Filter tools based on selections if provided
      const selectedServers = callOptions?.gatewaySelections?.map((s) => s.mcpServer) || options.gatewaySelections?.map((s) => s.mcpServer) || [];
      const gatewayToolNames = selectedServers.flatMap((server) => localIndex.get(server) || []);
      
      const activeTools: string[] = selectedServers.length > 0
        ? [...Object.keys(combinedTools).filter(k => k.startsWith('MCPASSISTANT_')), ...gatewayToolNames]
        : Object.keys(combinedTools);

      return {
        ...settings,
        model,
        tools: combinedTools,
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
