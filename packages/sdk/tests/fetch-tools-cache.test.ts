/**
 * Tests for the fetchTools() in-memory cache introduced on MCPClient.
 *
 * Changes covered:
 * - `cachedTools` is null on construction.
 * - First call to `fetchTools()` contacts the remote and populates the cache.
 * - Subsequent calls return the cached value without extra network requests.
 * - `connect()` clears `cachedTools` so a reconnection fetches a fresh list.
 * - `dispose()` clears `cachedTools` to release memory.
 */

import { test, expect } from '@playwright/test';
import { MCPClient } from '../src/server/mcp/oauth-client';
import { _setStorageInstanceForTesting } from '../src/server/storage';
import { MemoryStorageBackend } from '../src/server/storage/memory-backend';

function makeMcpClient() {
  return new MCPClient({
    userId: 'cache-user',
    sessionId: 'cache-session',
    serverId: 'cache-server',
    serverUrl: 'https://example.com/mcp',
    callbackUrl: 'https://app.local/auth/callback',
  });
}

test.describe('MCPClient.fetchTools cache', () => {
  test.beforeEach(() => {
    _setStorageInstanceForTesting(new MemoryStorageBackend());
  });

  test.afterEach(() => {
    _setStorageInstanceForTesting(null);
  });

  test('cachedTools is null on construction', () => {
    const client = makeMcpClient();
    expect((client as any).cachedTools).toBeNull();
  });

  test('fetchTools populates cachedTools after the first call', async () => {
    const client = makeMcpClient();

    const tools = [{ name: 'tool_a', description: 'Tool A', inputSchema: { type: 'object', properties: {} } }];
    // Inject a fake SDK client that returns our tool list
    (client as any).client = {
      request: async () => ({ tools }),
      listTools: async () => ({ tools }),
    };

    const result = await client.fetchTools();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('tool_a');
    expect((client as any).cachedTools).not.toBeNull();
    expect((client as any).cachedTools[0].name).toBe('tool_a');
  });

  test('fetchTools does not call the SDK client on a second call (cache hit)', async () => {
    const client = makeMcpClient();

    const tools = [{ name: 'tool_b', description: 'Tool B', inputSchema: { type: 'object', properties: {} } }];
    let callCount = 0;
    (client as any).client = {
      request: async () => {
        callCount += 1;
        return { tools };
      },
      listTools: async () => {
        callCount += 1;
        return { tools };
      },
    };

    await client.fetchTools(); // first call — populates cache
    await client.fetchTools(); // second call — should use cache
    await client.fetchTools(); // third call — should use cache

    expect(callCount).toBe(1); // only ONE remote call made
  });

  test('connect() clears cachedTools so reconnect fetches a fresh list', async () => {
    const client = makeMcpClient();

    // Pre-populate the cache manually
    (client as any).cachedTools = { tools: [{ name: 'stale_tool' }] };
    expect((client as any).cachedTools).not.toBeNull();

    // Stub connect internals so we don't actually open a network socket.
    // We only need to verify cachedTools is cleared at the START of connect().
    const originalEnsureSession = (client as any).ensureSession.bind(client);
    let cacheStateAtConnectStart: unknown = 'not-checked';

    (client as any).cachedTools = { tools: [{ name: 'stale_tool' }] };
    (client as any).ensureSession = async () => {
      // Capture cachedTools state after `connect()` clears it but before
      // the rest of the method runs.
      cacheStateAtConnectStart = (client as any).cachedTools;
      // Re-throw to abort further connection so we don't need a real server
      throw new Error('abort-for-test');
    };

    await client.connect().catch(() => { /* expected */ });

    // cachedTools should have been set to null before ensureSession was called
    expect(cacheStateAtConnectStart).toBeNull();
  });

  test('dispose() clears cachedTools to release memory', () => {
    const client = makeMcpClient();

    // Pre-populate the cache
    (client as any).cachedTools = { tools: [{ name: 'some_tool' }] };
    expect((client as any).cachedTools).not.toBeNull();

    client.dispose();

    expect((client as any).cachedTools).toBeNull();
  });
});
