import { test, expect } from '@playwright/test';
import { SSEConnectionManager } from '../src/server/handlers/sse-handler';
import { _setStorageInstanceForTesting } from '../src/server/storage';
import { MemoryStorageBackend } from '../src/server/storage/memory-backend';
import { McpClient } from '../src/server/mcp/client';

test.describe('SSEConnectionManager connect duplicate handling', () => {
  test.afterEach(() => {
    _setStorageInstanceForTesting(null);
  });

  test('resumes pending-auth duplicate session instead of throwing duplicate error', async () => {
    const storage = new MemoryStorageBackend();
    _setStorageInstanceForTesting(storage);

    await storage.create({
      sessionId: 'existing-session',
      userId: 'user-1',
      serverId: 'srv-1',
      serverName: 'Server One',
      serverUrl: 'https://example.com/mcp',
      callbackUrl: 'https://app.local/oauth/callback',
      serverOptions: { transport: { type: 'streamable-http' } },
      createdAt: Date.now(),
      status: 'pending',
    });

    const manager = new SSEConnectionManager(
      { userId: 'user-1' },
      () => { }
    );

    let resumedSessionId: string | null = null;
    (manager as any).getSession = async ({ sessionId }: { sessionId: string }) => {
      resumedSessionId = sessionId;
      return { success: true, toolCount: 0 };
    };

    const response = await manager.handleRequest({
      id: '1',
      method: 'connect',
      params: {
        serverId: 'srv-1',
        serverName: 'Server One',
        serverUrl: 'https://example.com/mcp',
        callbackUrl: 'https://app.local/oauth/callback',
      },
    } as any);

    expect((response as any).error).toBeUndefined();
    expect((response as any).result).toEqual({
      sessionId: 'existing-session',
      success: true,
    });
    expect(resumedSessionId).toBe('existing-session');

    manager.dispose();
  });

  test('still throws duplicate error for already active sessions', async () => {
    const storage = new MemoryStorageBackend();
    _setStorageInstanceForTesting(storage);

    await storage.create({
      sessionId: 'existing-active',
      userId: 'user-2',
      serverId: 'srv-2',
      serverName: 'Server Two',
      serverUrl: 'https://example.com/mcp-active',
      callbackUrl: 'https://app.local/oauth/callback',
      serverOptions: { transport: { type: 'streamable-http' } },
      createdAt: Date.now(),
      status: 'active',
    });

    const manager = new SSEConnectionManager(
      { userId: 'user-2' },
      () => { }
    );

    const response = await manager.handleRequest({
      id: '2',
      method: 'connect',
      params: {
        serverId: 'srv-2',
        serverName: 'Server Two',
        serverUrl: 'https://example.com/mcp-active',
        callbackUrl: 'https://app.local/oauth/callback',
      },
    } as any);

    expect((response as any).result).toBeUndefined();
    expect((response as any).error?.message).toContain('Connection already exists');

    manager.dispose();
  });

  test('listSessions includes created and updated timestamps', async () => {
    const storage = new MemoryStorageBackend();
    _setStorageInstanceForTesting(storage);

    await storage.create({
      sessionId: 'timestamped-session',
      userId: 'user-timestamps',
      serverId: 'srv-timestamps',
      serverName: 'Timestamped Server',
      serverUrl: 'https://example.com/mcp-timestamps',
      callbackUrl: 'https://app.local/oauth/callback',
      serverOptions: { transport: { type: 'streamable-http' } },
      createdAt: 1780076200000,
      updatedAt: 1780076300000,
      status: 'active',
    });

    const manager = new SSEConnectionManager(
      { userId: 'user-timestamps' },
      () => { }
    );

    const response = await manager.handleRequest({
      id: 'timestamps',
      method: 'listSessions',
    } as any);

    expect((response as any).error).toBeUndefined();
    expect((response as any).result.sessions).toEqual([
      expect.objectContaining({
        sessionId: 'timestamped-session',
        createdAt: 1780076200000,
        updatedAt: 1780076300000,
      }),
    ]);

    manager.dispose();
  });

  test('rehydrated RPC client reuses stored transport metadata', async () => {
    const storage = new MemoryStorageBackend();
    _setStorageInstanceForTesting(storage);

    await storage.create({
      sessionId: 'resource-session',
      userId: 'user-3',
      serverId: 'srv-3',
      serverName: 'Server Three',
      serverUrl: 'https://example.com/mcp-resource',
      callbackUrl: 'https://app.local/oauth/callback',
      serverOptions: { transport: { type: 'streamable-http' } },
      createdAt: Date.now(),
      status: 'active',
    });

    const manager = new SSEConnectionManager(
      { userId: 'user-3' },
      () => { }
    );

    const originalConnect = (McpClient.prototype as any).connect;
    const originalReadResource = (McpClient.prototype as any).readResource;

    const seenOptions: Array<{
      serverId?: string;
      serverName?: string;
      serverUrl?: string;
      callbackUrl?: string;
      transport?: { type?: string };
    }> = [];

    (McpClient.prototype as any).connect = async function () {
      seenOptions.push({
        serverId: (this as any).config.serverId,
        serverName: (this as any).config.serverName,
        serverUrl: (this as any).config.serverUrl,
        callbackUrl: (this as any).config.callbackUrl,
        transport: (this as any).config.transport,
      });
    };

    (McpClient.prototype as any).readResource = async function (uri: string) {
      return { contents: [{ uri, text: 'ok' }] };
    };

    try {
      const response = await manager.handleRequest({
        id: '3',
        method: 'readResource',
        params: {
          sessionId: 'resource-session',
          uri: 'ui://workflow-engine/dashboard.html',
        },
      } as any);

      expect((response as any).error).toBeUndefined();
      expect((response as any).result).toEqual({
        contents: [{ uri: 'ui://workflow-engine/dashboard.html', text: 'ok' }],
      });
      expect(seenOptions).toEqual([{
        serverId: 'srv-3',
        serverName: 'Server Three',
        serverUrl: 'https://example.com/mcp-resource',
        callbackUrl: 'https://app.local/oauth/callback',
        transport: { type: 'streamable-http' },
      }]);
    } finally {
      (McpClient.prototype as any).connect = originalConnect;
      (McpClient.prototype as any).readResource = originalReadResource;
      manager.dispose();
    }
  });

  test('passes custom headers from connect params into the MCP client', async () => {
    const storage = new MemoryStorageBackend();
    _setStorageInstanceForTesting(storage);

    const manager = new SSEConnectionManager(
      { userId: 'user-4' },
      () => { }
    );

    const originalConnect = (McpClient.prototype as any).connect;
    const originalListTools = (McpClient.prototype as any).listTools;
    const originalFetchTools = (McpClient.prototype as any).fetchTools;

    let seenHeaders: Record<string, string> | undefined;

    (McpClient.prototype as any).connect = async function () {
      seenHeaders = (this as any).config.headers;
      await storage.create({
        sessionId: (this as any).config.sessionId,
        userId: (this as any).config.userId,
        serverId: (this as any).config.serverId,
        serverUrl: (this as any).config.serverUrl,
        callbackUrl: (this as any).config.callbackUrl,
        serverOptions: { transport: { type: (this as any).config.transport?.type || 'streamable-http' } },
        createdAt: Date.now(),
        status: 'active',
      });
    };

    (McpClient.prototype as any).listTools = async function () {
      return { tools: [] };
    };

    (McpClient.prototype as any).fetchTools = async function () {
      return { tools: [] };
    };

    try {
      const response = await manager.handleRequest({
        id: '4',
        method: 'connect',
        params: {
          serverId: 'srv-4',
          serverName: 'Server Four',
          serverUrl: 'https://example.com/mcp-headers',
          callbackUrl: 'https://app.local/oauth/callback',
          headers: {
            Authorization: 'Bearer github_pat_test',
            'X-Empty': '',
          },
        },
      } as any);

      expect((response as any).error).toBeUndefined();
      expect(seenHeaders).toEqual({
        Authorization: 'Bearer github_pat_test',
      });
    } finally {
      (McpClient.prototype as any).connect = originalConnect;
      (McpClient.prototype as any).listTools = originalListTools;
      (McpClient.prototype as any).fetchTools = originalFetchTools;
      manager.dispose();
    }
  });

  test('finishAuth accepts raw OAuth state and passes it to the MCP client', async () => {
    const storage = new MemoryStorageBackend();
    _setStorageInstanceForTesting(storage);

    await storage.create({
      sessionId: 'auth-session',
      userId: 'user-5',
      serverId: 'srv-5',
      serverName: 'Server Five',
      serverUrl: 'https://example.com/mcp-auth',
      callbackUrl: 'https://app.local/oauth/callback',
      serverOptions: { transport: { type: 'streamable-http' } },
      createdAt: Date.now(),
      status: 'pending',
    });
    await storage.patchCredentials('user-5', 'auth-session', {
      oauthState: {
        nonce: 'nonce123',
        sessionId: 'auth-session',
        serverId: 'srv-5',
        createdAt: Date.now(),
      },
    });

    const manager = new SSEConnectionManager(
      { userId: 'user-5' },
      () => { }
    );

    const originalFinishAuth = (McpClient.prototype as any).finishAuth;
    const originalListTools = (McpClient.prototype as any).listTools;
    const originalFetchTools = (McpClient.prototype as any).fetchTools;
    let seenCode: string | undefined;
    let seenState: string | undefined;

    (McpClient.prototype as any).finishAuth = async function (code: string, state?: string) {
      seenCode = code;
      seenState = state;
    };

    (McpClient.prototype as any).listTools = async function () {
      return { tools: [] };
    };

    (McpClient.prototype as any).fetchTools = async function () {
      return { tools: [] };
    };

    try {
      const response = await manager.handleRequest({
        id: '5',
        method: 'finishAuth',
        params: {
          state: 'nonce123.auth-session',
          code: 'auth-code',
        },
      } as any);

      expect((response as any).error).toBeUndefined();
      expect((response as any).result).toEqual({ success: true, toolCount: 0 });
      expect(seenCode).toBe('auth-code');
      expect(seenState).toBe('nonce123.auth-session');
    } finally {
      (McpClient.prototype as any).finishAuth = originalFinishAuth;
      (McpClient.prototype as any).listTools = originalListTools;
      (McpClient.prototype as any).fetchTools = originalFetchTools;
      manager.dispose();
    }
  });

  test('dispatches listResourceTemplates to McpClient', async () => {
    const storage = new MemoryStorageBackend();
    _setStorageInstanceForTesting(storage);

    await storage.create({
      sessionId: 'lrt-session',
      userId: 'user-lrt',
      serverId: 'srv-lrt',
      serverName: 'Server LRT',
      serverUrl: 'https://example.com/mcp-lrt',
      callbackUrl: 'https://app.local/oauth/callback',
      serverOptions: { transport: { type: 'streamable-http' } },
      createdAt: Date.now(),
      status: 'active',
    });

    const manager = new SSEConnectionManager(
      { userId: 'user-lrt' },
      () => { }
    );

    const originalConnect = (McpClient.prototype as any).connect;
    const originalListResourceTemplates = (McpClient.prototype as any).listResourceTemplates;

    (McpClient.prototype as any).connect = async function () { };

    (McpClient.prototype as any).listResourceTemplates = async function () {
      return {
        resourceTemplates: [
          {
            uriTemplate: 'file:///{path}',
            name: 'File Resource',
            description: 'Access files on the server',
            mimeType: 'text/plain',
          },
        ],
      };
    };

    try {
      const response = await manager.handleRequest({
        id: 'lrt-1',
        method: 'listResourceTemplates',
        params: { sessionId: 'lrt-session' },
      } as any);

      expect((response as any).error).toBeUndefined();
      expect((response as any).result).toEqual({
        resourceTemplates: [
          {
            uriTemplate: 'file:///{path}',
            name: 'File Resource',
            description: 'Access files on the server',
            mimeType: 'text/plain',
          },
        ],
      });
    } finally {
      (McpClient.prototype as any).connect = originalConnect;
      (McpClient.prototype as any).listResourceTemplates = originalListResourceTemplates;
      manager.dispose();
    }
  });

  test('handles listResourceTemplates with empty result from server', async () => {
    const storage = new MemoryStorageBackend();
    _setStorageInstanceForTesting(storage);

    await storage.create({
      sessionId: 'lrt-empty',
      userId: 'user-lrt-empty',
      serverId: 'srv-lrt-empty',
      serverName: 'Server LRT Empty',
      serverUrl: 'https://example.com/mcp-lrt-empty',
      callbackUrl: 'https://app.local/oauth/callback',
      serverOptions: { transport: { type: 'streamable-http' } },
      createdAt: Date.now(),
      status: 'active',
    });

    const manager = new SSEConnectionManager(
      { userId: 'user-lrt-empty' },
      () => { }
    );

    const originalConnect = (McpClient.prototype as any).connect;
    const originalListResourceTemplates = (McpClient.prototype as any).listResourceTemplates;

    (McpClient.prototype as any).connect = async function () { };

    (McpClient.prototype as any).listResourceTemplates = async function () {
      return { resourceTemplates: [] };
    };

    try {
      const response = await manager.handleRequest({
        id: 'lrt-2',
        method: 'listResourceTemplates',
        params: { sessionId: 'lrt-empty' },
      } as any);

      expect((response as any).error).toBeUndefined();
      expect((response as any).result).toEqual({ resourceTemplates: [] });
    } finally {
      (McpClient.prototype as any).connect = originalConnect;
      (McpClient.prototype as any).listResourceTemplates = originalListResourceTemplates;
      manager.dispose();
    }
  });
});
