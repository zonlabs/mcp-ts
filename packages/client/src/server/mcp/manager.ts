import { McpClient, type McpListChangedEvent } from './client.js';
import { sessions, withDbObservability, type Session, type SessionStore } from '../storage/index.js';
import type { BaseClient, BaseClientProvider, ToolClient, ToolClientProvider } from '../../shared/types.js';
import { createToolPolicyGateway } from './tool-policy-gateway.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1000;
const CONNECTION_BATCH_SIZE = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface McpManagerOptions {
    /**
     * Connection timeout in milliseconds.
     * @default 15000
     */
    timeout?: number;

    /**
     * Maximum number of retry attempts per session.
     * @default 2
     */
    maxRetries?: number;

    /**
     * Delay between retry attempts in milliseconds.
     * @default 1000
     */
    retryDelay?: number;

    /**
     * Custom session store. When provided, all DB operations go through
     * this store instead of the default global `sessions` singleton.
     * Useful for wrapping with `withDbObservability()` for debugging.
     */
    sessionStore?: SessionStore;

    /**
     * Custom session provider. When provided, `connect()` calls this
     * instead of querying the storage backend. Useful when sessions are
     * synced externally (e.g. via Supabase Realtime, WebSocket, or an
     * in-memory cache).
     *
     * Default: reads from the storage backend via `sessions.list(userId)`.
     */
    sessionProvider?: () => Promise<Session[]>;

    /**
     * Attached to each McpClient before connect() so all connection lifecycle
     * events (INITIALIZING, CONNECTING, CONNECTED, etc.) are captured.
     */
    onObservabilityEvent?: McpObservabilityEventHandler;

    /**
     * Called after a session is successfully connected.
     */
    onSessionConnected?: (sessionId: string, client: McpClient) => void;

    /**
     * Called when a session is evicted from the in-memory client list
     * because it no longer exists in the active sessions list.
     */
    onSessionEvicted?: (sessionId: string) => void;

    /**
     * Called when all retry attempts for a session have been exhausted.
     */
    onSessionFailed?: (sessionId: string, error: unknown) => void;
    /** Called when a connected server reports a changed catalog list. */
    onListChanged?: (sessionId: string, event: McpListChangedEvent) => void;
}

/** @internal */
type McpObservabilityEventHandler = (event: import('../../shared/events.js').McpObservabilityEvent) => void;

// ---------------------------------------------------------------------------
// McpManager
// ---------------------------------------------------------------------------

/**
 * Manages all active MCP client connections for a single user.
 *
 * Automatically restores sessions from durable storage, performs batch
 * connections with retry handling, and provides unified tool aggregation
 * and access policy routing across all connected servers.
 *
 * @implements {BaseClientProvider}
 * @example
 * ```ts
 * const manager = new McpManager("user_123");
 * await manager.connect();
 * const clients = manager.getClients();
 * ```
 */
export class McpManager implements BaseClientProvider {
    private clients: McpClient[] = [];
    private connectionPromises = new Map<string, Promise<void>>();
    private userId: string;
    private options: Required<Pick<McpManagerOptions, 'timeout' | 'maxRetries' | 'retryDelay'>> &
        Pick<McpManagerOptions, 'sessionProvider' | 'onObservabilityEvent' | 'onSessionConnected' | 'onSessionEvicted' | 'onSessionFailed' | 'onListChanged'>;

    /**
     * @param userId - Unique identifier for the user (e.g. user ID or email).
     * @param options - Optional tuning and lifecycle hooks.
     */
    constructor(userId: string, options: McpManagerOptions = {}) {
        this.userId = userId;
        this.options = {
            timeout: DEFAULT_TIMEOUT_MS,
            maxRetries: DEFAULT_MAX_RETRIES,
            retryDelay: DEFAULT_RETRY_DELAY_MS,
            ...options,
        };

        this._store = options.onObservabilityEvent
            ? withDbObservability(options.sessionStore ?? sessions, options.onObservabilityEvent)
            : (options.sessionStore ?? sessions);
    }

    private _store: SessionStore;

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Fetches active sessions and establishes connections to all of them.
     *
     * Call this once after creating the client. On long-running servers you
     * can cache the `McpManager` instance and call `connect()` on
     * each request — already-connected sessions are skipped internally.
     */
    async connect(): Promise<void> {
        const sessions = await this.fetchActiveSessions();
        const activeSessionIds = new Set(sessions.map(s => s.sessionId));

        for (const client of this.clients) {
            if (!activeSessionIds.has(client.getSessionId())) {
                this.options.onSessionEvicted?.(client.getSessionId());
            }
        }
        this.clients = this.clients.filter(c => activeSessionIds.has(c.getSessionId()));

        await this.connectInBatches(sessions);
    }

    /**
     * Drops all cached `McpClient` instances and reconnects fresh from storage.
     *
     * Call this when downstream MCP servers have expired their transport sessions
     * (e.g. after a remote server restart) and subsequent tool calls return
     * "Session not found. Reconnect without session header." errors.
     *
     * OAuth tokens are preserved in the storage backend — no re-authentication
     * is required. Only the in-memory transport sessions are cleared.
     */
    async reconnect(): Promise<void> {
        await this.disconnect();
        await this.connect();
    }

    /**
     * Returns all currently connected `BaseClient` instances.
     *
     * Use this to enumerate available tools across all connected servers,
     * or to route a tool call to the right client by `serverId`.
     */
    getClients(): BaseClient[] {
        return this.clients.map((client) =>
            createToolPolicyGateway(this.userId, client.getSessionId(), client)
        );
    }

    /**
     * Removes and disconnects a single session by ID.
     *
     * @returns `true` if the session was found and removed, `false` if not found.
     */
    async removeSession(sessionId: string): Promise<boolean> {
        const idx = this.clients.findIndex(c => c.getSessionId() === sessionId);
        if (idx === -1) return false;
        const [client] = this.clients.splice(idx, 1);
        await client.disconnect();
        return true;
    }

    /**
     * Gracefully disconnects all active MCP clients and clears the internal list.
     *
     * For Streamable HTTP sessions, each client sends an HTTP DELETE to its MCP
     * endpoint per the spec before closing locally. All disconnects run in
     * parallel so shutdown is not serialised across many sessions.
     *
     * Call this during server shutdown or when a user logs out to free up
     * underlying transport resources (SSE streams, HTTP connections, etc.).
     */
    async disconnect(): Promise<void> {
        await Promise.all(this.clients.map((client) => client.disconnect()));
        this.clients = [];
    }

    // -----------------------------------------------------------------------
    // Internals
    // -----------------------------------------------------------------------

    /**
     * Resolves the list of sessions to connect.
     *
     * Uses the custom `sessionProvider` when provided, otherwise falls back
     * to querying the storage backend via `sessions.list(userId)`.
     */
    private async fetchActiveSessions(): Promise<Session[]> {
        const sessionList = this.options.sessionProvider
            ? await this.options.sessionProvider()
            : await this._store.list(this.userId);

        return sessionList.filter(s =>
            s.serverId &&
            s.serverUrl &&
            s.callbackUrl &&
            s.status === 'active' &&
            s.enabled !== false
        );
    }

    /**
     * Connects a list of sessions in controlled batches.
     *
     * Batching prevents overwhelming the event loop or external servers when
     * a user has many active MCP sessions. Within each batch, sessions are
     * connected concurrently using `Promise.all`.
     */
    private async connectInBatches(sessions: Session[]): Promise<void> {
        for (let i = 0; i < sessions.length; i += CONNECTION_BATCH_SIZE) {
            const batch = sessions.slice(i, i + CONNECTION_BATCH_SIZE);
            await Promise.all(batch.map(session => this.connectSession(session)));
        }
    }

    /**
     * Connects a single session, with deduplication to prevent race conditions.
     *
     * - If a client for this session already exists and is connected, returns
     *   immediately.
     * - If the existing client entry is no longer connected (e.g. explicit
     *   disconnect), it is evicted so a fresh transport is created.
     * - If a connection attempt for this session is already in-flight, the
     *   existing promise is reused as a per-session mutex.
     * - On completion (success or failure), the promise is cleaned up from
     *   the connectionPromises map.
     */
    private async connectSession(session: Session): Promise<void> {
        const existing = this.clients.find(c => c.getSessionId() === session.sessionId);

        if (existing) {
            if (existing.isConnected()) {
                return;
            }

            this.options.onSessionEvicted?.(existing.getSessionId());
            this.clients = this.clients.filter(c => c !== existing);
        }

        if (this.connectionPromises.has(session.sessionId)) {
            return this.connectionPromises.get(session.sessionId)!;
        }

        const connectPromise = this.establishConnectionWithRetries(session);

        this.connectionPromises.set(session.sessionId, connectPromise);

        try {
            await connectPromise;
        } finally {
            this.connectionPromises.delete(session.sessionId);
        }
    }

    /**
     * Core connection loop for a single session with retry logic.
     *
     * 1. Creates a fresh `MCPClient` from the session data.
     * 2. Races `client.connect()` against a timeout.
     * 3. On success, replaces any stale entry and fires `onSessionConnected`.
     * 4. On failure, waits `retryDelay` ms before the next attempt.
     *
     * If all attempts are exhausted, logs an error and returns silently so
     * a single bad server doesn't block the rest of the batch.
     */
    private async establishConnectionWithRetries(session: Session): Promise<void> {
        const maxRetries = this.options.maxRetries;
        const retryDelay = this.options.retryDelay;
        let lastError: unknown;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const client = new McpClient({
                    userId: this.userId,
                    sessionId: session.sessionId,
                    serverId: session.serverId,
                    serverUrl: session.serverUrl,
                    callbackUrl: session.callbackUrl,
                    serverName: session.serverName,
                    transport: session.serverOptions?.transport,
                    headers: session.headers,
                    client: session.serverOptions?.client ?? undefined,
                    serverOptions: session.serverOptions ?? undefined,
                    discoverResult: session.serverOptions?.discoverResult ?? undefined,
                    clientInformation: session.clientInformation ?? (session.clientId ? { client_id: session.clientId } : undefined),
                    hasSession: true,
                    cachedCredentials: { tokens: session.tokens ?? undefined },
                    sessionStore: this._store,
                });

                client.onListChanged((event) => {
                    this.options.onListChanged?.(session.sessionId, event);
                });

                // Attach observability listener BEFORE connect to capture all lifecycle events
                if (this.options.onObservabilityEvent) {
                    client.onObservabilityEvent(this.options.onObservabilityEvent);
                }

                const timeoutMs = this.options.timeout;
                let timeoutTimer: ReturnType<typeof setTimeout>;
                const timeoutPromise = new Promise<never>((_, reject) => {
                    timeoutTimer = setTimeout(
                        () => reject(new Error(`Connection timed out after ${timeoutMs}ms`)),
                        timeoutMs,
                    );
                });

                try {
                    await Promise.race([client.connect(), timeoutPromise]);
                } finally {
                    clearTimeout(timeoutTimer!);
                }

                this.clients = this.clients.filter(c => c.getSessionId() !== session.sessionId);
                this.clients.push(client);
                this.options.onSessionConnected?.(session.sessionId, client);
                return;

            } catch (error) {
                lastError = error;
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
        }

        this.options.onSessionFailed?.(session.sessionId, lastError);
        console.error(
            `[McpManager] Failed to connect to session ${session.sessionId} ` +
            `after ${maxRetries + 1} attempts:`,
            lastError,
        );
    }
}
