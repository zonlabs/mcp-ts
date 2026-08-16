import { test, expect } from '@playwright/test';

test.describe('ToolRouter benchmark script', () => {
  test('calculates context efficiency and renders a markdown report', async () => {
    // @ts-ignore
    const benchmark = await import('../../../benchmarks/toolrouter-efficiency.mjs');

    const result = await benchmark.runScenario({
      toolCount: 100,
      searchIterations: 25,
    });

    expect(result.fullUpfrontTokens).toBeGreaterThan(result.toolRouterInitialTokens);
    expect(result.initialReductionPercent).toBeGreaterThan(90);
    expect(result.oneToolTaskReductionPercent).toBeGreaterThan(90);
    expect(result.searchLatency.p95Ms).toBeGreaterThanOrEqual(result.searchLatency.p50Ms);

    const report = benchmark.formatMarkdownReport({
      generatedAt: '2026-04-28T00:00:00.000Z',
      environment: {
        node: 'v-test',
        platform: 'test-platform',
        cpu: 'test-cpu',
      },
      methodology: 'test methodology',
      scenarios: [result],
    });

    expect(report).toContain('# ToolRouter Efficiency Benchmark');
    expect(report).toContain('| Tools | Load all upfront | ToolRouter initial | Initial reduction |');
    expect(report).toContain('100');
    expect(report).toContain('%');
  });

  test('collects live tool catalogs and redacts fixtures by default', async () => {
    // @ts-ignore
    const liveBenchmark = await import('../../../benchmarks/toolrouter-live.mjs');

    const clients = [
      {
        isConnected: () => true,
        getServerName: () => 'exa',
        getServerId: () => 'exa-server',
        getSessionId: () => 'session-exa',
        listTools: async () => ({
          tools: [
            {
              name: 'web_search',
              description: 'Search the web',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Search query' },
                },
              },
            },
          ],
        }),
      },
      {
        isConnected: () => true,
        getServerName: () => 'neon',
        getServerId: () => 'neon-server',
        getSessionId: () => 'session-neon',
        listTools: async () => ({
          tools: [
            {
              name: 'list_projects',
              description: 'List Neon projects',
              inputSchema: { type: 'object', properties: {} },
            },
            {
              name: 'run_sql',
              description: 'Run SQL',
              inputSchema: { type: 'object', properties: { sql: { type: 'string' } } },
            },
          ],
        }),
      },
      {
        isConnected: () => false,
        getServerName: () => 'ignored',
        listTools: async () => {
          throw new Error('should not be called');
        },
      },
    ];

    const catalog = await liveBenchmark.collectToolsFromClients(clients);
    const fixture = liveBenchmark.createFixture(catalog, { includeSchemas: false });

    expect(catalog.tools).toHaveLength(3);
    expect(catalog.serverCounts).toEqual([
      { serverName: 'exa', serverId: 'exa-server', sessionId: 'session-exa', toolCount: 1 },
      { serverName: 'neon', serverId: 'neon-server', sessionId: 'session-neon', toolCount: 2 },
    ]);
    expect(fixture.tools[0]).not.toHaveProperty('inputSchema');
    expect(fixture.tools[0]).toEqual(
      expect.objectContaining({
        name: 'web_search',
        serverName: 'exa',
        serverId: 'exa-server',
      })
    );
  });

  test('parses env file content without overriding existing process values', async () => {
    // @ts-ignore
    const liveBenchmark = await import('../../../benchmarks/toolrouter-live.mjs');

    const parsed = liveBenchmark.parseEnvContent(`
NEXT_PUBLIC_MCP_USER_ID=real-user
SUPABASE_URL="https://example.supabase.co"
# ignored
EMPTY=
`);

    expect(parsed).toEqual({
      NEXT_PUBLIC_MCP_USER_ID: 'real-user',
      SUPABASE_URL: 'https://example.supabase.co',
      EMPTY: '',
    });
  });
});
