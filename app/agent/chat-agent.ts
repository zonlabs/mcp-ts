import { ToolLoopAgent, InferAgentUIMessage, stepCountIs, pruneMessages, type LanguageModelUsage, type ToolSet } from "ai";
import { McpManager } from "@mcp-ts/client";
import { AIAdapter } from "@mcp-ts/client/adapters/ai";
import { ToolRouter } from "@mcp-ts/client/shared";
import { z } from "zod";
import { buildChatAgentInstructions, PINNED_REMOTE_TOOLS } from "@/agent/chat-agent-instructions";
import { getModelConfig } from "@/lib/llm";
import {
  type UserPreferences,
  normalizeUserPreferences,
  shouldRequireMcpToolApproval,
} from "@/lib/user-preferences";
import { createMemoryTools } from "@/lib/memory/tools";

export interface CreateChatAgentOptions {
  userId?: string;
  runId?: string;
  chatId?: string;
  userPreferences?: Partial<UserPreferences>;
  memory?: string;
}

export type ChatAgentCallOptions = {
  userId?: string;
  runId?: string;
  chatId?: string;
  memory?: string;
  llmConfig?: {
    provider?: string;
    apiKey?: string;
    model?: string;
  };
  userPreferences?: Partial<UserPreferences>;
};

export async function createChatAgent(options: CreateChatAgentOptions = {}) {
  const userId = options.userId?.trim() || "demo-user-123";
  const initialUserPreferences = normalizeUserPreferences(options.userPreferences);

  const manager = new McpManager(userId);

  try {
    await manager.connect();
  } catch (error) {
    console.error("[MCP] Connection failed:", error);
  }

  let tools: Record<string, any> = {};

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
        needsApproval: () => shouldRequireMcpToolApproval(initialUserPreferences),
      };
    }
    const memoryTools = createMemoryTools(userId, options.chatId || options.runId);
    tools = {
      ...discoveredTools,
      ...memoryTools,
    };
  } catch (error) {
    console.error("[MCP] Failed to load MCP tools:", error);
    const memoryTools = createMemoryTools(userId, options.chatId || options.runId);
    tools = { ...memoryTools };
  }

  const agent = new ToolLoopAgent<ChatAgentCallOptions, ToolSet>({
    instructions: buildChatAgentInstructions(new Date(), initialUserPreferences),
    model: getModelConfig(),
    callOptionsSchema: z.object({
      userId: z.string().optional(),
      runId: z.string().optional(),
      chatId: z.string().optional(),
      memory: z.string().optional(),
      llmConfig: z
        .object({
          provider: z.string().optional(),
          apiKey: z.string().optional(),
          model: z.string().optional(),
        })
        .optional(),
      userPreferences: z
        .object({
          timezone: z.string().optional(),
          toolApprovalMode: z.enum(["always", "risky", "never"]).optional(),
        })
        .optional(),
    }),
    prepareCall: async ({ options: callOptions, messages, ...settings }) => {
      const model = getModelConfig(callOptions?.llmConfig);

      const activePreferences = callOptions?.userPreferences || initialUserPreferences;
      const memory = callOptions?.memory || options.memory || "";
      const instructions = buildChatAgentInstructions(
        new Date(),
        activePreferences,
        memory
      );

      // Prune historical MCP tool outputs and intermediate reasoning to keep context lean
      const rawMessages = messages || [];
      const messagesToUse = pruneMessages({
        messages: rawMessages,
        toolCalls: "before-last-2-messages",
        reasoning: "before-last-message",
        emptyMessages: "remove",
      });

      return {
        ...settings,
        model,
        tools,
        activeTools: Object.keys(tools),
        messages: messagesToUse,
        instructions,
        maxOutputTokens: settings.maxOutputTokens ?? 4096,
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
  model?: string;
  isNewChat?: boolean;
  chatTitle?: string;
  [key: string]: any;
};

export type ChatUIMessage = InferAgentUIMessage<
  Awaited<ReturnType<typeof createChatAgent>>["agent"],
  AgentMessageMetadata
>;
