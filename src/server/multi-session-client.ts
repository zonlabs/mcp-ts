
import { MCPClient } from './oauth-client';
import { storage } from './storage';
import type { ToolSet } from 'ai';

/**
 * Manages multiple MCP connections for a single user identity.
 * Allows aggregating tools from all connected servers.
 */
export interface MultiSessionOptions {
    /**
     * Connection timeout in milliseconds
     * @default 15000
     */
    timeout?: number;
    /**
     * Maximum number of retry attempts
     * @default 2
     */
    maxRetries?: number;
    /**
     * Delay between retries in milliseconds
     * @default 1000
     */
    retryDelay?: number;
}

/**
 * Manages multiple MCP connections for a single user identity.
 * Allows aggregating tools from all connected servers.
 */
export class MultiSessionClient {
    private clients: MCPClient[] = [];
    private identity: string;
    private options: MultiSessionOptions;

    constructor(identity: string, options: MultiSessionOptions = {}) {
        this.identity = identity;
        this.options = {
            timeout: 15000,
            maxRetries: 2,
            retryDelay: 1000,
            ...options
        };
    }

    /**
     * Connects to all active sessions for the user.
     * Skips sessions that fail to connect, but logs errors.
     */
    async connect(): Promise<void> {
        const sessions = await storage.getIdentitySessionsData(this.identity);

        /** Filter only active sessions */
        const activeSessions = sessions.filter(
            (s) => s.active && s.serverId && s.serverUrl && s.callbackUrl
        );

        // Concurrency Control: Process connections in batches of 5
        const BATCH_SIZE = 5;
        for (let i = 0; i < activeSessions.length; i += BATCH_SIZE) {
            const batch = activeSessions.slice(i, i + BATCH_SIZE);
            await Promise.all(
                batch.map(async (session) => {
                    let lastError;
                    const maxRetries = this.options.maxRetries ?? 2;
                    const retryDelay = this.options.retryDelay ?? 1000;

                    for (let attempt = 0; attempt <= maxRetries; attempt++) {
                        try {
                            const existingClient = this.clients.find(c => c.getSessionId() === session.sessionId);
                            if (existingClient && existingClient.isConnected()) {
                                return; // Already connected
                            }

                            const client = new MCPClient({
                                identity: this.identity,
                                sessionId: session.sessionId,
                                serverId: session.serverId,
                                serverUrl: session.serverUrl,
                                callbackUrl: session.callbackUrl,
                                serverName: session.serverName,
                                transportType: session.transportType,
                                headers: session.headers,
                                /** Pass other necessary options if any */
                            });

                            // Race connection against timeout
                            const timeoutMs = this.options.timeout ?? 15000;
                            const timeoutPromise = new Promise((_, reject) => {
                                setTimeout(() => reject(new Error(`Connection timed out after ${timeoutMs}ms`)), timeoutMs);
                            });

                            await Promise.race([
                                client.connect(),
                                timeoutPromise
                            ]);

                            this.clients.push(client);
                            return; // Success!

                        } catch (error) {
                            lastError = error;

                            // Log warning if not last attempt
                            if (attempt < maxRetries) {
                                // console.warn(`[MultiSessionClient] Connection attempt ${attempt + 1}/${maxRetries + 1} failed for session ${session.sessionId}. Retrying in ${retryDelay}ms... Error: ${error}`);
                                await new Promise(resolve => setTimeout(resolve, retryDelay));
                            }
                        }
                    }

                    // If we get here, all retries failed
                    console.error(`[MultiSessionClient] Failed to connect to session ${session.sessionId} after ${maxRetries + 1} attempts:`, lastError);
                })
            );
        }
    }

    /**
     * Aggregates AI tools from all connected clients.
     * Assumes tools are namespaced by serverId in MCPClient.getAITools()
     */
    async getAITools(): Promise<ToolSet> {
        const results = await Promise.all(
            this.clients.map(async (client) => {
                try {
                    return await client.getAITools();
                } catch (error) {
                    console.error(`[MultiSessionClient] Failed to fetch tools from ${client.getServerId()}:`, error);
                    return {}; // Return empty set on failure so other tools still work
                }
            })
        );

        /** Merge all tool objects into one */
        return results.reduce((acc, tools) => ({ ...acc, ...tools }), {});
    }

    /**
     * Disconnects all clients.
     */
    disconnect(): void {
        this.clients.forEach((client) => client.disconnect());
        this.clients = [];
    }
}
