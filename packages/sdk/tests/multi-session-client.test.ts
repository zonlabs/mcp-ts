import { test, expect } from '@playwright/test';
import { MultiSessionClient, type MultiSessionOptions } from '../src/server/mcp/multi-session-client';
import { MCPClient } from '../src/server/mcp/oauth-client';
import { sessions, _setStorageInstanceForTesting } from '../src/server/storage';
import { MemoryStorageBackend } from '../src/server/storage/memory-backend';
import type { Session } from '../src/server/storage/types';

test.describe('MultiSessionClient', () => {
    const userId = 'test-userId';
    
    // Save original MCPClient methods to restore later
    const originalConnect = (MCPClient.prototype as any).connect;
    const originalDisconnect = (MCPClient.prototype as any).disconnect;
    const originalIsConnected = (MCPClient.prototype as any).isConnected;
    const originalGetSessionId = (MCPClient.prototype as any).getSessionId;

    test.beforeEach(() => {
        // Mock getSessionId to read from the internal state created in constructor
        (MCPClient.prototype as any).getSessionId = function() {
            return (this as any).config?.sessionId || (this as any).sessionId;
        };
        (MCPClient.prototype as any).isConnected = function() {
            return (this as any)._mockConnected || false;
        };
        (MCPClient.prototype as any).disconnect = function() {
            (this as any)._mockConnected = false;
        };
    });

    test.afterEach(() => {
        _setStorageInstanceForTesting(null);
        (MCPClient.prototype as any).connect = originalConnect;
        (MCPClient.prototype as any).disconnect = originalDisconnect;
        (MCPClient.prototype as any).isConnected = originalIsConnected;
        (MCPClient.prototype as any).getSessionId = originalGetSessionId;
    });

    test('should fetch active sessions and establish connections in batches', async () => {
        let connectCallCount = 0;
        
        // Mock connect to succeed automatically
        (MCPClient.prototype as any).connect = async function() {
            connectCallCount++;
            (this as any)._mockConnected = true;
        };

        const mockStorage = new MemoryStorageBackend();
        
        // Let's create 6 sessions to force it beyond a single BATCH_SIZE (which is 5)
        const mockSessions = Array.from({ length: 6 }).map((_, i) => ({
            sessionId: `session-${i}`,
            serverId: `server-${i}`,
            serverUrl: `http://localhost/server-${i}`,
            callbackUrl: `http://localhost/callback-${i}`,
            status: 'active' as const,
        }));
        
        mockStorage.list = async () => mockSessions as any;
        _setStorageInstanceForTesting(mockStorage);

        const multiClient = new MultiSessionClient(userId);
        await multiClient.connect();

        const clients = multiClient.getClients();
        expect(connectCallCount).toBe(6);
        expect(clients.length).toBe(6);
        expect(clients[0].isConnected()).toBe(true);
    });

    test('should prevent duplicate connection attempts via connectionPromises lock', async () => {
        let connectCallCount = 0;
        
        let releaseLock: () => void;
        const lockPromise = new Promise<void>(r => { releaseLock = r; });

        // Mock connect to wait for the explicit release to guarantee overlapping
        (MCPClient.prototype as any).connect = async function() {
            connectCallCount++;
            await lockPromise; 
            (this as any)._mockConnected = true;
        };

        const multiClient = new MultiSessionClient(userId, { timeout: 10000 });
        
        const testSession = {
            sessionId: 'concurrent-session',
            serverId: 'server-1',
            serverUrl: 'http://localhost/server',
            callbackUrl: 'http://localhost/callback'
        } as any;
        
        // Call explicit private connectSession directly to simulate overlapping calls 
        const p1 = (multiClient as any).connectSession(testSession);
        const p2 = (multiClient as any).connectSession(testSession);
        
        expect((multiClient as any).connectionPromises.has('concurrent-session')).toBe(true);

        releaseLock!();
        await Promise.all([p1, p2]);

        // Even though we fired connectSession twice, it should only spin up 1 physical connection 
        expect(connectCallCount).toBe(1);
        expect(multiClient.getClients().length).toBe(1);
    });

    test('should apply retry logic when connections fail', async () => {
        let attemptCount = 0;
        
        (MCPClient.prototype as any).connect = async function() {
            attemptCount++;
            if (attemptCount < 2) {
                // Fail on the first attempt
                throw new Error('Simulated network failure');
            }
            // Succeed on the second
            (this as any)._mockConnected = true;
        };

        const multiClient = new MultiSessionClient(userId, { maxRetries: 2, retryDelay: 50 });
        
        const testSession = {
            sessionId: 'retry-session',
            serverId: 'server-1',
            serverUrl: 'http://localhost/server',
            callbackUrl: 'http://localhost/cb'
        } as any;
        
        await (multiClient as any).connectSession(testSession);
        
        // Should have retried exactly once after the failure
        expect(attemptCount).toBe(2);
        
        const clients = multiClient.getClients();
        expect(clients.length).toBe(1);
        expect(clients[0].isConnected()).toBe(true);
    });

    test('should give up and log error if max retries are exceeded', async () => {
        let attemptCount = 0;
        
        (MCPClient.prototype as any).connect = async function() {
            attemptCount++;
            throw new Error('Persistent failure');
        };

        const consoleSpy = "error" in console ? console.error : undefined;
        let loggedErrors = 0;

        console.error = () => { loggedErrors++; };

        try {
            const multiClient = new MultiSessionClient(userId, { maxRetries: 1, retryDelay: 10 });
            
            const testSession = {
                sessionId: 'fail-session',
                serverId: 'server-failed',
                serverUrl: 'http://loc/fail',
                callbackUrl: 'http://loc/cb'
            } as any;
            
            await (multiClient as any).connectSession(testSession);
            
            // Base attempt + 1 retry = 2 attempts total
            expect(attemptCount).toBe(2);
            expect(multiClient.getClients().length).toBe(0);
            expect(loggedErrors).toBeGreaterThan(0);
        } finally {
            if (consoleSpy) console.error = consoleSpy;
        }
    });

    test('should properly disconnect and clear client cache', async () => {
        (MCPClient.prototype as any).connect = async function() {
            (this as any)._mockConnected = true;
        };

        const testSession = {
            sessionId: 'disconnect-test',
            serverId: 'srv',
            serverUrl: 'url',
            callbackUrl: 'url'
        } as any;

        const multiClient = new MultiSessionClient(userId);
        await (multiClient as any).connectSession(testSession);
        
        const client = multiClient.getClients()[0];
        expect(client.isConnected()).toBe(true);

        await multiClient.disconnect();

        expect(multiClient.getClients().length).toBe(0);
        expect(client.isConnected()).toBe(false); // Because mock disconnect sets it to false
    });

    test('should use sessionProvider instead of storage when provided', async () => {
        (MCPClient.prototype as any).connect = async function() {
            (this as any)._mockConnected = true;
        };

        const providerSessions: Session[] = [
            {
                sessionId: 'provider-session',
                userId,
                serverId: 'srv',
                serverUrl: 'http://provider',
                callbackUrl: 'http://provider/cb',
                transportType: 'streamable-http',
                status: 'active',
                createdAt: Date.now(),
            } as Session,
        ];

        let providerCalled = false;
        const multiClient = new MultiSessionClient(userId, {
            sessionProvider: async () => {
                providerCalled = true;
                return providerSessions;
            },
        });

        await multiClient.connect();

        expect(providerCalled).toBe(true);
        expect(multiClient.getClients().length).toBe(1);
        expect(multiClient.getClients()[0].isConnected()).toBe(true);
    });

    test('should invoke onSessionConnected after successful connection', async () => {
        (MCPClient.prototype as any).connect = async function() {
            (this as any)._mockConnected = true;
        };

        const connectedSessions: string[] = [];
        const multiClient = new MultiSessionClient(userId, {
            sessionProvider: async () => [{
                sessionId: 'cb-session',
                userId,
                serverId: 'srv',
                serverUrl: 'http://cb',
                callbackUrl: 'http://cb/cb',
                transportType: 'streamable-http',
                status: 'active',
                createdAt: Date.now(),
            } as Session],
            onSessionConnected: (sessionId) => {
                connectedSessions.push(sessionId);
            },
        });

        await multiClient.connect();

        expect(connectedSessions).toEqual(['cb-session']);
    });

    test('should invoke onSessionEvicted when stale clients are pruned', async () => {
        (MCPClient.prototype as any).connect = async function() {
            (this as any)._mockConnected = true;
        };

        const evictedSessions: string[] = [];

        // Connect with one session
        const multiClient = new MultiSessionClient(userId, {
            sessionProvider: async () => [{
                sessionId: 'stale-session',
                userId,
                serverId: 'srv',
                serverUrl: 'http://stale',
                callbackUrl: 'http://stale/cb',
                transportType: 'streamable-http',
                status: 'active',
                createdAt: Date.now(),
            } as Session],
            onSessionEvicted: (sessionId) => {
                evictedSessions.push(sessionId);
            },
        });

        await multiClient.connect();
        expect(multiClient.getClients().length).toBe(1);

        // Now reconnect with a different session — the old client should be evicted
        const multiClient2 = new MultiSessionClient(userId, {
            sessionProvider: async () => [], // No active sessions
            onSessionEvicted: (sessionId) => {
                evictedSessions.push(sessionId);
            },
        });

        // Push the stale client manually to simulate the scenario
        (multiClient2 as any).clients = (multiClient as any).clients;
        await multiClient2.connect();

        expect(evictedSessions).toContain('stale-session');
        expect(multiClient2.getClients().length).toBe(0);
    });

    test('should invoke onSessionFailed when all retries are exhausted', async () => {
        let attemptCount = 0;
        (MCPClient.prototype as any).connect = async function() {
            attemptCount++;
            throw new Error('Persistent failure');
        };

        const consoleSpy = "error" in console ? console.error : undefined;
        console.error = () => {};

        const failedSessions: Array<{ sessionId: string; error: unknown }> = [];

        try {
            const multiClient = new MultiSessionClient(userId, {
                maxRetries: 1,
                retryDelay: 10,
                sessionProvider: async () => [{
                    sessionId: 'fail-cb-session',
                    userId,
                    serverId: 'srv',
                    serverUrl: 'http://fail',
                    callbackUrl: 'http://fail/cb',
                    transportType: 'streamable-http',
                    status: 'active',
                    createdAt: Date.now(),
                } as Session],
                onSessionFailed: (sessionId, error) => {
                    failedSessions.push({ sessionId, error });
                },
            });

            await multiClient.connect();

            expect(attemptCount).toBe(2); // Initial + 1 retry
            expect(failedSessions.length).toBe(1);
            expect(failedSessions[0].sessionId).toBe('fail-cb-session');
            expect(failedSessions[0].error).toBeInstanceOf(Error);
        } finally {
            if (consoleSpy) console.error = consoleSpy;
        }
    });
});
