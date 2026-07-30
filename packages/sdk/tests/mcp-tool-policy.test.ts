import { test, expect } from '@playwright/test';
import { _setStorageInstanceForTesting } from '../src/server/storage';
import { MemoryStorageBackend } from '../src/server/storage/memory-backend';
import { createToolPolicyGateway } from '../src/server/mcp/tool-policy-gateway';
import { SSEConnectionManager } from '../src/server/handlers/sse-handler';
import { normalizeToolPolicy, normalizeToolPolicyForUpdate } from '../src/server/storage/tool-policy';

function activeSession(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'policy-session',
    userId: 'user-policy',
    serverId: 'github',
    serverName: 'GitHub',
    serverUrl: 'https://example.com/mcp',
    callbackUrl: 'https://app.local/oauth/callback',
    transportType: 'streamable-http' as const,
    createdAt: Date.now(),
    status: 'active' as const,
    ...overrides,
  };
}

function rawClient(overrides: Record<string, unknown> = {}) {
  return {
    isConnected: () => true,
    getSessionId: () => 'policy-session',
    getServerId: () => 'github',
    getServerName: () => 'GitHub',
    fetchTools: async () => [
      { name: 'get_issue', description: 'Read issue' },
      { name: 'create_issue', description: 'Write issue' },
    ],
    listTools: async () => ({
      tools: [
        { name: 'get_issue', description: 'Read issue' },
        { name: 'create_issue', description: 'Write issue' },
      ],
    }),
    callTool: async () => ({ content: [{ type: 'text', text: 'called' }] }),
    disconnect: async () => {},
    ...overrides,
  };
}

test.describe('normalizeToolPolicy', () => {
  const NOW = 1780076500000;

  test('returns undefined for null/undefined input', () => {
    expect(normalizeToolPolicy(undefined, NOW)).toBeUndefined();
    expect(normalizeToolPolicy(null, NOW)).toBeUndefined();
  });

  test('returns undefined for non-object input', () => {
    expect(normalizeToolPolicy('string' as any, NOW)).toBeUndefined();
    expect(normalizeToolPolicy(42 as any, NOW)).toBeUndefined();
  });

  test('preserves valid allowlist policy', () => {
    expect(normalizeToolPolicy({
      mode: 'allowlist',
      toolIds: ['server::tool_a', 'server::tool_b'],
      updatedAt: NOW,
    }, NOW)).toEqual({
      mode: 'allowlist',
      toolIds: ['server::tool_a', 'server::tool_b'],
      updatedAt: NOW,
    });
  });

  test('preserves valid denylist policy', () => {
    expect(normalizeToolPolicy({
      mode: 'denylist',
      toolIds: ['server::tool_a'],
      updatedAt: NOW,
    }, NOW)).toEqual({
      mode: 'denylist',
      toolIds: ['server::tool_a'],
      updatedAt: NOW,
    });
  });

  test('converts empty denylist to all', () => {
    expect(normalizeToolPolicy({
      mode: 'denylist',
      toolIds: [],
      updatedAt: NOW,
    }, NOW)).toEqual({ mode: 'all', toolIds: [], updatedAt: NOW });
  });

  test('converts empty allowlist to all', () => {
    expect(normalizeToolPolicy({
      mode: 'allowlist',
      toolIds: [],
      updatedAt: NOW,
    }, NOW)).toEqual({ mode: 'all', toolIds: [], updatedAt: NOW });
  });

  test('falls back to all for invalid mode', () => {
    expect(normalizeToolPolicy({
      mode: 'invalid',
      toolIds: ['server::tool_a'],
      updatedAt: NOW,
    }, NOW)).toEqual({ mode: 'all', toolIds: [], updatedAt: NOW });
  });

  test('falls back to all for missing mode', () => {
    expect(normalizeToolPolicy({
      toolIds: ['server::tool_a'],
      updatedAt: NOW,
    }, NOW)).toEqual({ mode: 'all', toolIds: [], updatedAt: NOW });
  });

  test('deduplicates and cleans toolIds', () => {
    expect(normalizeToolPolicy({
      mode: 'denylist',
      toolIds: ['a', 'b', 'a', '', 'c', '  '],
      updatedAt: NOW,
    }, NOW)).toEqual({
      mode: 'denylist',
      toolIds: ['a', 'b', 'c'],
      updatedAt: NOW,
    });
  });

  test('handles non-array toolIds', () => {
    expect(normalizeToolPolicy({
      mode: 'denylist',
      toolIds: 'not-an-array',
      updatedAt: NOW,
    }, NOW)).toEqual({ mode: 'all', toolIds: [], updatedAt: NOW });
  });

  test('all mode always produces empty toolIds', () => {
    expect(normalizeToolPolicy({
      mode: 'all',
      toolIds: ['server::tool_a', 'server::tool_b'],
      updatedAt: NOW,
    }, NOW)).toEqual({ mode: 'all', toolIds: [], updatedAt: NOW });
  });

  test('falls back updatedAt to now when missing', () => {
    const before = Date.now();
    const result = normalizeToolPolicy({ mode: 'all' });
    const after = Date.now();
    expect(result?.updatedAt).toBeGreaterThanOrEqual(before);
    expect(result?.updatedAt).toBeLessThanOrEqual(after);
  });

  test('falls back updatedAt to now when invalid', () => {
    const result = normalizeToolPolicy({ mode: 'all', updatedAt: 'invalid' as any });
    expect(typeof result?.updatedAt).toBe('number');
  });
});

test.describe('normalizeToolPolicyForUpdate', () => {
  const NOW = 1780076500000;

  test('returns fallback all policy for null input', () => {
    expect(normalizeToolPolicyForUpdate(null, NOW)).toEqual({
      mode: 'all', toolIds: [], updatedAt: NOW,
    });
  });

  test('returns fallback all policy for undefined input', () => {
    expect(normalizeToolPolicyForUpdate(undefined, NOW)).toEqual({
      mode: 'all', toolIds: [], updatedAt: NOW,
    });
  });

  test('delegates to normalizeToolPolicy for valid input', () => {
    expect(normalizeToolPolicyForUpdate({
      mode: 'denylist',
      toolIds: ['server::tool_a'],
      updatedAt: NOW,
    }, NOW)).toEqual({
      mode: 'denylist',
      toolIds: ['server::tool_a'],
      updatedAt: NOW,
    });
  });
});

test.describe('MCP session tool policy', () => {
  test.afterEach(() => {
    _setStorageInstanceForTesting(null);
  });

  test('ToolPolicyGateway listTools filters tools with allowlist policy', async () => {
    const storage = new MemoryStorageBackend();
    _setStorageInstanceForTesting(storage);
    await storage.create(activeSession({
      toolPolicy: {
        mode: 'allowlist',
        toolIds: ['github::get_issue'],
        updatedAt: 1780076500000,
      },
    }) as any);

    const gateway = createToolPolicyGateway('user-policy', 'policy-session', rawClient() as any);

    const result = await gateway.listTools({ filtered: true });

    expect(result.tools.map((tool) => tool.name)).toEqual(['get_issue']);
  });

  test('ToolPolicyGateway listTools filters tools with denylist policy', async () => {
    const storage = new MemoryStorageBackend();
    _setStorageInstanceForTesting(storage);
    await storage.create(activeSession({
      toolPolicy: {
        mode: 'denylist',
        toolIds: ['github::create_issue'],
        updatedAt: 1780076500000,
      },
    }) as any);

    const gateway = createToolPolicyGateway('user-policy', 'policy-session', rawClient() as any);

    const result = await gateway.listTools({ filtered: true });

    expect(result.tools.map((tool) => tool.name)).toEqual(['get_issue']);
  });

  test('ToolPolicyGateway callTool rejects tools outside allowlist before downstream request', async () => {
    const storage = new MemoryStorageBackend();
    _setStorageInstanceForTesting(storage);
    await storage.create(activeSession({
      toolPolicy: {
        mode: 'allowlist',
        toolIds: ['github::get_issue'],
        updatedAt: 1780076500000,
      },
    }) as any);

    let downstreamCalls = 0;
    const gateway = createToolPolicyGateway('user-policy', 'policy-session', rawClient({
      callTool: async () => {
        downstreamCalls += 1;
        return { content: [{ type: 'text', text: 'called' }] };
      },
    }) as any);

    await expect(gateway.callTool('create_issue', {})).rejects.toThrow(
      'Tool "create_issue" was blocked by your MCP tool access policy'
    );
    expect(downstreamCalls).toBe(0);
  });

  test('SSE listSessions includes toolPolicy and setToolPolicy persists changes', async () => {
    const storage = new MemoryStorageBackend();
    _setStorageInstanceForTesting(storage);
    await storage.create(activeSession() as any);

    const manager = new SSEConnectionManager({ userId: 'user-policy' }, () => {});
    (manager as any).clients.set('policy-session', rawClient());

    const update = await manager.handleRequest({
      id: 'update-policy',
      method: 'setToolPolicy',
      params: {
        sessionId: 'policy-session',
        toolPolicy: {
          mode: 'allowlist',
          toolIds: ['github::get_issue'],
        },
      },
    } as any);

    expect((update as any).error).toBeUndefined();
    expect((update as any).result.toolPolicy).toEqual({
      mode: 'allowlist',
      toolIds: ['github::get_issue'],
      updatedAt: expect.any(Number),
    });
    expect((update as any).result.tools.map((tool: { name: string }) => tool.name)).toEqual(['get_issue']);

    const list = await manager.handleRequest({
      id: 'list-sessions',
      method: 'listSessions',
    } as any);

    expect((list as any).error).toBeUndefined();
    expect((list as any).result.sessions[0].toolPolicy).toEqual(
      (update as any).result.toolPolicy
    );

    const access = await manager.handleRequest({
      id: 'tool-access',
      method: 'getToolPolicy',
      params: { sessionId: 'policy-session' },
    } as any);

    expect((access as any).error).toBeUndefined();
    expect((access as any).result.tools.map((tool: { name: string; toolId: string; allowed: boolean }) => ({
      name: tool.name,
      toolId: tool.toolId,
      allowed: tool.allowed,
    }))).toEqual([
      { name: 'get_issue', toolId: 'github::get_issue', allowed: true },
      { name: 'create_issue', toolId: 'github::create_issue', allowed: false },
    ]);

    await manager.dispose();
  });

  test('SSE callTool rejects blocked tools before downstream request', async () => {
    const storage = new MemoryStorageBackend();
    _setStorageInstanceForTesting(storage);
    await storage.create(activeSession({
      toolPolicy: {
        mode: 'denylist',
        toolIds: ['github::create_issue'],
        updatedAt: 1780076500000,
      },
    }) as any);

    let downstreamCalls = 0;
    const manager = new SSEConnectionManager({ userId: 'user-policy' }, () => {});
    (manager as any).clients.set('policy-session', rawClient({
      callTool: async () => {
        downstreamCalls += 1;
        return { content: [{ type: 'text', text: 'called' }] };
      },
    }));

    const response = await manager.handleRequest({
      id: 'call-policy',
      method: 'callTool',
      params: {
        sessionId: 'policy-session',
        toolName: 'create_issue',
        toolArgs: {},
      },
    } as any);

    expect((response as any).result).toBeUndefined();
    expect((response as any).error?.message).toBe('Tool "create_issue" was blocked by your MCP tool access policy (denylist).');
    expect(downstreamCalls).toBe(0);

    await manager.dispose();
  });
});


