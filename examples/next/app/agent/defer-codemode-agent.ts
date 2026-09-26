import {
  ToolLoopAgent,
  InferAgentUIMessage,
  stepCountIs,
  toolSearch,
} from "ai";
import { experimental_codeModeTool } from "@ai-sdk/code-mode";
import { McpManager } from "@mcp-ts/client";
import { AIAdapter } from "@mcp-ts/client/adapters/ai";
import { createDeepSeek } from "@ai-sdk/deepseek";

// ----------------------------------------------------------------------
// 1. Agent Instructions
// ----------------------------------------------------------------------
const INSTRUCTIONS = `
You are an expert assistant, an AI assistant that helps users with their tasks using the available MCP tools.  Use code mode to coordinate the available tools. Call independent tools in parallel when possible, and explain the result clearly. Use prior messages to answer follow-up questions. 
`;

// ----------------------------------------------------------------------
// 2. Client Management (Cached singleton per user)
// ----------------------------------------------------------------------
const mcpManagerCache = new Map<string, McpManager>();

function getMcpManager(userId: string): McpManager {
  let manager = mcpManagerCache.get(userId);
  if (!manager) {
    manager = new McpManager(userId);
    mcpManagerCache.set(userId, manager);
  }
  return manager;
}

// ----------------------------------------------------------------------
// 3. Agent Initialization with deferLoading & code mode
// ----------------------------------------------------------------------
export async function createDeferCodeModeAgent(
  userId: string = process.env.NEXT_PUBLIC_MCP_USER_ID || "demo-user-123"
) {
  const manager = getMcpManager(userId);

  try {
    await manager.connect();
  } catch (error) {
    console.error("[DeferCodeModeAgent] Failed to connect MCP manager:", error);
  }

  // 1. Fetch MCP tools with native deferLoading (zero initial prompt tokens)
  const mcpTools = await AIAdapter.getTools(manager, {
    deferLoading: true,
    needsApproval: (tool) => (tool.annotations as any)?.destructiveHint === true,
  });

  // 2. Compose tools: Deferred MCP tools + AI SDK toolSearch + AI SDK Code Mode
  const tools = {
    ...mcpTools,
    tool_search: toolSearch(),
    codemode_run: experimental_codeModeTool({ toolDiscovery: "conversation" }),
  };

  const model = createDeepSeek({
    apiKey: process.env.DEEPSEEK_API_KEY || "dummy-key",
  })("deepseek-chat");

  return new ToolLoopAgent({
    model,
    instructions: INSTRUCTIONS,
    tools: tools as any,
    stopWhen: stepCountIs(20),
  });
}

export type DeferCodeModeAgentUIMessage = InferAgentUIMessage<
  Awaited<ReturnType<typeof createDeferCodeModeAgent>>
>;
