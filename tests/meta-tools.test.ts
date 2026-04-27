import { test, expect } from '@playwright/test';
import { executeMetaTool } from '../src/shared/meta-tools';

test.describe('executeMetaTool', () => {
    test('should return structured errors for ambiguous schema lookup', async () => {
        const router = {
            getToolSchema: () => {
                throw new Error('Tool "duplicate_tool" is provided by multiple servers. Please specify the desired "serverName" as a namespace.');
            },
        };

        const result = await executeMetaTool(
            'mcp_get_tool_schema',
            { toolName: 'duplicate_tool' },
            router as any
        );

        expect(result?.isError).toBe(true);
        expect((result?.content[0] as any).text).toContain('serverName');
    });

    test('should return structured errors for ambiguous tool execution lookup', async () => {
        const router = {
            getToolSchema: () => {
                throw new Error('Tool "duplicate_tool" is provided by multiple servers. Please specify the desired "serverName" as a namespace.');
            },
        };

        const result = await executeMetaTool(
            'mcp_execute_tool',
            { toolName: 'duplicate_tool', args: {} },
            router as any,
            async () => ({ content: [{ type: 'text', text: 'ok' }], isError: false })
        );

        expect(result?.isError).toBe(true);
        expect((result?.content[0] as any).text).toContain('serverName');
    });

    test('should tell the model to execute discovered tools via mcp_execute_tool', async () => {
        const router = {
            getToolSchema: () => ({
                name: 'web_search_exa',
                description: 'Search the web',
                inputSchema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string' },
                    },
                    required: ['query'],
                },
                serverId: 'server-123',
            }),
        };

        const result = await executeMetaTool(
            'mcp_get_tool_schema',
            { toolName: 'web_search_exa', serverId: 'server-123' },
            router as any
        );

        expect(result?.isError).toBe(false);
        const text = (result?.content[0] as any).text;
        const schema = JSON.parse(text);
        expect(schema.executionInstructions).toEqual(
            expect.objectContaining({
                nextTool: 'mcp_execute_tool',
                toolName: 'web_search_exa',
                serverId: 'server-123',
            })
        );
        expect(schema.executionInstructions.note).toContain('Do not call this discovered tool directly');
    });
});
