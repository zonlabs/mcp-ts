import { checkMcpConnections } from '@/tool/check-mcp-connections';
import { initiateMcpConnection } from '@/tool/initiate-mcp-connection';
import { searchMcpServers } from '@/tool/search-mcp-servers';
import { openai } from '@ai-sdk/openai';
import { ToolLoopAgent, InferAgentUIMessage, stepCountIs } from 'ai';
import { MultiSessionClient } from '@mcp-ts/sdk/server';
import { AIAdapter } from '@mcp-ts/sdk/adapters/ai';

const INSTRUCTIONS = `
You are MCP Assistant, an AI agent that helps users complete tasks by discovering and connecting to Model Context Protocol (MCP) servers.

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
   - Be transparent about what you're doing

## Key Rules

- Be proactive: automatically search and connect when a task needs a specific capability
- Always extract capability keywords from user intent (see MCPASSISTANT_SEARCH_SERVERS tool description for examples)
- Only call MCPASSISTANT_INITIATE_CONNECTION after getting server details from MCPASSISTANT_SEARCH_SERVERS
- Present multiple options if several servers match, let the user choose
- Handle errors gracefully: explain issues clearly and suggest solutions
- Keep responses concise and actionable
`;

export async function createMcpAgent(identity: string = 'demo-user-123') {
  const manager = new MultiSessionClient(identity);

  try {
    await manager.connect();
  } catch (error) {
    console.error('[MCP] Connection failed:', error);
  }

  const mcpTools = await AIAdapter.getTools(manager);
  console.log(`[MCP] Loaded ${Object.keys(mcpTools).length} tools for agent.`);

  const tools: any = {
    MCPASSISTANT_CHECK_ACTIVE_CONNECTIONS: checkMcpConnections,
    MCPASSISTANT_SEARCH_SERVERS: searchMcpServers,
    MCPASSISTANT_INITIATE_CONNECTION: initiateMcpConnection,
    ...mcpTools,
  };

  const agent = new ToolLoopAgent({
    model: openai('gpt-4.1-mini'),
    instructions: INSTRUCTIONS,
    tools: tools,
    stopWhen: stepCountIs(10),
    onFinish: () => {
      manager.disconnect();
    },
  });

  return {
    agent,
    cleanup: () => manager.disconnect(),
  };
}
export type McpAgentUIMessage = InferAgentUIMessage<Awaited<ReturnType<typeof createMcpAgent>>['agent']>;
