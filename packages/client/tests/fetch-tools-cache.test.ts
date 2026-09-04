/**
 * Tests for McpClient catalog caches.
 *
 * Changes covered:
 * - All catalog caches are null on construction.
 * - First fetch contacts the remote and populates the matching cache.
 * - Subsequent calls return the cached value without extra network requests.
 * - `connect()` and `dispose()` clear every catalog cache.
 */

import { test, expect } from '@playwright/test';
import { McpClient } from '../src/server/mcp/client';
import { _setStorageInstanceForTesting } from '../src/server/storage';
import { MemoryStorageBackend } from '../src/server/storage/memory-backend';

function makeMcpClient() {
  return new McpClient({
    userId: 'cache-user',
    sessionId: 'cache-session',
    serverId: 'cache-server',
    serverUrl: 'https://example.com/mcp',
    callbackUrl: 'https://app.local/auth/callback',
  });
}

test.describe('McpClient catalog caches', () => {
  test.beforeEach(() => {
    _setStorageInstanceForTesting(new MemoryStorageBackend());
  });

  test.afterEach(() => {
    _setStorageInstanceForTesting(null);
  });

  test('all catalog caches are null on construction', () => {
    const client = makeMcpClient();
    expect((client as any).cachedTools).toBeNull();
    expect((client as any).cachedPrompts).toBeNull();
    expect((client as any).cachedResources).toBeNull();
    expect((client as any).cachedResourceTemplates).toBeNull();
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

  test('prompt, resource, and template fetches reuse their caches', async () => {
    const client = makeMcpClient();
    const prompts = [{ name: 'prompt-a' }];
    const resources = [{ uri: 'file:///resource-a', name: 'Resource A' }];
    const resourceTemplates = [{ uriTemplate: 'file:///{name}', name: 'Template A' }];
    const calls = { prompts: 0, resources: 0, templates: 0 };
    (client as any).client = {
      listPrompts: async () => {
        calls.prompts += 1;
        return { prompts };
      },
      listResources: async () => {
        calls.resources += 1;
        return { resources };
      },
      listResourceTemplates: async () => {
        calls.templates += 1;
        return { resourceTemplates };
      },
    };

    await expect(client.fetchPrompts()).resolves.toEqual(prompts);
    await expect(client.fetchPrompts()).resolves.toEqual(prompts);
    await expect(client.fetchResources()).resolves.toEqual(resources);
    await expect(client.fetchResources()).resolves.toEqual(resources);
    await expect(client.fetchResourceTemplates()).resolves.toEqual(resourceTemplates);
    await expect(client.fetchResourceTemplates()).resolves.toEqual(resourceTemplates);

    expect(calls).toEqual({ prompts: 1, resources: 1, templates: 1 });
  });

  test('connect() clears all catalog caches', async () => {
    const client = makeMcpClient();

    (client as any).cachedTools = [{ name: 'stale-tool' }];
    (client as any).cachedPrompts = [{ name: 'stale-prompt' }];
    (client as any).cachedResources = [{ uri: 'file:///stale-resource' }];
    (client as any).cachedResourceTemplates = [{ uriTemplate: 'file:///{stale}' }];

    // Stub connect internals so we don't actually open a network socket.
    let cacheStateAtConnectStart: unknown[] = ['not-checked'];
    (client as any).ensureSession = async () => {
      cacheStateAtConnectStart = [
        (client as any).cachedTools,
        (client as any).cachedPrompts,
        (client as any).cachedResources,
        (client as any).cachedResourceTemplates,
      ];
      throw new Error('abort-for-test');
    };

    await client.connect().catch(() => { /* expected */ });

    expect(cacheStateAtConnectStart).toEqual([null, null, null, null]);
  });

  test('dispose() clears all catalog caches', () => {
    const client = makeMcpClient();

    (client as any).cachedTools = [{ name: 'tool' }];
    (client as any).cachedPrompts = [{ name: 'prompt' }];
    (client as any).cachedResources = [{ uri: 'file:///resource' }];
    (client as any).cachedResourceTemplates = [{ uriTemplate: 'file:///{name}' }];

    client.dispose();

    expect((client as any).cachedTools).toBeNull();
    expect((client as any).cachedPrompts).toBeNull();
    expect((client as any).cachedResources).toBeNull();
    expect((client as any).cachedResourceTemplates).toBeNull();
  });
});
