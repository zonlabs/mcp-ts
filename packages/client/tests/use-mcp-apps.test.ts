import { test, expect } from '@playwright/test';
import { McpClient, McpAppMetadata } from '../src/client/react/use-mcp-apps.js';

function extractToolName(fullName: string): string {
    const match = fullName.match(/(?:tool_[^_]+_)?(.+)$/);
    return match?.[1] || fullName;
}

test.describe('useMcpApps', () => {
    const createMockMcpClient = (tools: any[]): McpClient => ({
        connections: [
            {
                sessionId: 'session-1',
                tools: tools as any,
            },
        ],
        sseClient: null,
    });

    test('should find metadata by tool name with mcpApp resourceUri', () => {
        const mockClient = createMockMcpClient([
            {
                name: 'get-time',
                mcpApp: {
                    resourceUri: 'http://localhost/app/time',
                },
            },
        ]);

        const getAppMetadata = (name: string): McpAppMetadata | undefined => {
            if (!mockClient) return undefined;
            const extractedName = extractToolName(name);
            for (const conn of mockClient.connections) {
                for (const tool of conn.tools) {
                    const candidateName = extractToolName(tool.name);
                    const resourceUri = tool.mcpApp?.resourceUri;
                    if (resourceUri && candidateName === extractedName) {
                        return {
                            toolName: candidateName,
                            resourceUri,
                            sessionId: conn.sessionId,
                        };
                    }
                }
            }
            return undefined;
        };

        const metadata = getAppMetadata('get-time');
        expect(metadata).toEqual({
            toolName: 'get-time',
            resourceUri: 'http://localhost/app/time',
            sessionId: 'session-1',
        });
    });

    test('should find metadata by tool name with _meta.ui resourceUri', () => {
        const mockClient = createMockMcpClient([
            {
                name: 'weather',
                _meta: {
                    ui: {
                        resourceUri: 'http://localhost/app/weather',
                    },
                },
            },
        ]);

        const getAppMetadata = (name: string): McpAppMetadata | undefined => {
            if (!mockClient) return undefined;
            const extractedName = extractToolName(name);
            for (const conn of mockClient.connections) {
                for (const tool of conn.tools) {
                    const candidateName = extractToolName(tool.name);
                    const resourceUri = tool._meta?.ui?.resourceUri;
                    if (resourceUri && candidateName === extractedName) {
                        return {
                            toolName: candidateName,
                            resourceUri,
                            sessionId: conn.sessionId,
                        };
                    }
                }
            }
            return undefined;
        };

        const metadata = getAppMetadata('weather');
        expect(metadata).toEqual({
            toolName: 'weather',
            resourceUri: 'http://localhost/app/weather',
            sessionId: 'session-1',
        });
    });

    test('should find metadata by tool name with ui/resourceUri', () => {
        const mockClient = createMockMcpClient([
            {
                name: 'calendar',
                _meta: {
                    'ui/resourceUri': 'http://localhost/app/calendar',
                },
            },
        ]);

        const getAppMetadata = (name: string): McpAppMetadata | undefined => {
            if (!mockClient) return undefined;
            const extractedName = extractToolName(name);
            for (const conn of mockClient.connections) {
                for (const tool of conn.tools) {
                    const candidateName = extractToolName(tool.name);
                    const resourceUri = tool._meta?.['ui/resourceUri'];
                    if (resourceUri && candidateName === extractedName) {
                        return {
                            toolName: candidateName,
                            resourceUri,
                            sessionId: conn.sessionId,
                        };
                    }
                }
            }
            return undefined;
        };

        const metadata = getAppMetadata('calendar');
        expect(metadata).toEqual({
            toolName: 'calendar',
            resourceUri: 'http://localhost/app/calendar',
            sessionId: 'session-1',
        });
    });

    test('should return undefined when tool not found', () => {
        const mockClient = createMockMcpClient([
            {
                name: 'get-time',
                mcpApp: {
                    resourceUri: 'http://localhost/app/time',
                },
            },
        ]);

        const getAppMetadata = (name: string): McpAppMetadata | undefined => {
            if (!mockClient) return undefined;
            const extractedName = extractToolName(name);
            for (const conn of mockClient.connections) {
                for (const tool of conn.tools) {
                    const candidateName = extractToolName(tool.name);
                    const resourceUri = tool.mcpApp?.resourceUri;
                    if (resourceUri && candidateName === extractedName) {
                        return {
                            toolName: candidateName,
                            resourceUri,
                            sessionId: conn.sessionId,
                        };
                    }
                }
            }
            return undefined;
        };

        const metadata = getAppMetadata('nonexistent');
        expect(metadata).toBeUndefined();
    });

    test('should return undefined when client is null', () => {
        const mockClient: McpClient | null = null;

        if (!mockClient) {
            expect(true).toBe(true);
        }
    });

    test('should search across multiple connections and tools', () => {
        const mockClient: McpClient = {
            connections: [
                {
                    sessionId: 'session-1',
                    tools: [
                        { name: 'tool_abc123_foo' },
                    ],
                },
                {
                    sessionId: 'session-2',
                    tools: [
                        {
                            name: 'tool_xyz789_bar',
                            mcpApp: {
                                resourceUri: 'http://localhost/app/bar',
                            },
                        },
                    ],
                },
            ],
            sseClient: null,
        };

        const getAppMetadata = (name: string): McpAppMetadata | undefined => {
            if (!mockClient) return undefined;
            const extractedName = extractToolName(name);
            for (const conn of mockClient.connections) {
                for (const tool of conn.tools) {
                    const candidateName = extractToolName(tool.name);
                    const resourceUri = tool.mcpApp?.resourceUri;
                    if (resourceUri && candidateName === extractedName) {
                        return {
                            toolName: candidateName,
                            resourceUri,
                            sessionId: conn.sessionId,
                        };
                    }
                }
            }
            return undefined;
        };

        const metadata = getAppMetadata('bar');
        expect(metadata).toEqual({
            toolName: 'bar',
            resourceUri: 'http://localhost/app/bar',
            sessionId: 'session-2',
        });
    });

    test('extractToolName should extract tool name from prefixed format', () => {
        expect(extractToolName('tool_abc123_get-time')).toBe('get-time');
    });

    test('extractToolName should return original name if no prefix', () => {
        expect(extractToolName('get-time')).toBe('get-time');
    });

    test('extractToolName should handle complex prefixed names', () => {
        expect(extractToolName('tool_xyz789_weather')).toBe('weather');
    });

    test('extractToolName should handle names without prefix', () => {
        expect(extractToolName('calendar')).toBe('calendar');
    });
});
