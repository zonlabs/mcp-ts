import { test, expect } from '@playwright/test';
import { ToolIndex, type IndexedTool } from '../src/shared/tool-index';

test.describe('ToolIndex', () => {
    test('should return all exact name matches up to topK across servers', async () => {
        const index = new ToolIndex();
        const tools: IndexedTool[] = [
            {
                name: 'search',
                description: 'Search GitHub pull requests and repositories',
                inputSchema: { type: 'object', properties: {} },
                serverName: 'GitHub',
                sessionId: 'github-session',
                serverId: 'github-server',
            },
            {
                name: 'search',
                description: 'Search Slack messages and channels',
                inputSchema: { type: 'object', properties: {} },
                serverName: 'Slack',
                sessionId: 'slack-session',
                serverId: 'slack-server',
            },
        ];

        await index.buildIndex(tools);

        const exactResults = await index.search('search', 2);

        expect(exactResults).toHaveLength(2);
        expect(exactResults.map((r) => r.serverName).sort()).toEqual(['GitHub', 'Slack']);
    });

    test('should keep duplicate tool names searchable per indexed instance', async () => {
        const index = new ToolIndex();
        const tools: IndexedTool[] = [
            {
                name: 'search',
                description: 'Search GitHub pull requests and repositories',
                inputSchema: { type: 'object', properties: {} },
                serverName: 'GitHub',
                sessionId: 'github-session',
                serverId: 'github-server',
            },
            {
                name: 'search',
                description: 'Search Slack messages and channels',
                inputSchema: { type: 'object', properties: {} },
                serverName: 'Slack',
                sessionId: 'slack-session',
                serverId: 'slack-server',
            },
        ];

        await index.buildIndex(tools);

        const githubResults = await index.search('github pull requests', 2);
        const slackResults = await index.search('slack channels', 2);

        expect(githubResults[0].serverName).toBe('GitHub');
        expect(githubResults[0].serverId).toBe('github-server');
        expect(slackResults[0].serverName).toBe('Slack');
        expect(slackResults[0].serverId).toBe('slack-server');
        expect(index.getTool('search')).toHaveLength(2);
    });

    test('should prefer exact namespace matches before fuzzy server names', async () => {
        const index = new ToolIndex();
        const tools: IndexedTool[] = [
            {
                name: 'search',
                description: 'Search GitHub pull requests and repositories',
                inputSchema: { type: 'object', properties: {} },
                serverName: 'GitHub',
                sessionId: 'github-session',
                serverId: 'github',
            },
            {
                name: 'search',
                description: 'Search enterprise GitHub resources',
                inputSchema: { type: 'object', properties: {} },
                serverName: 'GitHub Enterprise',
                sessionId: 'enterprise-session',
                serverId: 'enterprise',
            },
        ];

        await index.buildIndex(tools);

        const results = index.getTool('search', 'github');

        expect(results).toHaveLength(1);
        expect(results[0].serverId).toBe('github');
    });

    test('should require explicit opt-in before matching namespace against serverName fragments', async () => {
        const index = new ToolIndex();
        const tools: IndexedTool[] = [
            {
                name: 'search',
                description: 'Search database tables',
                inputSchema: { type: 'object', properties: {} },
                serverName: 'Database MCP',
                sessionId: 'database-session',
                serverId: 'database-server',
            },
        ];

        await index.buildIndex(tools);

        expect(index.getTool('search', 'database')).toEqual([]);

        const fragmentResults = index.getTool('search', 'database', {
            allowServerNameFragment: true,
        });
        expect(fragmentResults).toHaveLength(1);
        expect(fragmentResults[0].serverName).toBe('Database MCP');
    });

    test('should strip required-term prefixes before embedding query text', async () => {
        let embeddingQueryText: string | null = null;
        const embedFn = async (texts: string[]): Promise<number[][]> => {
            if (texts.length === 1) {
                embeddingQueryText = texts[0];
            }
            return texts.map((text) => [text.length, 1]);
        };

        const index = new ToolIndex({ embedFn });
        const tools: IndexedTool[] = [
            {
                name: 'send_message',
                description: 'Send Slack messages',
                inputSchema: { type: 'object', properties: {} },
                serverName: 'Slack',
                sessionId: 'slack-session',
                serverId: 'slack-server',
            },
            {
                name: 'create_pr',
                description: 'Create GitHub pull requests',
                inputSchema: { type: 'object', properties: {} },
                serverName: 'GitHub',
                sessionId: 'github-session',
                serverId: 'github-server',
            },
        ];

        await index.buildIndex(tools);
        const results = await index.search('+slack send', 5);

        expect(embeddingQueryText).toBe('slack send');
        expect(results[0].serverId).toBe('slack-server');
    });

    test('should search nested argument descriptions in JSON schemas', async () => {
        const index = new ToolIndex();
        const tools: IndexedTool[] = [
            {
                name: 'create_report',
                description: 'Create a report',
                inputSchema: {
                    type: 'object',
                    properties: {
                        options: {
                            type: 'object',
                            properties: {
                                schedule: {
                                    type: 'object',
                                    properties: {
                                        timezone: {
                                            type: 'string',
                                            description: 'IANA timezone for delivery windows',
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                serverName: 'Reports',
                sessionId: 'reports-session',
                serverId: 'reports-server',
            },
        ];

        await index.buildIndex(tools);

        const results = await index.search('IANA timezone delivery', 5);

        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('create_report');
    });

    test('should regex search nested argument names in JSON schemas', async () => {
        const index = new ToolIndex();
        const tools: IndexedTool[] = [
            {
                name: 'create_invoice',
                description: 'Create an invoice',
                inputSchema: {
                    type: 'object',
                    properties: {
                        customer: {
                            type: 'object',
                            properties: {
                                billingAddress: {
                                    type: 'object',
                                    properties: {
                                        postalCode: {
                                            type: 'string',
                                            description: 'Postal code for tax calculation',
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                serverName: 'Billing',
                sessionId: 'billing-session',
                serverId: 'billing-server',
            },
        ];

        await index.buildIndex(tools);

        const results = index.searchRegex('postalcode', 5);

        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('create_invoice');
    });

    test('should keyword search split words from nested camelCase argument names', async () => {
        const index = new ToolIndex();
        const tools: IndexedTool[] = [
            {
                name: 'create_invoice',
                description: 'Create an invoice',
                inputSchema: {
                    type: 'object',
                    properties: {
                        customer: {
                            type: 'object',
                            properties: {
                                billingAddress: {
                                    type: 'object',
                                    properties: {
                                        postalCode: {
                                            type: 'string',
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                serverName: 'Invoices',
                sessionId: 'invoice-session',
                serverId: 'invoice-server',
            },
        ];

        await index.buildIndex(tools);

        const addressResults = await index.search('address', 5);
        const postalResults = await index.search('postal code', 5);

        expect(addressResults).toHaveLength(1);
        expect(addressResults[0].name).toBe('create_invoice');
        expect(postalResults).toHaveLength(1);
        expect(postalResults[0].name).toBe('create_invoice');
    });

    test('should build an index for cyclic JSON schemas', async () => {
        const index = new ToolIndex();
        const inputSchema: Record<string, unknown> = {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query text',
                },
            },
        };
        inputSchema.self = inputSchema;

        const tools: IndexedTool[] = [
            {
                name: 'cyclic_search',
                description: 'Search with a cyclic schema',
                inputSchema: inputSchema as any,
                serverName: 'Search',
                sessionId: 'search-session',
                serverId: 'search-server',
            },
        ];

        await expect(index.buildIndex(tools)).resolves.toBeUndefined();

        const results = await index.search('query text', 5);

        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('cyclic_search');
    });
});
