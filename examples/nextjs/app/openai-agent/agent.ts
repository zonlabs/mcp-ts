import { openai } from '@ai-sdk/openai';
import { ToolLoopAgent, InferAgentUIMessage, stepCountIs } from 'ai';
import { MultiSessionClient } from '@mcp-ts/sdk/server';
import { AIAdapter } from '@mcp-ts/sdk/adapters/ai';

const INSTRUCTIONS = `
You are an expert assistant, an AI assistant that helps users with their tasks using the available MCP tools
`;

export async function createMcpAgent(identity: string = 'demo-user-123') {
    const manager = new MultiSessionClient(identity);

    const notificationSubscription = manager.setNotificationHandlers({
        onProgress: (event) => {
            console.log(`[MCP][progress][${event.serverId}] ${event.progress}/${event.total ?? '?'} ${event.message ?? ''}`);
        },
        onTaskStatus: (event) => {
            console.log(`[MCP][task][${event.serverId}] ${event.taskId ?? 'unknown'} -> ${event.status ?? 'unknown'}`);
        },
    });

    try {
        await manager.connect();
    } catch (error) {
        notificationSubscription.dispose();
        console.error('[MCP] Connection failed:', error);
    }

    const tools = await AIAdapter.getTools(manager);
    console.log(`[MCP] Loaded ${Object.keys(tools).length} tools for agent.`);

    const agent = new ToolLoopAgent({
        model: openai('gpt-4.1-mini'),
        instructions: INSTRUCTIONS,
        tools: tools as any,
        stopWhen: stepCountIs(5),
    });

    // Reference only (optional long-lived pattern):
    // Keep one MultiSessionClient per identity in a process-level map when you need
    // always-on notifications across multiple requests (e.g., inbox watcher workers).
    // In that pattern, DO NOT dispose after each request; dispose on worker shutdown.

    // Optional explicit teardown if your runtime provides a request/session end hook:
    // notificationSubscription.dispose();
    // manager.dispose();

    return agent;
}

export type McpAgentUIMessage = InferAgentUIMessage<Awaited<ReturnType<typeof createMcpAgent>>>;
