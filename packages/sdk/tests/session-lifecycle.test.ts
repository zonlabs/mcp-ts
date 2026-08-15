import { test, expect } from '@playwright/test';
import { McpClient } from '../src/server/mcp/client';
import { _setStorageInstanceForTesting } from '../src/server/storage';
import { MemoryStorageBackend } from '../src/server/storage/memory-backend';
import { UnauthorizedError as SDKUnauthorizedError } from "@modelcontextprotocol/client";

test.describe('Session Lifecycle Management', () => {
    const userId = 'test-user';
    const sessionId = 'test-session';
    const serverId = 'test-server';
    const serverUrl = 'http://localhost:8080';
    const callbackUrl = 'http://localhost:3000/callback';

    let mockStorage: MemoryStorageBackend;

    test.beforeEach(() => {
        mockStorage = new MemoryStorageBackend();
        _setStorageInstanceForTesting(mockStorage);
    });

    test.afterEach(() => {
        _setStorageInstanceForTesting(null);
    });

    test('Scenario 1: Successful Connection Promotion (status: active)', async () => {
        const client = new McpClient({
            userId,
            sessionId,
            serverId,
            serverUrl,
            callbackUrl,
        });

        // Mock internal methods to simulate success
        (client as any).ensureSession = async () => { 
            (client as any).oauthProvider = { 
                tokens: async () => ({ access_token: 'valid' })
            };
        };
        (client as any).tryConnect = async () => ({ transport: { type: 'sse' } });

        // First creation with status: pending occurs in initialize (mocked above, so let's verify saveSession call)
        // Actually, let's let the real connect run but mock the terminal operations
        
        let savedWithStatus = 'pending';
        
        const originalSaveSession = (client as any).saveSession.bind(client);
        (client as any).saveSession = async (status: 'pending' | 'active') => {
            savedWithStatus = status;
            return originalSaveSession(status);
        };

        await client.connect();

        expect(savedWithStatus).toBe('active');
        
        const session = await mockStorage.get(userId, sessionId);
        expect(session?.status).toBe('active');
        expect(session?.expiresAt).toBeNull();
    });

    test('Scenario 2: Generic error removes transient session', async () => {
        const client = new McpClient({
            userId,
            sessionId,
            serverId,
            serverUrl,
            callbackUrl,
        });

        await mockStorage.create({
            sessionId,
            userId,
            serverId,
            serverUrl,
            callbackUrl,
            serverOptions: { transport: { type: 'streamable-http' } },
            createdAt: Date.now(),
            status: 'pending',
        });

        // Mock to throw generic error
        (client as any).ensureSession = async function() {
            this.oauthProvider = { 
                tokens: async () => ({ access_token: 'valid' })
            };
            this.client = { connect: async () => {} }; // Needs to exist to pass check
        };
        (client as any).tryConnect = async () => {
            throw new Error('ECONNREFUSED');
        };

        await expect(client.connect()).rejects.toThrow('ECONNREFUSED');

        await expect(mockStorage.get(userId, sessionId)).resolves.toBeNull();
    });

    test('Scenario 2b: Generic reconnect error preserves active session credentials', async () => {
        const client = new McpClient({
            userId,
            sessionId,
            serverId,
            serverUrl,
            callbackUrl,
        });

        await mockStorage.create({
            sessionId,
            userId,
            serverId,
            serverUrl,
            callbackUrl,
            serverOptions: { transport: { type: 'streamable-http' } },
            createdAt: Date.now(),
            status: 'active',
        });

        (client as any).ensureSession = async function() {
            this.oauthProvider = {
                tokens: async () => ({ access_token: 'valid' })
            };
        };
        (client as any).tryConnect = async () => {
            throw new Error('ECONNREFUSED');
        };

        let deleteSessionCalled = false;
        mockStorage.delete = async () => {
            deleteSessionCalled = true;
        };

        await expect(client.connect()).rejects.toThrow('ECONNREFUSED');
        expect(deleteSessionCalled).toBe(false);
    });

    test('Scenario 3: Terminal Auth Failure (no URL) removes session', async () => {
        const client = new McpClient({
            userId,
            sessionId,
            serverId,
            serverUrl,
            callbackUrl,
        });

        // Mock to throw Unauthorized without an auth URL
        (client as any).ensureSession = async function() {
            this.oauthProvider = { 
                tokens: async () => null, 
                authUrl: '' 
            };
        };
        (client as any).tryConnect = async () => {
            throw new SDKUnauthorizedError('Unauthorized');
        };

        await expect(client.connect()).rejects.toThrow('OAuth authorization URL not available');

        await expect(mockStorage.get(userId, sessionId)).resolves.toBeNull();
    });

    test('Scenario 4: Short-lived Pending State (status: pending)', async () => {
        const client = new McpClient({
            userId,
            sessionId,
            serverId,
            serverUrl,
            callbackUrl,
        });

        // Mock to throw Unauthorized WITH an auth URL
        (client as any).ensureSession = async function() {
            this.oauthProvider = { 
                tokens: async () => null,
                authUrl: 'http://auth.url'
            };
        };
        (client as any).tryConnect = async () => {
            throw new SDKUnauthorizedError('Unauthorized');
        };

        let savedWithStatus = 'active';
        
        (client as any).saveSession = async (status: 'pending' | 'active') => {
            savedWithStatus = status;
        };

        await expect(client.connect()).rejects.toThrow('OAuth authorization required');
        
        expect(savedWithStatus).toBe('pending');
    });
});
