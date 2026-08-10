import { test, expect } from '@playwright/test';
import { MCPClient } from '../src/server/mcp/oauth-client';
import { SSEConnectionManager } from '../src/server/handlers/sse-handler';
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
        test('defaults SDK protocol negotiation to auto', () => {
            _setStorageInstanceForTesting(new MemoryStorageBackend());

            const client = new MCPClient({
                userId: 'test-user',
                sessionId: 'protocol-auto-session',
                serverId: 'protocol-auto-server',
                serverUrl: 'https://example.com/mcp',
                callbackUrl: 'https://app.local/auth/callback',
            });

            expect((client as any).client._versionNegotiation).toEqual({ mode: 'auto' });
        });

        test('allows callers to override SDK protocol negotiation to legacy', () => {
            _setStorageInstanceForTesting(new MemoryStorageBackend());

            const client = new MCPClient({
                userId: 'test-user',
                sessionId: 'protocol-legacy-session',
                serverId: 'protocol-legacy-server',
                serverUrl: 'https://example.com/mcp',
                callbackUrl: 'https://app.local/auth/callback',
                client: {
                    versionNegotiation: { mode: 'legacy' },
                },
            });

            expect((client as any).client._versionNegotiation).toEqual({ mode: 'legacy' });
        });

        test('allows callers to pin SDK protocol negotiation', () => {
            _setStorageInstanceForTesting(new MemoryStorageBackend());

            const client = new MCPClient({
                userId: 'test-user',
                sessionId: 'protocol-pin-session',
                serverId: 'protocol-pin-server',
                serverUrl: 'https://example.com/mcp',
                callbackUrl: 'https://app.local/auth/callback',
                client: {
                    versionNegotiation: { mode: { pin: '2026-07-28' } },
                },
            });

            expect((client as any).client._versionNegotiation).toEqual({
                mode: { pin: '2026-07-28' },
            });
        });

        test('passes caller SDK capabilities without injecting UI extensions', () => {
            _setStorageInstanceForTesting(new MemoryStorageBackend());

            const client = new MCPClient({
                userId: 'test-user',
                sessionId: 'custom-capabilities-session',
                serverId: 'custom-capabilities-server',
                serverUrl: 'https://example.com/mcp',
                callbackUrl: 'https://app.local/auth/callback',
                client: {
                    capabilities: {
                        roots: { listChanged: true },
                        extensions: {
                            'com.example/custom': { enabled: true },
                        },
                    },
                },
            });

            expect((client as any).client._capabilities).toEqual({
                roots: { listChanged: true },
                extensions: {
                    'com.example/custom': { enabled: true },
                },
            });
        });
    });

    test.describe('handler clientOptions metadata', () => {
        test('merges clientDefaults.client with dynamic getClientMetadata client', async () => {
            const manager = new SSEConnectionManager({
                userId: 'test-user',
                clientDefaults: {
                    client: {
                        listMaxPages: 3,
                        versionNegotiation: { mode: 'legacy' },
                        capabilities: {
                            roots: { listChanged: true },
                        },
                    },
                },
                getClientMetadata: async () => ({
                    client: {
                        versionNegotiation: { mode: { pin: '2026-07-28' } },
                        capabilities: {
                            sampling: {},
                        },
                    },
                }),
            }, () => { });

            const metadata = await (manager as any).getResolvedClientMetadata();

            expect(metadata.client).toMatchObject({
                listMaxPages: 3,
                versionNegotiation: { mode: { pin: '2026-07-28' } },
                capabilities: {
                    roots: { listChanged: true },
                    sampling: {},
                },
            });

            manager.dispose();
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

        test('rebuilds SDK client with persisted serverOptions.client when restoring a session', async () => {
            const storage = new MemoryStorageBackend();
            _setStorageInstanceForTesting(storage);

            await storage.create({
                userId: 'test-user',
                sessionId: 'persisted-client-options-session',
                serverId: 'persisted-client-options-server',
                serverName: 'Persisted Client Options Server',
                serverUrl: 'https://example.com/mcp',
                callbackUrl: 'https://app.local/auth/callback',
                serverOptions: {
                    transport: { type: 'streamable-http' },
                    client: {
                        versionNegotiation: { mode: 'legacy' },
                        capabilities: { sampling: {} },
                    },
                },
                createdAt: Date.now(),
                status: 'active',
            });

            const client = new MCPClient({
                userId: 'test-user',
                sessionId: 'persisted-client-options-session',
                sessionStore: storage,
            });

            expect((client as any).client._versionNegotiation).toEqual({ mode: 'auto' });
            await (client as any).ensureSession();

            expect((client as any).client._versionNegotiation).toEqual({ mode: 'legacy' });
            expect((client as any).client._capabilities).toEqual({
                sampling: {},
            });
        });
        test('restores transport type from serverOptions.transport', async () => {
            const storage = new MemoryStorageBackend();
            _setStorageInstanceForTesting(storage);

            await storage.create({
                userId: 'test-user',
                sessionId: 'persisted-transport-options-session',
                serverId: 'persisted-transport-options-server',
                serverName: 'Persisted Transport Options Server',
                serverUrl: 'https://example.com/mcp',
                callbackUrl: 'https://app.local/auth/callback',                serverOptions: { transport: { type: 'streamable-http' } },
                createdAt: Date.now(),
                status: 'active',
            });

            const client = new MCPClient({
                userId: 'test-user',
                sessionId: 'persisted-transport-options-session',
                sessionStore: storage,
            });

            await (client as any).ensureSession();

            expect((client as any).getConfiguredTransportType()).toBe('streamable-http');
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
                serverOptions: { transport: { type: 'streamable-http' } },
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
                serverOptions: { transport: { type: 'streamable-http' } },
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
                serverOptions: { transport: { type: 'streamable-http' } },
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
    test.describe('session protocol metadata API', () => {
        test('listSessions includes persisted protocol metadata', async () => {
            const storage = new MemoryStorageBackend();
            _setStorageInstanceForTesting(storage);

            const discoverResult = {
                protocolVersion: '2026-07-28',
                serverInfo: { name: 'api-server', version: '1.0.0' },
                capabilities: {},
            } as any;

            await storage.create({
                userId: 'test-user',
                sessionId: 'session-api-metadata',
                serverId: 'session-api-server',
                serverName: 'Session API Server',
                serverUrl: 'https://example.com/mcp',
                callbackUrl: 'https://app.local/auth/callback',
                serverOptions: {
                    transport: { type: 'streamable-http', protocolVersion: '2026-07-28' },
                    discoverResult,
                },
                createdAt: Date.now(),
                status: 'active',
            });

            const manager = new SSEConnectionManager({ userId: 'test-user' }, () => { });
            const result = await (manager as any).listSessions();

            expect(result.sessions[0]).toMatchObject({
                sessionId: 'session-api-metadata',
                protocolVersion: '2026-07-28',
                discoverResult,
            });

            manager.dispose();
        });
    });

    test.describe('protocol metadata and transport negotiation', () => {
        test('reuses saved discover result as prior and persists negotiated metadata', async () => {
            const storage = new MemoryStorageBackend();
            _setStorageInstanceForTesting(storage);

            const savedDiscoverResult = {
                protocolVersion: '2026-07-28',
                serverInfo: { name: 'saved-server', version: '1.0.0' },
                capabilities: {},
            } as any;
            const newDiscoverResult = {
                protocolVersion: '2026-07-28',
                serverInfo: { name: 'new-server', version: '2.0.0' },
                capabilities: { tools: {} },
            } as any;

            await storage.create({
                userId: 'test-user',
                sessionId: 'protocol-restore-session',
                serverId: 'protocol-restore-server',
                serverName: 'Protocol Restore Server',
                serverUrl: 'https://example.com/mcp',
                callbackUrl: 'https://app.local/auth/callback',
                serverOptions: {
                    transport: { type: 'streamable-http', protocolVersion: '2026-07-28' },
                    discoverResult: savedDiscoverResult,
                    client: {
                        cachePartition: 'user:test-user',
                        defaultCacheTtlMs: 30000,
                    },
                },
                createdAt: Date.now(),
                status: 'active',
            });

            const client = new MCPClient({
                userId: 'test-user',
                sessionId: 'protocol-restore-session',
                sessionStore: storage,
            });

            const connectCalls: any[] = [];
            const fakeSdkClient = {
                transport: undefined,
                connect: async (transport: unknown, options?: unknown) => {
                    connectCalls.push({ transport, options });
                },
                getServerVersion: () => ({ name: 'new-server', version: '2.0.0' }),
                getNegotiatedProtocolVersion: () => '2026-07-28',
                getProtocolEra: () => 'modern',
                getDiscoverResult: () => newDiscoverResult,
            };
            (client as any).getTransport = (transportType: string) => ({ transportType });
            (client as any).createSdkClient = () => fakeSdkClient;
            (client as any).client = fakeSdkClient;

            await client.connect();

            expect(connectCalls).toHaveLength(1);
            expect(connectCalls[0].options).toEqual({
                prior: { kind: 'modern', discover: savedDiscoverResult },
            });
            expect(client.getNegotiatedProtocolVersion()).toBe('2026-07-28');
            expect(client.getProtocolEra()).toBe('modern');
            expect(client.getDiscoverResult()).toBe(newDiscoverResult);

            const persisted = await storage.get('test-user', 'protocol-restore-session');
            expect(persisted?.serverOptions?.transport?.protocolVersion).toBe('2026-07-28');
            expect(persisted?.serverOptions?.discoverResult).toEqual(newDiscoverResult);
            expect(persisted?.serverOptions?.client).toEqual({
                cachePartition: 'user:test-user',
                defaultCacheTtlMs: 30000,
            });
        });

        test('does not automatically fall back to SSE when transport is omitted', async () => {
            _setStorageInstanceForTesting(new MemoryStorageBackend());

            const client = new MCPClient({
                userId: 'test-user',
                sessionId: 'no-sse-fallback-session',
                serverId: 'no-sse-fallback-server',
                serverName: 'No SSE Fallback Server',
                serverUrl: 'https://example.com/mcp',
                callbackUrl: 'https://app.local/auth/callback',
            });

            const attempted: string[] = [];
            (client as any).getTransport = (transportType: string) => {
                attempted.push(transportType);
                throw new Error(`failed ${transportType}`);
            };

            await expect(client.connect()).rejects.toThrow('failed streamable-http');
            expect(attempted).toEqual(['streamable-http']);
        });

        test('still allows explicit SSE transport selection for legacy callers', async () => {
            _setStorageInstanceForTesting(new MemoryStorageBackend());

            const client = new MCPClient({
                userId: 'test-user',
                sessionId: 'explicit-sse-session',
                serverId: 'explicit-sse-server',
                serverName: 'Explicit SSE Server',
                serverUrl: 'https://example.com/sse',
                callbackUrl: 'https://app.local/auth/callback',
                serverOptions: { transport: { type: 'sse' } },
            });

            const attempted: string[] = [];
            (client as any).getTransport = (transportType: string) => {
                attempted.push(transportType);
                return { transportType };
            };
            (client as any).client = {
                transport: undefined,
                connect: async () => {},
                getServerVersion: () => ({ name: 'legacy-sse', version: '1.0.0' }),
                getNegotiatedProtocolVersion: () => undefined,
                getProtocolEra: () => 'legacy',
                getDiscoverResult: () => undefined,
            };

            await client.connect();

            expect(attempted).toEqual(['sse']);
            expect(client.getProtocolEra()).toBe('legacy');
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
