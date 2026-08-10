import { ToolLoopAgent, InferAgentUIMessage, stepCountIs } from "ai";
import { MultiSessionClient } from "@mcp-ts/sdk/server";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createCodeModeRuntime, mcpServers, createCodemodeAITools } from "@mcp-ts/codemode";

// ----------------------------------------------------------------------
// 1. Agent Instructions
// ----------------------------------------------------------------------
const INSTRUCTIONS = `
You are an expert assistant that helps users perform complex tasks using MCP tools. 

You have access to a sandboxed Code Mode environment where you can execute TypeScript/JavaScript to automate multi-step workflows.

Available tools:
1. 'codemode_search_tools': Find tools by natural language description.
2. 'codemode_list_servers': See what systems are connected.
3. 'codemode_tools_info': Fetch the exact TypeScript interfaces for tools before using them.
4. 'call_tool_chain': Execute code to get things done.

When writing code for 'call_tool_chain':
- Tools are available directly as synchronous namespace functions. 
  Example: \`const issue = github.get_issue({ issue_number: 42 });\`
- Your code runs as the body of an async function. Use 'return' for the final value.
- You have access to globals: 'console', 'JSON', 'Math', 'Date', and the optional 'input' object.
- Console output is captured and returned with the result. Use console.log for debugging.
`;

// ----------------------------------------------------------------------
// 2. Client Management (Singleton per userId)
// ----------------------------------------------------------------------
const globalForMcp = globalThis as unknown as { mcpClientMap?: Map<string, MultiSessionClient> };

function getMcpClient(userId: string): MultiSessionClient {
  if (!globalForMcp.mcpClientMap) {
    globalForMcp.mcpClientMap = new Map();
  }
  
  let client = globalForMcp.mcpClientMap.get(userId);
  if (!client) {
    client = new MultiSessionClient(userId);
    globalForMcp.mcpClientMap.set(userId, client);
  }
  
  return client;
}

// ----------------------------------------------------------------------
// 3. Agent Initialization
// ----------------------------------------------------------------------
export async function createMcpAgent(userId: string = process.env.NEXT_PUBLIC_MCP_USER_ID!) {
  const client = getMcpClient(userId);

  try {
    await client.connect();
  } catch (error) {
    console.error("[McpAgent] Failed to connect MCP client:", error);
  }

  // Set up Codemode Runtime using MCP clients as servers
  const runtime = await createCodeModeRuntime({
    servers: mcpServers(client),
    limits: {
      timeoutMs: 30000, // 30 seconds for complex multi-tool workflows
      maxToolCalls: 50,
    }
  });

  // Create AI SDK tools from the codemode runtime
  const allTools = await createCodemodeAITools(runtime);

  return new ToolLoopAgent({
    model: createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY })("deepseek-chat"),
    instructions: INSTRUCTIONS,
    tools: allTools as any,
    stopWhen: stepCountIs(20),
  });
}

export type McpAgentUIMessage = InferAgentUIMessage<
  Awaited<ReturnType<typeof createMcpAgent>>
>;

