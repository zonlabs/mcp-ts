

import { MCPClient } from './oauth-client.js';
import { storage, type SessionData } from '../storage/index.js';

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

    private async getActiveSessions(): Promise<SessionData[]> {
        const sessions = await storage.getIdentitySessionsData(this.identity);
        console.log(`[MultiSessionClient] All sessions for ${this.identity}:`,
            sessions.map(s => ({ sessionId: s.sessionId, serverId: s.serverId }))
        );
        const valid = sessions.filter(s => s.serverId && s.serverUrl && s.callbackUrl);
        console.log(`[MultiSessionClient] Filtered sessions:`, valid.length);
        return valid;
    }

    private async connectInBatches(sessions: SessionData[]): Promise<void> {
        const BATCH_SIZE = 5;
        for (let i = 0; i < sessions.length; i += BATCH_SIZE) {
            const batch = sessions.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(session => this.connectSession(session)));
        }
    }

    private async connectSession(session: SessionData): Promise<void> {
        const existingClient = this.clients.find(c => c.getSessionId() === session.sessionId);
        if (existingClient?.isConnected()) {
            return;
        }

        const maxRetries = this.options.maxRetries ?? 2;
        const retryDelay = this.options.retryDelay ?? 1000;
        let lastError: unknown;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const client = await this.createAndConnectClient(session);
                this.clients.push(client);
                return;
            } catch (error) {
                lastError = error;
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
        }

        console.error(`[MultiSessionClient] Failed to connect to session ${session.sessionId} after ${maxRetries + 1} attempts:`, lastError);
    }

    private async createAndConnectClient(session: SessionData): Promise<MCPClient> {
        const client = new MCPClient({
            identity: this.identity,
            sessionId: session.sessionId,
            serverId: session.serverId,
            serverUrl: session.serverUrl,
            callbackUrl: session.callbackUrl,
            serverName: session.serverName,
            transportType: session.transportType,
            headers: session.headers,
        });

        const timeoutMs = this.options.timeout ?? 15000;
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Connection timed out after ${timeoutMs}ms`)), timeoutMs);
        });

        await Promise.race([client.connect(), timeoutPromise]);
        return client;
    }

    async connect(): Promise<void> {
        const sessions = await this.getActiveSessions();
        await this.connectInBatches(sessions);
    }

    /**
     * Returns the array of currently connected clients.
     */
    getClients(): MCPClient[] {
        return this.clients;
    }

    /**
     * Disconnects all clients.
     */
    disconnect(): void {
        this.clients.forEach((client) => client.disconnect());
        this.clients = [];
    }
}

