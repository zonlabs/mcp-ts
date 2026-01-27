import { test, expect } from '@playwright/test';
import { LangChainAdapter } from '../../src/adapters/langchain-adapter';
import { MCPClient } from '../../src/server/oauth-client';

class MockMCPClient {
    private connected = true;
    private serverId = 'test-server';
    private sessionId = 'test-session';

    isConnected() {
        return this.connected;
    }

    getServerId() {
        return this.serverId;
    }

    getSessionId() {
        return this.sessionId;
    }

    async listTools() {
        return {
            tools: [
                {
                    name: 'test_tool',
                    description: 'A test tool',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {
                            message: { type: 'string' as const }
                        },
                        required: ['message']
                    }
                }
            ]
        };
    }

    async callTool(name: string, args: Record<string, unknown>) {
        return {
            content: [{ type: 'text' as const, text: `Called ${name} with ${JSON.stringify(args)}` }]
        };
    }
}

test.describe('LangChainAdapter', () => {
    test('should transform tools correctly', async () => {
        const mockClient = new MockMCPClient() as unknown as MCPClient;
        const adapter = new LangChainAdapter(mockClient);

        const tools = await adapter.getTools();

        expect(tools).toHaveLength(1);
        expect(tools[0].name).toContain('test-server_test_tool');
    });

    test('should use custom prefix', async () => {
        const mockClient = new MockMCPClient() as unknown as MCPClient;
        const adapter = new LangChainAdapter(mockClient, { prefix: 'custom' });

        const tools = await adapter.getTools();

        expect(tools[0].name).toContain('custom_test_tool');
    });

    test('should handle disconnected client', async () => {
        const mockClient = new MockMCPClient() as unknown as MCPClient;
        (mockClient as any).connected = false;

        const adapter = new LangChainAdapter(mockClient);
        const tools = await adapter.getTools();

        expect(tools).toHaveLength(0);
    });

    test('static getTools should work', async () => {
        const mockClient = new MockMCPClient() as unknown as MCPClient;
        const tools = await LangChainAdapter.getTools(mockClient);

        expect(tools).toHaveLength(1);
    });

    test('should handle errors gracefully with simplifyErrors option', async () => {
        const mockClient = new MockMCPClient() as unknown as MCPClient;
        (mockClient as any).callTool = async () => {
            throw new Error('Test error');
        };

        const adapter = new LangChainAdapter(mockClient, { simplifyErrors: true });
        const tools = await adapter.getTools();

        const result = await tools[0].invoke({ message: 'test' });
        expect(result).toContain('Error:');
    });
});
