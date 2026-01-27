import { test, expect } from '@playwright/test';
import { AIAdapter } from '../../src/adapters/ai-adapter';
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

test.describe('AIAdapter', () => {
    test('should transform tools correctly', async () => {
        const mockClient = new MockMCPClient() as unknown as MCPClient;
        const adapter = new AIAdapter(mockClient);

        const tools = await adapter.getTools();

        expect(Object.keys(tools)).toHaveLength(1);
        expect(Object.keys(tools)[0]).toContain('tool_testserver_test_tool');
    });

    test('should use custom prefix', async () => {
        const mockClient = new MockMCPClient() as unknown as MCPClient;
        const adapter = new AIAdapter(mockClient, { prefix: 'custom' });

        const tools = await adapter.getTools();

        expect(Object.keys(tools)[0]).toContain('tool_custom_test_tool');
    });

    test('should handle disconnected client', async () => {
        const mockClient = new MockMCPClient() as unknown as MCPClient;
        (mockClient as any).connected = false;

        const adapter = new AIAdapter(mockClient);
        const tools = await adapter.getTools();

        expect(Object.keys(tools)).toHaveLength(0);
    });

    test('static getTools should work', async () => {
        const mockClient = new MockMCPClient() as unknown as MCPClient;
        const tools = await AIAdapter.getTools(mockClient);

        expect(Object.keys(tools)).toHaveLength(1);
    });
});
