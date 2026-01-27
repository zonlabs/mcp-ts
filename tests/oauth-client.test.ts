import { test, expect } from '@playwright/test';
import { MCPClient } from '../src/server/mcp/oauth-client';
import { storage } from '../src/server/storage';

test.describe('MCPClient.getMcpServerConfig', () => {
    const identity = 'test-user';

    // Store original methods to restore later
    const originalGetIdentitySessionsData = storage.getIdentitySessionsData;
    const originalRemoveSession = storage.removeSession;
    const originalInitialize = (MCPClient.prototype as any).initialize;
    const originalGetValidTokens = (MCPClient.prototype as any).getValidTokens;

    test.afterEach(() => {
        // Restore methods
        storage.getIdentitySessionsData = originalGetIdentitySessionsData;
        storage.removeSession = originalRemoveSession;
        (MCPClient.prototype as any).initialize = originalInitialize;
        (MCPClient.prototype as any).getValidTokens = originalGetValidTokens;
    });

    test('should process multiple sessions in parallel and return the correct config', async () => {
        // Spy counts
        let initCallCount = 0;
        let getTokensCallCount = 0;

        // Mock Initialize
        (MCPClient.prototype as any).initialize = async function () {
            initCallCount++;
            // Manually inject a mock provider if needed, or do nothing
        };

        // Mock GetValidTokens
        (MCPClient.prototype as any).getValidTokens = async function () {
            getTokensCallCount++;
            return true;
        };

        const session1 = {
            sessionId: 's1',
            active: true,
            serverId: 'server1',
            serverName: 'Server One',
            serverUrl: 'http://server1',
            transportType: 'sse' as const,
            callbackUrl: 'http://callback1',
        };
        const session2 = {
            sessionId: 's2',
            active: true,
            serverId: 'server2',
            serverName: 'Server Two',
            serverUrl: 'http://server2',
            transportType: 'streamable_http' as const,
            callbackUrl: 'http://callback2',
        };

        // Mock storage
        storage.getIdentitySessionsData = async (id: string) => {
            if (id === identity) return [session1, session2] as any;
            return [];
        };

        const config = await MCPClient.getMcpServerConfig(identity);

        expect(initCallCount).toBe(2);
        expect(getTokensCallCount).toBe(2);

        expect(config).toEqual({
            'server_one': expect.objectContaining({
                transport: 'sse',
                url: 'http://server1',
            }),
            'server_two': expect.objectContaining({
                transport: 'streamable_http',
                url: 'http://server2',
            }),
        });
    });

    test('should remove inactive sessions', async () => {
        const session1 = {
            sessionId: 's1',
            active: false,
            serverId: 'server1',
            serverUrl: 'http://server1',
            callbackUrl: 'http://callback1',
        };

        let removeSessionCalledWith: any[] = [];

        // Mock storage
        storage.getIdentitySessionsData = async (id: string) => {
            return [session1] as any;
        };
        storage.removeSession = async (id: string, sId: string) => {
            removeSessionCalledWith = [id, sId];
        };

        const config = await MCPClient.getMcpServerConfig(identity);

        expect(removeSessionCalledWith).toEqual([identity, 's1']);
        expect(config).toEqual({});
    });
});
