import { test, expect } from '@playwright/test';
import {
    createListServersToolDefinition,
    createSearchToolDefinition,
    executeMetaTool,
    isMetaTool,
} from '../src/shared/meta-tools';
import { ToolRouter } from '../src/shared/tool-router';

function createRouterClient(
    serverId: string,
    serverName: string,
    tools: Array<{
        name: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
        outputSchema?: Record<string, unknown>;
        _meta?: Record<string, unknown>;
    }>
) {
    return {
        isConnected: () => true,
        getServerId: () => serverId,
        getServerName: () => serverName,
        getSessionId: () => `${serverId}-session`,
        listTools: async () => ({
            tools: tools.map((tool) => ({
                inputSchema: { type: 'object' as const, properties: {} },
                ...tool,
            })),
        }),
        callTool: async (name: string, args: Record<string, unknown>) => ({
            content: [{ type: 'text' as const, text: `${serverName}:${name}:${JSON.stringify(args)}` }],
            isError: false,
        }),
    };
}

test.describe('executeMetaTool', () => {
    test('should expose the generic search tools meta-tool name', async () => {
        expect(createSearchToolDefinition().name).toBe('mcp_search_tools');
        expect(createListServersToolDefinition().name).toBe('mcp_list_servers');
        expect(isMetaTool('mcp_search_tools')).toBe(true);
        expect(isMetaTool('mcp_list_servers')).toBe(true);
    });

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
                outputSchema: {
                    type: 'object',
                    properties: {
                        results: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    title: { type: 'string' },
                                    url: { type: 'string' },
                                },
                                required: ['title', 'url'],
                            },
                        },
                    },
                    required: ['results'],
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
        expect(schema.outputSchema).toEqual({
            type: 'object',
            properties: {
                results: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            title: { type: 'string' },
                            url: { type: 'string' },
                        },
                        required: ['title', 'url'],
                    },
                },
            },
            required: ['results'],
        });
        expect(schema.executionInstructions).toEqual(
            expect.objectContaining({
                nextTool: 'mcp_execute_tool',
                toolName: 'web_search_exa',
                serverId: 'server-123',
            })
        );
        expect(schema.executionInstructions.note).toContain('Do not call this discovered tool directly');
    });

    test('should list every tool from a matching server without search-result truncation', async () => {
        const databaseTools = Array.from({ length: 29 }, (_, index) => ({
            name: `database_tool_${index + 1}`,
            description: `Database capability ${index + 1}`,
        }));
        const router = new ToolRouter([
            createRouterClient('database-server', 'Database MCP', databaseTools) as any,
        ], { strategy: 'search' });

        const result = await executeMetaTool(
            'mcp_search_tools',
            { query: 'database', operation: 'list', serverName: 'database', limit: 100 },
            router
        );

        expect(result?.isError).toBe(false);
        const text = (result?.content[0] as any).text;
        expect(text).toContain('totalCount: 29');
        expect(text).toContain('returnedCount: 29');
        expect(text).toContain('database_tool_1');
        expect(text).toContain('database_tool_29');
    });

    test('should search within a server when serverName is provided', async () => {
        const router = new ToolRouter([
            createRouterClient('database-server', 'Database MCP', [
                { name: 'search_projects', description: 'Search database projects' },
            ]) as any,
            createRouterClient('web-server', 'Web Search', [
                { name: 'web_search', description: 'Search the web' },
            ]) as any,
        ], { strategy: 'search' });

        const result = await executeMetaTool(
            'mcp_search_tools',
            { query: 'search', serverName: 'database', limit: 10 },
            router
        );

        expect(result?.isError).toBe(false);
        const text = (result?.content[0] as any).text;
        expect(text).toContain('search_projects');
        expect(text).not.toContain('web_search');
    });

    test('should not infer unrelated tools for temporal fuzzy questions without direct lexical match', async () => {
        const router = new ToolRouter([
            createRouterClient('web-server', 'Web Search', [
                {
                    name: 'web_search',
                    description: 'Search the web for current information and recent results',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            query: { type: 'string', description: 'Search query' },
                        },
                    },
                },
            ]) as any,
        ], { strategy: 'search' });

        const result = await executeMetaTool(
            'mcp_search_tools',
            { query: "who won yesterday's ipl match", limit: 5 },
            router
        );

        expect(result?.isError).toBe(false);
        const text = (result?.content[0] as any).text;
        expect(text).toContain('Call mcp_list_servers');
    });

    test('should list connected servers for server-aware recovery', async () => {
        const router = new ToolRouter([
            createRouterClient('web-server', 'Web Search', [
                { name: 'web_search', description: 'Search the web' },
            ]) as any,
            createRouterClient('database-server', 'Database MCP', [
                { name: 'list_tables', description: 'List tables' },
            ]) as any,
        ], { strategy: 'search' });

        const result = await executeMetaTool(
            'mcp_list_servers',
            {},
            router
        );

        expect(result?.isError).toBe(false);
        const text = (result?.content[0] as any).text;
        expect(text).toContain('Web Search');
        expect(text).toContain('Database MCP');
        expect(text).toContain('Tool count: 1');
    });

    test('should execute the search tools meta-tool name', async () => {
        const router = new ToolRouter([
            createRouterClient('web-server', 'Web Search', [
                { name: 'web_search', description: 'Search the web' },
            ]) as any,
        ], { strategy: 'search' });

        const result = await executeMetaTool(
            'mcp_search_tools',
            { query: 'web', limit: 5 },
            router
        );

        expect(result?.isError).toBe(false);
        expect((result?.content[0] as any).text).toContain('web_search');
    });

    test('should resolve select queries using serverName fragments', async () => {
        const router = new ToolRouter([
            createRouterClient('database-server', 'Database MCP', [
                { name: 'list_tables', description: 'List database tables' },
            ]) as any,
        ], { strategy: 'search' });

        const result = await executeMetaTool(
            'mcp_search_tools',
            { query: 'select:list_tables', serverName: 'database' },
            router
        );

        expect(result?.isError).toBe(false);
        const text = (result?.content[0] as any).text;
        expect(text).toContain('list_tables');
        expect(text).toContain('Database MCP');
    });

    test.describe('mcp_search_tools edge cases and incorrect arguments', () => {
        test('should handle missing query gracefully (fallback to empty string)', async () => {
            const router = new ToolRouter([
                createRouterClient('database-server', 'Database MCP', [
                    { name: 'list_tables', description: 'List database tables' },
                ]) as any,
            ], { strategy: 'search' });

            const result = await executeMetaTool(
                'mcp_search_tools',
                {}, // No query
                router
            );

            expect(result?.isError).toBe(false);
            const text = (result?.content[0] as any).text;
            expect(typeof text).toBe('string');
        });

        test('should cap overly large limits to max allowed (20 for search)', async () => {
            let capturedLimit = 0;
            const router = {
                searchTools: async (query: string, limit: number) => {
                    capturedLimit = limit;
                    return [];
                }
            };
            
            await executeMetaTool(
                'mcp_search_tools',
                { query: 'test', limit: 9999 },
                router as any
            );
            
            expect(capturedLimit).toBe(20);
        });

        test('should handle invalid limit types by falling back to default (5 for search)', async () => {
            let capturedLimit = 0;
            const router = {
                searchTools: async (query: string, limit: number) => {
                    capturedLimit = limit;
                    return [];
                }
            };
            
            await executeMetaTool(
                'mcp_search_tools',
                { query: 'test', limit: 'invalid_string' },
                router as any
            );
            
            expect(capturedLimit).toBe(5);
        });

        test('should return empty results gracefully when serverName does not match any connected server', async () => {
            const router = new ToolRouter([
                createRouterClient('database-server', 'Database MCP', [
                    { name: 'list_tables', description: 'List database tables' },
                ]) as any,
            ], { strategy: 'search' });

            const result = await executeMetaTool(
                'mcp_search_tools',
                { query: 'list', serverName: 'nonexistent-server' },
                router
            );

            expect(result?.isError).toBe(false);
            const text = (result?.content[0] as any).text;
            expect(text).toContain('No tools found matching your query');
        });

        test('should handle select query with non-existent tools gracefully', async () => {
            const router = new ToolRouter([
                createRouterClient('database-server', 'Database MCP', [
                    { name: 'list_tables', description: 'List database tables' },
                ]) as any,
            ], { strategy: 'search' });

            const result = await executeMetaTool(
                'mcp_search_tools',
                { query: 'select:fake_tool_1,fake_tool_2' },
                router
            );

            expect(result?.isError).toBe(true); // Should be an error if NO tools were found
            const text = (result?.content[0] as any).text;
            expect(text).toContain('Errors resolving some tools');
            expect(text).toContain('fake_tool_1**: Tool not found');
            expect(text).toContain('fake_tool_2**: Tool not found');
        });
    });

    test.describe('pinned tools and excludeTools', () => {
        test('pinned tools are exposed directly in search strategy and omitted from search results', async () => {
            const router = new ToolRouter([
                createRouterClient('web-server', 'Web Search', [
                    { name: 'web_search', description: 'Search the web' },
                    { name: 'web_status', description: 'Report current web search status' },
                ]) as any,
            ], {
                strategy: 'search',
                pinnedTools: ['web_search'],
            });

            const filteredTools = await router.getFilteredTools();
            expect(filteredTools.map((tool) => tool.name)).toContain('web_search');
            expect(filteredTools.map((tool) => tool.name)).toContain('mcp_search_tools');

            const searchResults = await router.searchTools('search', 10);
            expect(searchResults.map((tool) => tool.name)).not.toContain('web_search');
            expect(searchResults.map((tool) => tool.name)).toContain('web_status');

            const regexResults = await router.searchToolsRegex('web_', 10);
            expect(regexResults.map((tool) => tool.name)).not.toContain('web_search');
            expect(regexResults.map((tool) => tool.name)).toContain('web_status');
        });

        test('pinned tools remain resolvable and directly executable in search strategy', async () => {
            const router = new ToolRouter([
                createRouterClient('workflow-server', 'Workflow MCP', [
                    { name: 'codemode_run', description: 'Run codemode scripts' },
                    { name: 'workflow_status', description: 'Report workflow status' },
                ]) as any,
            ], {
                strategy: 'search',
                pinnedTools: ['codemode_run'],
            });

            const filteredTools = await router.getFilteredTools();
            expect(filteredTools.map((tool) => tool.name)).toContain('codemode_run');

            const searchResults = await router.searchTools('codemode', 10);
            expect(searchResults.map((tool) => tool.name)).not.toContain('codemode_run');

            const schema = await router.resolveToolSchema('codemode_run', 'workflow-server');
            expect(schema?.name).toBe('codemode_run');
            expect(schema?.serverId).toBe('workflow-server');

            const result = await router.callTool('codemode_run', { script: 'return 1' }, 'workflow-server');
            expect(result.content[0].text).toContain('Workflow MCP:codemode_run:{"script":"return 1"}');
        });

        test('excludeTools removes exact and glob matches from returned tools and lookup', async () => {
            const router = new ToolRouter([
                createRouterClient('db-server', 'Database MCP', [
                    { name: 'list_tables', description: 'List tables' },
                    { name: 'db_admin_reset', description: 'Reset the database' },
                    { name: 'db_query', description: 'Query the database' },
                ]) as any,
            ], {
                strategy: 'all',
                excludeTools: ['list_tables', 'db_admin*'],
            });

            const filteredTools = await router.getFilteredTools();
            expect(filteredTools.map((tool) => tool.name)).toEqual(['db_query']);

            expect(router.getToolSchema('list_tables')).toBeUndefined();
            expect(router.getToolSchema('db_admin_reset')).toBeUndefined();
            expect(router.getToolSchema('db_query')?.name).toBe('db_query');
        });

        test('excludeTools takes precedence over pinning', async () => {
            const router = new ToolRouter([
                createRouterClient('web-server', 'Web Search', [
                    { name: 'web_search', description: 'Search the web' },
                    { name: 'web_status', description: 'Report current web search status' },
                ]) as any,
            ], {
                strategy: 'search',
                pinnedTools: ['web_search'],
                excludeTools: ['web_search'],
            });

            const filteredTools = await router.getFilteredTools();
            expect(filteredTools.map((tool) => tool.name)).not.toContain('web_search');

            const searchResults = await router.searchTools('search', 10);
            expect(searchResults.map((tool) => tool.name)).not.toContain('web_search');

            expect(router.getToolSchema('web_search')).toBeUndefined();
        });
    });

    test.describe('deferredTools', () => {
        test('deferred tools are omitted from all-strategy direct exposure but remain searchable and callable', async () => {
            const router = new ToolRouter([
                createRouterClient('workflow-server', 'Workflow MCP', [
                    { name: 'workflow_list', description: 'List workflows' },
                    { name: 'codemode_search_mcp_tools', description: 'Search connected MCP tools' },
                ]) as any,
            ], {
                strategy: 'all',
                pinnedTools: ['codemode_search_mcp_tools'],
                deferredTools: ['workflow_list'],
            });

            const filteredTools = await router.getFilteredTools();
            expect(filteredTools.map((tool) => tool.name)).toContain('codemode_search_mcp_tools');
            expect(filteredTools.map((tool) => tool.name)).not.toContain('workflow_list');

            const searchResults = await router.searchTools('workflow', 10);
            expect(searchResults.map((tool) => tool.name)).toContain('workflow_list');

            const schema = router.getToolSchema('workflow_list');
            expect(schema?.name).toBe('workflow_list');

            const resolvedSchema = await router.resolveToolSchema('workflow_list');
            expect(resolvedSchema?.name).toBe('workflow_list');

            const result = await router.callTool('workflow_list', {});
            expect(result.content[0].text).toContain('Workflow MCP:workflow_list:{}');
        });

        test('tool metadata can mark deferred tools without excluding them from search', async () => {
            const router = new ToolRouter([
                createRouterClient('workflow-server', 'Workflow MCP', [
                    {
                        name: 'workflow_run',
                        description: 'Run workflows',
                        _meta: { toolRouter: { deferred: true } } as any,
                    },
                    { name: 'codemode_run', description: 'Run codemode' },
                ]) as any,
            ], {
                strategy: 'all',
                pinnedTools: ['codemode_run'],
            });

            const filteredTools = await router.getFilteredTools();
            expect(filteredTools.map((tool) => tool.name)).toContain('codemode_run');
            expect(filteredTools.map((tool) => tool.name)).not.toContain('workflow_run');

            const searchResults = await router.searchTools('workflow', 10);
            expect(searchResults.map((tool) => tool.name)).toContain('workflow_run');
        });
    });

    test('resolveToolSchema initializes a fresh router before lookup', async () => {
        const router = new ToolRouter([
            createRouterClient('github-server', 'GitHub', [
                { name: 'search_issues', description: 'Search issues' },
            ]) as any,
        ], {
            strategy: 'search',
        });

        expect(router.getToolSchema('search_issues')).toBeUndefined();

        const schema = await router.resolveToolSchema('search_issues', 'github-server');
        expect(schema?.name).toBe('search_issues');
        expect(schema?.serverId).toBe('github-server');
    });
});
