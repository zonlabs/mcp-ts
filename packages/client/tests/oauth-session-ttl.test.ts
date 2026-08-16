import { test, expect } from '@playwright/test';
import { Client } from "@modelcontextprotocol/client";
import { McpClient } from '../src/server/mcp/client';
import { _setStorageInstanceForTesting, sessions } from '../src/server/storage';
import { MemoryStorageBackend } from '../src/server/storage/memory-backend';
import { STATE_EXPIRATION_MS } from '../src/shared/constants';
import type { Session } from '../src/server/storage/types';
import { UnauthorizedError } from '../src/shared/errors';

type CreateCall = {
  session: Session;
  argumentCount: number;
};

type UpdateCall = {
  userId: string;
  sessionId: string;
  data: Partial<Session>;
  argumentCount: number;
};

class TrackingMemoryStorage extends MemoryStorageBackend {
  public createCalls: CreateCall[] = [];
  public updateCalls: UpdateCall[] = [];

  async create(session: Session): Promise<void> {
    this.createCalls.push({ session, argumentCount: arguments.length });
    return super.create(session);
  }

  async update(userId: string, sessionId: string, data: Partial<Session>): Promise<void> {
    this.updateCalls.push({ userId, sessionId, data, argumentCount: arguments.length });
    return super.update(userId, sessionId, data);
  }
}

function expectNoCallerTtl(storage: TrackingMemoryStorage) {
  for (const call of storage.createCalls) {
    expect(call.argumentCount).toBe(1);
  }
  for (const call of storage.updateCalls) {
    expect(call.argumentCount).toBe(3);
  }
}

function expectPendingExpiration(expiresAt: unknown) {
  expect(typeof expiresAt).toBe('number');
  expect(expiresAt as number).toBeGreaterThan(Date.now());
  expect(expiresAt as number).toBeLessThanOrEqual(Date.now() + STATE_EXPIRATION_MS + 1000);
}

async function createPendingSession(client: McpClient) {
  const userId = (client as any).config.userId;
  const sessionId = (client as any).config.sessionId;
  const existing = await sessions.get(userId, sessionId);

  if (!existing) {
    await sessions.create({
      sessionId,
      userId,
      serverId: (client as any).config.serverId,
      serverName: (client as any).config.serverName,
      serverUrl: (client as any).config.serverUrl,
      callbackUrl: (client as any).config.callbackUrl,
      serverOptions: { transport: { type: (client as any).config.transport?.type || 'streamable-http' } },
      createdAt: Date.now(),
      status: 'pending',
    });
  }
}

test.describe('McpClient session expiration lifecycle', () => {
  const originalEnsureSession = (McpClient.prototype as any).ensureSession;
  const originalTryConnect = (McpClient.prototype as any).tryConnect;
  const originalGetTransport = (McpClient.prototype as any).getTransport;
  const originalClientConnect = (Client.prototype as any).connect;

  test.afterEach(() => {
    (McpClient.prototype as any).ensureSession = originalEnsureSession;
    (McpClient.prototype as any).tryConnect = originalTryConnect;
    (McpClient.prototype as any).getTransport = originalGetTransport;
    (Client.prototype as any).connect = originalClientConnect;
    _setStorageInstanceForTesting(null);
  });

  test('successful connect promotes the session without caller-supplied TTL', async () => {
    const mockStorage = new TrackingMemoryStorage();
    _setStorageInstanceForTesting(mockStorage);

    (McpClient.prototype as any).ensureSession = async function () {
      (this as any).oauthProvider = { authUrl: '' };
      await createPendingSession(this as McpClient);
    };
    (McpClient.prototype as any).tryConnect = async () => ({ transport: { type: 'streamable-http' } });

    const client = new McpClient({
      userId: 'user-1',
      sessionId: 's-1',
      serverId: 'srv-1',
      serverName: 'Server One',
      serverUrl: 'https://example.com/mcp',
      callbackUrl: 'https://app.example.com/callback',
      serverOptions: { transport: { type: 'streamable-http' } },
    });

    await client.connect();
    await client.connect();

    expectNoCallerTtl(mockStorage);
    expect(mockStorage.updateCalls.filter((call) => call.data.status === 'active')).toHaveLength(2);

    const session = await sessions.get('user-1', 's-1');
    expect(session?.status).toBe('active');
    expect((session as any)?.expiresAt).toBeNull();
  });

  test('oauth pending state gets a short storage-owned expiration', async () => {
    const mockStorage = new TrackingMemoryStorage();
    _setStorageInstanceForTesting(mockStorage);

    (McpClient.prototype as any).ensureSession = async function () {
      (this as any).oauthProvider = { authUrl: 'https://auth.example.com' };
      await createPendingSession(this as McpClient);
    };
    (McpClient.prototype as any).tryConnect = async () => {
      throw new Error('unauthorized');
    };

    const client = new McpClient({
      userId: 'user-2',
      sessionId: 's-2',
      serverId: 'srv-2',
      serverName: 'Server Two',
      serverUrl: 'https://example.com/mcp',
      callbackUrl: 'https://app.example.com/callback',
      serverOptions: { transport: { type: 'streamable-http' } },
    });

    await expect(client.connect()).rejects.toBeInstanceOf(UnauthorizedError);

    expectNoCallerTtl(mockStorage);

    const session = await sessions.get('user-2', 's-2');
    expect(session?.status).toBe('pending');
    expectPendingExpiration((session as any)?.expiresAt);
  });

  test('oauth finishAuth promotes the session and clears pending expiration', async () => {
    const mockStorage = new TrackingMemoryStorage();
    _setStorageInstanceForTesting(mockStorage);

    (McpClient.prototype as any).ensureSession = async function () {
      (this as any).oauthProvider = { authUrl: 'https://auth.example.com' };
      await createPendingSession(this as McpClient);
    };

    (McpClient.prototype as any).getTransport = function () {
      return {
        finishAuth: async () => { },
      };
    };

    (Client.prototype as any).connect = async () => { };

    const client = new McpClient({
      userId: 'user-3',
      sessionId: 's-3',
      serverId: 'srv-3',
      serverName: 'Server Three',
      serverUrl: 'https://example.com/mcp',
      callbackUrl: 'https://app.example.com/callback',
      serverOptions: { transport: { type: 'streamable-http' } },
    });

    await client.finishAuth('auth-code');

    expectNoCallerTtl(mockStorage);
    expect(mockStorage.updateCalls.some((call) => call.data.status === 'active')).toBe(true);

    const session = await sessions.get('user-3', 's-3');
    expect(session?.status).toBe('active');
    expect((session as any)?.expiresAt).toBeNull();
  });

  test('oauth finishAuth emits AUTHENTICATED only once across transport fallback', async () => {
    const mockStorage = new TrackingMemoryStorage();
    _setStorageInstanceForTesting(mockStorage);

    (McpClient.prototype as any).ensureSession = async function () {
      (this as any).oauthProvider = { authUrl: 'https://auth.example.com' };
      await createPendingSession(this as McpClient);
    };

    const connectAttempts: string[] = [];
    const finishAuthAttempts: string[] = [];

    (McpClient.prototype as any).getTransport = function (type: string) {
      return {
        finishAuth: async () => {
          finishAuthAttempts.push(type);
        },
      };
    };

    (Client.prototype as any).connect = async function (transport: any) {
      const attemptType = connectAttempts.length === 0 ? 'streamable-http' : 'sse';
      connectAttempts.push(attemptType);

      if (attemptType === 'streamable-http') {
        throw new Error('Method Not Allowed');
      }

      return transport;
    };

    const client = new McpClient({
      userId: 'user-4',
      sessionId: 's-4',
      serverId: 'srv-4',
      serverName: 'Server Four',
      serverUrl: 'https://example.com/mcp',
      callbackUrl: 'https://app.example.com/callback',
    });

    const states: string[] = [];
    client.onConnectionEvent((event) => {
      if (event.type === 'state_changed') {
        states.push(event.state);
      }
    });

    await client.finishAuth('auth-code');

    expectNoCallerTtl(mockStorage);
    expect(finishAuthAttempts).toEqual(['streamable-http']);
    expect(connectAttempts).toEqual(['streamable-http', 'sse']);
    expect(states.filter((state) => state === 'AUTHENTICATED')).toHaveLength(1);
  });
});
