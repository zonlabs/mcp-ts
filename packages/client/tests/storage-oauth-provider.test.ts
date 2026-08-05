import { test, expect } from '@playwright/test';
import { StorageOAuthClientProvider } from '../src/server/mcp/storage-oauth-provider';
import { _setStorageInstanceForTesting, sessions } from '../src/server/storage';
import { MemoryStorageBackend } from '../src/server/storage/memory-backend';
import { STATE_EXPIRATION_MS } from '../src/shared/constants';

const userId = 'user-1';
const sessionId = 'session-1';
const serverId = 'server-1';
const redirectUrl = 'https://app.example.com/callback';

async function createSession() {
  await sessions.create({
    sessionId,
    userId,
    serverId,
    serverName: 'Server One',
    serverUrl: 'https://mcp.example.com',
    callbackUrl: redirectUrl,
    serverOptions: { transport: { type: 'streamable-http' } },
    createdAt: Date.now(),
    status: 'pending',
  });
}

function createProvider(overrides: Partial<ConstructorParameters<typeof StorageOAuthClientProvider>[0]> = {}) {
  return new StorageOAuthClientProvider({
    userId,
    sessionId,
    serverId,
    redirectUrl,
    ...overrides,
  });
}

test.describe('StorageOAuthClientProvider OAuth state', () => {
  test.beforeEach(async () => {
    _setStorageInstanceForTesting(new MemoryStorageBackend());
    await createSession();
  });

  test.afterEach(() => {
    _setStorageInstanceForTesting(null);
  });

  test('generates a nonce-backed state and validates the matching session before expiry', async () => {
    const provider = createProvider();

    const state = await provider.state();
    const [nonce, stateSessionId] = state.split('.');

    expect(nonce).toBeTruthy();
    expect(stateSessionId).toBe(sessionId);

    const stored = await sessions.getCredentials(userId, sessionId);
    expect(stored?.oauthState).toEqual(expect.objectContaining({
      nonce,
      sessionId,
      serverId,
      createdAt: expect.any(Number),
    }));

    await expect(provider.checkState(state)).resolves.toEqual({
      valid: true,
      serverId,
    });
  });

  test('rejects malformed, mismatched, and expired states', async () => {
    const provider = createProvider();
    const state = await provider.state();
    const [nonce] = state.split('.');

    await expect(provider.checkState('not-a-valid-state')).resolves.toMatchObject({
      valid: false,
      error: 'Invalid OAuth state',
    });

    await expect(provider.checkState(`wrong-${nonce}.${sessionId}`)).resolves.toMatchObject({
      valid: false,
      error: 'OAuth state mismatch',
    });

    const wrongServerProvider = createProvider({ serverId: 'server-2' });
    await expect(wrongServerProvider.checkState(state)).resolves.toMatchObject({
      valid: false,
      error: 'OAuth state mismatch',
    });

    const stored = await sessions.getCredentials(userId, sessionId);
    await sessions.patchCredentials(userId, sessionId, {
      oauthState: {
        ...stored!.oauthState!,
        createdAt: Date.now() - STATE_EXPIRATION_MS - 1,
      },
    });

    await expect(provider.checkState(state)).resolves.toMatchObject({
      valid: false,
      error: 'OAuth state expired',
    });
  });

  test('consumes a valid state so it cannot be reused', async () => {
    const provider = createProvider();
    const state = await provider.state();

    await provider.consumeState(state);

    const stored = await sessions.getCredentials(userId, sessionId);
    expect(stored?.oauthState ?? null).toBeNull();
    await expect(provider.checkState(state)).resolves.toMatchObject({
      valid: false,
      error: 'OAuth state not found',
    });
  });

  test('preserves the first PKCE verifier for an in-flight OAuth attempt', async () => {
    const provider = createProvider();

    await provider.saveCodeVerifier('first-verifier');
    await provider.saveCodeVerifier('second-verifier');

    await expect(provider.codeVerifier()).resolves.toBe('first-verifier');
  });

  test('clears a stale PKCE verifier when starting a new OAuth attempt', async () => {
    const provider = createProvider();

    await provider.saveCodeVerifier('stale-verifier');
    await provider.state();
    await provider.saveCodeVerifier('fresh-verifier');

    await expect(provider.codeVerifier()).resolves.toBe('fresh-verifier');
  });

  test('saves and retrieves clientInformation from storage', async () => {
    const provider = createProvider();

    await provider.saveClientInformation({
      client_id: 'registered-client-id',
      client_secret: 'registered-client-secret',
      redirect_uris: [redirectUrl],
    });

    const clientInfo = await provider.clientInformation();
    expect(clientInfo).toEqual({
      client_id: 'registered-client-id',
      client_secret: 'registered-client-secret',
      redirect_uris: [redirectUrl],
    });

    const stored = await sessions.getCredentials(userId, sessionId);
    expect(stored?.clientId).toBe('registered-client-id');
  });

  test('saves and retrieves discoveryState across storage backends', async () => {
    const provider = createProvider();

    const mockDiscovery = {
      authorizationServerUrl: 'https://api.supermemory.ai/api/auth',
      authorizationEndpoint: 'https://api.supermemory.ai/api/auth/authorize',
      tokenEndpoint: 'https://api.supermemory.ai/api/auth/token',
    } as any;

    await provider.saveDiscoveryState(mockDiscovery);

    const retrieved = await provider.discoveryState();
    expect(retrieved).toEqual(mockDiscovery);

    const stored = await sessions.getCredentials(userId, sessionId);
    expect(stored?.discoveryState).toEqual(mockDiscovery);

    await provider.saveTokens({ access_token: 'test-token', token_type: 'bearer' });
    const afterTokensRetrieved = await provider.discoveryState();
    expect(afterTokensRetrieved).toBeUndefined();
  });
});
