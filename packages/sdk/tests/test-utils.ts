/**
 * Test utilities and mocks for MCP Redis library
 */
import RedisMock from 'ioredis-mock';
import { Redis } from 'ioredis';
import type { SessionStatus, StoredMcpServerOptions } from '../src/server/storage/types';

/**
 * Create a mock Redis instance for testing
 * Uses ioredis-mock to simulate Redis behavior
 */
export function createMockRedis(): Redis {
    return new RedisMock() as unknown as Redis;
}

/**
 * Clear all data from mock Redis
 */
export async function clearMockRedis(redis: Redis): Promise<void> {
    await redis.flushall();
}

/**
 * Create a mock session for testing
 */
export function createMockSession(overrides: Partial<MockSession> = {}): MockSession {
    const now = Date.now();
    return {
        sessionId: 'test-session-123',
        userId: 'test-user-456',
        serverId: 'test-server',
        serverName: 'Test MCP Server',
        serverUrl: 'https://mcp.example.com',
        callbackUrl: 'https://app.example.com/callback',
        serverOptions: { transport: { type: 'sse' } },
        status: 'active',
        createdAt: now,
        updatedAt: now,
        ...overrides,
    };
}

export interface MockSession {
    sessionId: string;
    userId: string;
    serverId: string;
    serverName: string;
    serverUrl: string;
    callbackUrl: string;
    serverOptions?: StoredMcpServerOptions | null;
    status?: SessionStatus;
    createdAt: number;
    updatedAt?: number;
    clientInformation?: {
        client_id: string;
        client_name: string;
    };
    tokens?: {
        access_token: string;
        token_type: string;
        expires_in?: number;
        refresh_token?: string;
    };
    headers?: Record<string, string>;
    oauthState?: {
        nonce: string;
        sessionId: string;
        serverId: string;
        createdAt: number;
    } | null;
}

/**
 * Create mock OAuth tokens for testing
 */
export function createMockTokens(overrides: Partial<MockSession['tokens']> = {}): NonNullable<MockSession['tokens']> {
    return {
        access_token: 'mock-access-token-12345',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'mock-refresh-token-67890',
        ...overrides,
    };
}

/**
 * Create mock client information for testing
 */
export function createMockClientInfo(overrides: Partial<MockSession['clientInformation']> = {}): NonNullable<MockSession['clientInformation']> {
    return {
        client_id: 'mock-client-id',
        client_name: 'Test MCP Client',
        ...overrides,
    };
}
