import { initiateMcpConnection } from "@/tool/initiate-mcp-connection";
import { searchMcpServers } from "@/tool/search-mcp-servers";
import { createOpenAI } from "@ai-sdk/openai";
import { ToolLoopAgent, InferAgentUIMessage, stepCountIs, type LanguageModelUsage, type ToolSet } from "ai";
import { McpManager } from "@mcp-ts/client";
import { AIAdapter } from "@mcp-ts/client/adapters/ai";
import { ToolRouter } from "@mcp-ts/client/shared";
import { z } from "zod";
import { buildChatAgentInstructions, PINNED_REMOTE_TOOLS } from "@/agent/chat-agent-instructions";
import type { GatewayServerSelection } from "@/lib/gateway-access";
import { getModelFromConfig } from "@/lib/llm";
import {
  type AgentPreferences,
  normalizeAgentPreferences,
  shouldRequireMcpToolApproval,
} from "@/lib/agent-preferences";

interface CreateMcpAgentOptions {
  userId?: string;
  gatewaySelections?: GatewayServerSelection[];
  agentPreferences?: Partial<AgentPreferences>;
}

type McpAgentCallOptions = {
  userId?: string;
  llmConfig?: {
    provider?: string;
    apiKey?: string;
    model?: string;
  };
  gatewaySelections?: { agentId: string; mcpServer: string }[];
  agentPreferences?: Partial<AgentPreferences>;
};

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

async function getRemoteMcpTools(
  userId: string,
  client?: McpManager,
  agentPreferences: Partial<AgentPreferences> = {}
) {
  const manager = client || new McpManager(userId);

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
    const router = new ToolRouter(manager, {
      strategy: "search",
      maxTools: 5,
      pinnedTools: [...PINNED_REMOTE_TOOLS],
    });
    const discoveredTools = await AIAdapter.getTools(manager, { toolRouter: router });
    if (discoveredTools.mcp_execute_tool) {
      discoveredTools.mcp_execute_tool = {
        ...discoveredTools.mcp_execute_tool,
        needsApproval: () => shouldRequireMcpToolApproval(normalizeAgentPreferences(agentPreferences)),
      };
    }
    mcpTools = { ...mcpTools, ...discoveredTools };
  } catch (error) {
    console.error("[MCP] Failed to load MCP tools:", error);
  }

  mcpTools = shortenToolKeysForProvider(mcpTools);

  return { manager, tools: mcpTools };
}

export async function createMcpAgent(options: CreateMcpAgentOptions = {}) {
  const userId = options.userId?.trim() || "demo-user-123";
  const initialAgentPreferences = normalizeAgentPreferences(options.agentPreferences);

  // Gateway-local tool exposure is intentionally disabled; remote MCP access goes through ToolRouter.
  const localTools: Record<string, any> = {};

  const { manager, tools: remoteTools } = await getRemoteMcpTools(
    userId,
    undefined,
    initialAgentPreferences
  );

  console.log(
    `[MCP] Loaded ${Object.keys(localTools).length} local tools (including built-ins) and ${Object.keys(remoteTools).length} remote tools.`
  );

  const combinedTools = {
    ...localTools,
    ...remoteTools,
  };

  const agent = new ToolLoopAgent<McpAgentCallOptions, ToolSet>({
    instructions: buildChatAgentInstructions(new Date(), initialAgentPreferences),
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
      agentPreferences: z
        .object({
          timezone: z.string().optional(),
          toolApprovalMode: z.enum(["always", "risky", "never"]).optional(),
        })
        .optional(),
    }),
    prepareCall: async ({ options: callOptions, abortSignal, messages, ...settings }) => {
      const model = getModelFromConfig(callOptions?.llmConfig);

      if (abortSignal) {
        abortSignal.addEventListener("abort", () => {
          manager.disconnect();
        }, { once: true });
      }

      const instructions = buildChatAgentInstructions(
        new Date(),
        callOptions?.agentPreferences || initialAgentPreferences
      );
      const messagesToUse = messages || [];

      const toolsForCall = {
        ...combinedTools,
      };

      return {
        ...settings,
        model,
        tools: toolsForCall,
        activeTools: Object.keys(toolsForCall),
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
