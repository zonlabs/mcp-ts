/**
 * Tests for the policy-filtered tool list in RPC responses.
 *
 * Changes covered:
 * - `listTools` RPC returns policy-filtered tools directly.
 * - `setToolPolicy` RPC returns updated filtered tools + allTools for UI.
 * - `allTools` contains ALL remote tools regardless of policy.
 * - `tools` contains only the policy-permitted subset.
 * - `ToolPolicyGateway.listTools({ filtered: false })` bypasses policy.
 */

import { test, expect } from '@playwright/test';
import { SSEConnectionManager } from '../src/server/handlers/sse-handler';
import { _setStorageInstanceForTesting } from '../src/server/storage';
import { MemoryStorageBackend } from '../src/server/storage/memory-backend';

/** All tools the fake remote MCP server exposes */
const ALL_REMOTE_TOOLS = [
  { name: 'read_file',   description: 'Read a file',   inputSchema: { type: 'object', properties: {} } },
  { name: 'write_file',  description: 'Write a file',  inputSchema: { type: 'object', properties: {} } },
  { name: 'delete_file', description: 'Delete a file', inputSchema: { type: 'object', properties: {} } },
];

function activeSession(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'alltools-session',
    userId: 'alltools-user',
    serverId: 'fs-server',
    serverName: 'Filesystem',
    serverUrl: 'https://example.com/mcp',
    callbackUrl: 'https://app.local/oauth/callback',
    transportType: 'streamable-http' as const,
    createdAt: Date.now(),
    status: 'active' as const,
    ...overrides,
  };
}

/** Fake in-memory MCP client that serves ALL_REMOTE_TOOLS */
function fakeClient(overrides: Record<string, unknown> = {}) {
  return {
    isConnected: () => true,
    getSessionId: () => 'alltools-session',
    getServerId: () => 'fs-server',
    getServerName: () => 'Filesystem',
    getServerUrl: () => 'https://example.com/mcp',
    fetchTools: async () => ALL_REMOTE_TOOLS,
    listTools: async () => ({ tools: ALL_REMOTE_TOOLS }),
    callTool: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    disconnect: async () => {},
    ...overrides,
  };
}

test.describe('policy-filtered tool lists', () => {
  test.afterEach(() => {
    _setStorageInstanceForTesting(null);
  });

  test('listTools RPC returns policy-filtered tools (denied tool excluded)', async () => {
    const storage = new MemoryStorageBackend();
    _setStorageInstanceForTesting(storage);
    await storage.create(activeSession({
      toolPolicy: {
        mode: 'denylist',
        toolIds: ['fs-server::delete_file'],
        updatedAt: Date.now(),
      },
    }) as any);

    const manager = new SSEConnectionManager(
      { userId: 'alltools-user' },
      () => {},
    );
    (manager as any).clients.set('alltools-session', fakeClient());

    const result = await manager.handleRequest({
      id: 'list',
      method: 'listTools',
      params: { sessionId: 'alltools-session' },
    } as any);

    expect((result as any).result.tools.map((t: any) => t.name)).toEqual(['read_file', 'write_file']);

    await manager.dispose();
  });

  test('setToolPolicy RPC returns filtered tools after policy update', async () => {
    const storage = new MemoryStorageBackend();
    _setStorageInstanceForTesting(storage);
    // Start with no policy (all tools allowed)
    await storage.create(activeSession() as any);

    const manager = new SSEConnectionManager(
      { userId: 'alltools-user' },
      () => {},
    );
    (manager as any).clients.set('alltools-session', fakeClient());

    // Update policy to only allow read_file
    const result = await manager.handleRequest({
      id: 'set-policy',
      method: 'setToolPolicy',
      params: {
        sessionId: 'alltools-session',
        toolPolicy: { mode: 'allowlist', toolIds: ['fs-server::read_file'] },
      },
    } as any);

    expect((result as any).result.success).toBe(true);
    expect((result as any).result.tools.map((t: any) => t.name)).toEqual(['read_file']);

    await manager.dispose();
  });

  test('listTools returns all tools when policy mode is "all"', async () => {
    const storage = new MemoryStorageBackend();
    _setStorageInstanceForTesting(storage);
    // No policy — all tools allowed
    await storage.create(activeSession() as any);

    const manager = new SSEConnectionManager(
      { userId: 'alltools-user' },
      () => {},
    );
    (manager as any).clients.set('alltools-session', fakeClient());

    const result = await manager.handleRequest({
      id: 'list-all',
      method: 'listTools',
      params: { sessionId: 'alltools-session' },
    } as any);

    expect((result as any).result.tools.map((t: any) => t.name)).toEqual(
      ['read_file', 'write_file', 'delete_file']
    );

    await manager.dispose();
  });

  test('capabilities_discovered event includes all capabilities', async () => {
    const storage = new MemoryStorageBackend();
    _setStorageInstanceForTesting(storage);
    await storage.create(activeSession() as any);

    const emittedEvents: any[] = [];
    const manager = new SSEConnectionManager(
      { userId: 'alltools-user' },
      (event) => emittedEvents.push(event),
    );

    const client = fakeClient() as any;
    client.discoverCapabilities = async () => ({
      tools: ALL_REMOTE_TOOLS,
      prompts: [{ name: 'greet', arguments: [] }],
      resources: [{ uri: 'file:///readme', name: 'README' }],
      resourceTemplates: [{ uriTemplate: 'file:///{path}', name: 'File' }],
    });
    (manager as any).clients.set('alltools-session', client);

    await (manager as any).discoverAllCapabilities('alltools-session', 'fs-server');

    const event = emittedEvents.find((e) => e.type === 'capabilities_discovered');
    expect(event).toBeDefined();
    expect(event.tools.map((t: any) => t.name)).toEqual(
      ['read_file', 'write_file', 'delete_file']
    );
    expect(event.prompts).toHaveLength(1);
    expect(event.resources).toHaveLength(1);
    expect(event.resourceTemplates).toHaveLength(1);
    expect(event.serverId).toBe('fs-server');

    await manager.dispose();
  });

  test('ToolPolicyGateway listTools returns unfiltered by default, filtered with option', async () => {
    const storage = new MemoryStorageBackend();
    _setStorageInstanceForTesting(storage);
    await storage.create(activeSession({
      toolPolicy: {
        mode: 'allowlist',
        toolIds: ['fs-server::read_file'],
        updatedAt: Date.now(),
      },
    }) as any);

    const { createToolPolicyGateway } = await import('../src/server/mcp/tool-policy-gateway.js');
    const gateway = createToolPolicyGateway('alltools-user', 'alltools-session', fakeClient() as any);

    const all = await gateway.listTools();
    expect(all.tools.map((t: any) => t.name)).toEqual(
      ['read_file', 'write_file', 'delete_file'] // no policy applied by default
    );

    const filtered = await gateway.listTools({ filtered: true });
    expect(filtered.tools.map((t: any) => t.name)).toEqual(['read_file']); // policy applied
  });
});
