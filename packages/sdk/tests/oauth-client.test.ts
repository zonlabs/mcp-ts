import { test, expect } from '@playwright/test';
import { MCPClient } from '../src/server/mcp/oauth-client';
import { _setStorageInstanceForTesting } from '../src/server/storage';
import { MemoryStorageBackend } from '../src/server/storage/memory-backend';

test.describe('MCPClient', () => {
    test.afterEach(() => {
        _setStorageInstanceForTesting(null);
    });

    test.describe('constructor', () => {
        test('creates SDK Client eagerly in constructor', () => {
            _setStorageInstanceForTesting(new MemoryStorageBackend());

            const client = new MCPClient({
                userId: 'test-user',
                sessionId: 'test-session',
                serverId: 'test-server',
                serverUrl: 'https://example.com/mcp',
                callbackUrl: 'https://app.local/auth/callback',
            });

            const sdkClient = (client as any).client;
            expect(sdkClient).toBeTruthy();
            expect(sdkClient.transport).toBeUndefined();
            expect(typeof sdkClient.connect).toBe('function');
        });
    });

    test.describe('ensureSession', () => {
        test('creates oauthProvider when missing', async () => {
            _setStorageInstanceForTesting(new MemoryStorageBackend());

            const client = new MCPClient({
                userId: 'test-user',
                sessionId: 'setup-session-test',
                serverId: 'test-server',
                serverUrl: 'https://example.com/mcp',
                callbackUrl: 'https://app.local/auth/callback',
            });

            expect((client as any).oauthProvider).toBeNull();
            await (client as any).ensureSession();
            expect((client as any).oauthProvider).toBeTruthy();
        });

        test('is idempotent when called multiple times', async () => {
            _setStorageInstanceForTesting(new MemoryStorageBackend());

            const client = new MCPClient({
                userId: 'test-user',
                sessionId: 'idempotent-test',
                serverId: 'test-server',
                serverUrl: 'https://example.com/mcp',
                callbackUrl: 'https://app.local/auth/callback',
            });

            await (client as any).ensureSession();
            const provider = (client as any).oauthProvider;
            await (client as any).ensureSession();
            expect((client as any).oauthProvider).toBe(provider);
        });

        test('throws when session not found and no config provided', async () => {
            _setStorageInstanceForTesting(new MemoryStorageBackend());

            const client = new MCPClient({
                userId: 'test-user',
                sessionId: 'nonexistent-session',
            });

            await expect((client as any).ensureSession()).rejects.toThrow('Session not found');
        });
    });

    test.describe('static Authorization headers', () => {
        test('creates StorageOAuthClientProvider even with Authorization header present', async () => {
            _setStorageInstanceForTesting(new MemoryStorageBackend());

            const client = new MCPClient({
                userId: 'test-user',
                sessionId: 'static-auth-session',
                serverId: 'static-auth-server',
                serverName: 'Static Auth Server',
                serverUrl: 'https://example.com/mcp',
                callbackUrl: 'https://app.local/auth/callback',
                transportType: 'streamable-http',
                headers: {
                    Authorization: 'Bearer static-token',
                },
            });

            await (client as any).ensureSession();
            const provider = (client as any).oauthProvider;

            expect(provider).toBeTruthy();
            expect(provider.constructor.name).toBe('StorageOAuthClientProvider');
        });

        test('uses custom oauthProvider when supplied in MCPOAuthClientOptions', async () => {
            _setStorageInstanceForTesting(new MemoryStorageBackend());

            const customProvider: any = {
                clientMetadata: { client_name: 'Custom' },
                clientInformation: async () => ({ client_id: 'custom-id' }),
            };

            const client = new MCPClient({
                userId: 'test-user',
                sessionId: 'custom-provider-session',
                serverId: 'custom-provider-server',
                serverName: 'Custom Provider Server',
                serverUrl: 'https://example.com/mcp',
                callbackUrl: 'https://app.local/auth/callback',
                oauthProvider: customProvider,
            });

            await (client as any).ensureSession();
            expect(client.oauthProvider).toBe(customProvider);
        });

        test('passes clientInformation to StorageOAuthClientProvider when supplied in options', async () => {
            _setStorageInstanceForTesting(new MemoryStorageBackend());

            const client = new MCPClient({
                userId: 'test-user',
                sessionId: 'client-info-session',
                serverId: 'client-info-server',
                serverName: 'Client Info Server',
                serverUrl: 'https://example.com/mcp',
                callbackUrl: 'https://app.local/auth/callback',
                clientInformation: {
                    client_id: 'my-manual-client-id',
                    client_secret: 'my-manual-client-secret',
                },
            });

            await (client as any).ensureSession();
            const provider = client.oauthProvider as any;
            expect(provider).toBeTruthy();
            const info = await provider.clientInformation();
            expect(info).toEqual({
                client_id: 'my-manual-client-id',
                client_secret: 'my-manual-client-secret',
            });
        });

        test('passes all headers including Authorization in requestInit', async () => {
            _setStorageInstanceForTesting(new MemoryStorageBackend());

            const client = new MCPClient({
                userId: 'test-user',
                sessionId: 'custom-headers-session',
                serverId: 'custom-headers-server',
                serverName: 'Custom Headers Server',
                serverUrl: 'https://example.com/mcp',
                callbackUrl: 'https://app.local/auth/callback',
                transportType: 'streamable-http',
                headers: {
                    Authorization: 'Bearer static-token',
                    'x-consumer-api-key': 'my-key',
                },
            });

            await (client as any).ensureSession();
            const transport = (client as any).getTransport('streamable-http');

            expect((transport as any)._requestInit?.headers).toEqual({
                Authorization: 'Bearer static-token',
                'x-consumer-api-key': 'my-key',
            });
        });

        test('includes only Authorization header in requestInit when present alone', async () => {
            _setStorageInstanceForTesting(new MemoryStorageBackend());

            const client = new MCPClient({
                userId: 'test-user',
                sessionId: 'no-auth-custom-headers',
                serverId: 'no-auth-custom-headers-server',
                serverName: 'No Auth Custom Headers',
                serverUrl: 'https://example.com/mcp',
                callbackUrl: 'https://app.local/auth/callback',
                transportType: 'streamable-http',
                headers: {
                    Authorization: 'Bearer static-token',
                },
            });

            await (client as any).ensureSession();
            const transport = (client as any).getTransport('streamable-http');

            expect((transport as any)._requestInit?.headers).toEqual({
                Authorization: 'Bearer static-token',
            });
        });
    });

    test.describe('disconnect', () => {
        test('preserves client instance after disconnect', async () => {
            _setStorageInstanceForTesting(new MemoryStorageBackend());

            const client = new MCPClient({
                userId: 'test-user',
                sessionId: 'disconnect-test',
                serverId: 'test-server',
                serverUrl: 'https://example.com/mcp',
                callbackUrl: 'https://app.local/auth/callback',
            });

            const clientRef = (client as any).client;
            await client.disconnect();
            expect((client as any).client).toBe(clientRef);
        });

        test('disconnects without throwing when never connected', async () => {
            _setStorageInstanceForTesting(new MemoryStorageBackend());

            const client = new MCPClient({
                userId: 'test-user',
                sessionId: 'never-connected-test',
                serverId: 'test-server',
                serverUrl: 'https://example.com/mcp',
                callbackUrl: 'https://app.local/auth/callback',
            });

            await expect(client.disconnect()).resolves.toBeUndefined();
        });
    });

    test.describe('isConnected', () => {
        test('returns false when never connected', () => {
            _setStorageInstanceForTesting(new MemoryStorageBackend());

            const client = new MCPClient({
                userId: 'test-user',
                sessionId: 'isconnected-test',
                serverId: 'test-server',
                serverUrl: 'https://example.com/mcp',
                callbackUrl: 'https://app.local/auth/callback',
            });

            expect(client.isConnected()).toBe(false);
        });

        test('returns false after disconnect', async () => {
            _setStorageInstanceForTesting(new MemoryStorageBackend());

            const client = new MCPClient({
                userId: 'test-user',
                sessionId: 'isconnected-disconnect-test',
                serverId: 'test-server',
                serverUrl: 'https://example.com/mcp',
                callbackUrl: 'https://app.local/auth/callback',
            });

            await client.disconnect();
            expect(client.isConnected()).toBe(false);
        });
    });

    test.describe('withRetry', () => {
        test('passes through non-MCP_SESSION_EXPIRED errors', async () => {
            _setStorageInstanceForTesting(new MemoryStorageBackend());

            const client = new MCPClient({
                userId: 'test-user',
                sessionId: 'retry-nonexpired-test',
                serverId: 'test-server',
                serverUrl: 'https://example.com/mcp',
                callbackUrl: 'https://app.local/auth/callback',
            });

            await expect(
                (client as any).withRetry(async () => {
                    throw new Error('NETWORK_ERROR');
                })
            ).rejects.toThrow('NETWORK_ERROR');
        });

        test('recovers from MCP_SESSION_EXPIRED and retries', async () => {
            _setStorageInstanceForTesting(new MemoryStorageBackend());

            const client = new MCPClient({
                userId: 'test-user',
                sessionId: 'retry-session-expired-test',
                serverId: 'test-server',
                serverUrl: 'https://example.com/mcp',
                callbackUrl: 'https://app.local/auth/callback',
            });

            // Mock reconnect to skip actual transport connection
            const originalConnect = (client as any).connect.bind(client);
            (client as any).connect = async () => {};

            let callCount = 0;
            const result = await (client as any).withRetry(async () => {
                callCount++;
                if (callCount === 1) {
                    throw new Error('MCP_SESSION_EXPIRED: Session not found');
                }
                return 'retried-success';
            });

            expect(result).toBe('retried-success');
            expect(callCount).toBe(2);

            // Restore
            (client as any).connect = originalConnect;
        });
    });
});
