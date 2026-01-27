import { openai } from '@ai-sdk/openai';
import { ToolLoopAgent, InferAgentUIMessage, stepCountIs } from 'ai';
import { MultiSessionClient } from '@mcp-ts/sdk/server';
import { AIAdapter } from '@mcp-ts/sdk/adapters/ai';

const INSTRUCTIONS = `
You are an expert assistant, an AI assistant that helps users with their tasks using the available MCP tools
`;

export async function createMcpAgent(identity: string = 'demo-user-123') {
    const manager = new MultiSessionClient(identity);

    try {
        await manager.connect();
    } catch (error) {
        console.error("[MCP] Connection failed:", error);
    }

    const tools = await AIAdapter.getTools(manager);

    return new ToolLoopAgent({
        model: openai('gpt-4.1-mini'),
        instructions: INSTRUCTIONS,
        tools: tools,
        stopWhen: stepCountIs(5),
    });
}
export type McpAgentUIMessage = InferAgentUIMessage<Awaited<ReturnType<typeof createMcpAgent>>>;