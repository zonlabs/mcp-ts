import { SessionListResult } from '../../shared/types';

/**
 * Abstraction layer for the AppHost's network communication.
 * 
 * This interface decouples the `AppHost` from the concrete networking implementation (like `SSEClient`).
 * Implementation can be:
 * 1. `SSEClient`: Direct connection to MCP Server (Browser -> Server).
 * 2. `ProxyClient`: Connection via an intermediary API (Browser -> Next.js API -> Server).
 */
export interface AppHostClient {
    /**
     * Check if the client is connected
     */
    isConnected(): boolean;

    /**
     * Get list of active sessions
     */
    getSessions(): Promise<SessionListResult>;

    /**
     * Call a tool on a specific session
     */
    callTool(sessionId: string, toolName: string, toolArgs: Record<string, unknown>): Promise<unknown>;

    /**
     * Read a resource from a specific session
     */
    readResource(sessionId: string, uri: string): Promise<unknown>;
}
