import {
  ToolLoopAgent,
  InferAgentUIMessage,
  stepCountIs,
  pruneMessages,
  type LanguageModelUsage,
  type ToolSet,
  type PrepareStepFunction,
  toolSearch,
} from "ai";
import { experimental_codeModeTool } from "@ai-sdk/code-mode";
import { McpManager } from "@mcp-ts/client";
import { AIAdapter } from "@mcp-ts/client/adapters/ai";
import { buildChatAgentInstructions, PINNED_REMOTE_TOOLS } from "@/agent/chat-agent-instructions";
import { getModelConfig, resolveMaxTokens } from "@/lib/llm";
import {
  type UserPreferences,
  normalizeUserPreferences,
  shouldRequireMcpToolApproval,
} from "@/lib/user-preferences";
import { createMemoryTools } from "@/lib/memory/tools";
import { createFileAnalystTool } from "@/agent/subagents/file-analyst-agent";
import type { MemoryScope } from "@/lib/projects";

export interface CreateChatAgentOptions {
  userId?: string;
  runId?: string;
  chatId?: string;
  projectId?: string;
  userPreferences?: Partial<UserPreferences>;
  memory?: string;
  projectInstructions?: string;
  memoryScope?: MemoryScope;
  llmConfig?: {
    provider?: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    maxTokens?: number;
  };
  abortSignal?: AbortSignal;
}

export async function createChatAgent(options: CreateChatAgentOptions = {}) {
  const userId = options.userId?.trim() || "demo-user-123";
  const userPreferences = normalizeUserPreferences(options.userPreferences);
  const memoryScope: MemoryScope = options.memoryScope ?? "global";
  const projectInstructions = options.projectInstructions || "";

  const manager = new McpManager(userId);

  if (options.abortSignal) {
    options.abortSignal.addEventListener("abort", () => manager.disconnect(), { once: true });
  }

  let tools: Record<string, any> = {};

  try {
    await manager.connect();
    const mcpTools = await AIAdapter.getTools(manager, {
      deferLoading: true,
      needsApproval: () => shouldRequireMcpToolApproval(userPreferences),
    });
    tools = {
      ...mcpTools,
      tool_search: toolSearch(),
      codemode_run: experimental_codeModeTool({ toolDiscovery: "conversation" }),
    };
  } catch (error) {
    console.error("[MCP] Connection / tool discovery failed:", error);
    tools = {
      ...tools,
      tool_search: toolSearch(),
      codemode_run: experimental_codeModeTool({ toolDiscovery: "conversation" }),
    };
  }

  if (userPreferences.enableMemory !== false) {
    const memoryRunId = memoryScope === "project" ? options.projectId : (options.chatId || options.runId);
    const memoryTools = createMemoryTools(userId, memoryRunId);
    tools = {
      ...tools,
      ...memoryTools,
    };
  }

  if (options.projectId) {
    const fileAnalystTool = createFileAnalystTool({
      projectId: options.projectId,
      llmConfig: options.llmConfig,
    });
    tools = {
      ...tools,
      ...fileAnalystTool,
    };
  }

  const model = getModelConfig(options.llmConfig);

  const instructions = buildChatAgentInstructions(
    new Date(),
    userPreferences,
    options.memory || "",
    projectInstructions
  );

  const COMPACTION_THRESHOLD_CHARS = 32000; // ~8,000 tokens

  const compactStepMessages: PrepareStepFunction<any> = ({ messages, stepNumber }) => {
    // Only compact on subsequent steps when tool result payloads accumulate
    if (stepNumber <= 1) return undefined;

    const approxLength = JSON.stringify(messages).length;
    if (approxLength > COMPACTION_THRESHOLD_CHARS) {
      return {
        messages: pruneMessages({
          messages,
          reasoning: "before-last-message",
          toolCalls: "before-last-2-messages",
          emptyMessages: "remove",
        }),
      };
    }
    return undefined;
  };

  const maxOutputTokens = resolveMaxTokens(options.llmConfig);

  return new ToolLoopAgent({
    model,
    instructions,
    tools: tools as ToolSet,
    prepareStep: compactStepMessages,
    stopWhen: stepCountIs(30),
    maxOutputTokens,
    onFinish: () => {
      manager.disconnect();
    },
  });
}

export type ChatAgent = Awaited<ReturnType<typeof createChatAgent>>;

export type McpServerMetadata = {
  serverId?: string;
  serverName?: string;
  serverUrl?: string;
  serverInfo?: {
    name?: string;
    version?: string;
    icons?: Array<{ src: string; mimeType?: string; sizes?: string }>;
    [key: string]: unknown;
  };
  sessionId?: string;
  metadata?: unknown;
};

export type AgentMessageMetadata = {
  usage?: LanguageModelUsage;
  model?: string;
  isNewChat?: boolean;
  chatTitle?: string;
  /** MCP server info keyed by tool name, populated server-side during tool call streaming */
  mcp?: Record<string, McpServerMetadata>;
  durationSeconds?: number;
  thinkingStartTimeMs?: number;
  thinkingEndTimeMs?: number;
  [key: string]: unknown;
};

export type ChatUIMessage = InferAgentUIMessage<
  ChatAgent,
  AgentMessageMetadata
>;
