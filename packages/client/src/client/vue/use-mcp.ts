/**
 * useMcp Vue Composable
 * Manages MCP connections with SSE-based real-time updates
 */

import { ref, onMounted, onUnmounted, watch, computed, shallowRef } from 'vue';
import { SSEClient, type SSEClientOptions } from '../core/sse-client';
import {
    getInitialConnectionState,
    getVisibleConnectionState,
    isTransientReconnectState,
} from '../utils/session-state';
import type { McpConnectionEvent, McpConnectionState } from '../../shared/events';
import type {
    ToolInfo,
    FinishAuthResult,
    ListToolsRpcResult,
    ListPromptsResult,
    ListResourcesResult,
    SessionInfo,
} from '../../shared/types';

export interface UseMcpOptions {
    /**
     * SSE endpoint URL
     */
    url: string;

    /**
     * User/Client identifier
     */
    userId: string;

    /**
     * Optional auth token
     */
    authToken?: string;

    /**
     * Auto-connect on mount
     * @default true
     */
    autoConnect?: boolean;

    /**
     * Auto-initialize sessions on mount
     * @default true
     */
    autoInitialize?: boolean;

    /**
     * Connection event callback
     */
    onConnectionEvent?: (event: McpConnectionEvent) => void;

    /**
     * Debug logging callback
     */
    onLog?: (level: string, message: string, metadata?: Record<string, unknown>) => void;
    /**
     * Optional callback to handle OAuth redirects (e.g. for popup flow)
     * If provided, this will be called instead of window.location.href assignment
     */
    onRedirect?: (url: string) => void;

    /**
     * Request timeout in milliseconds
     * @default 60000
     */
    requestTimeout?: number;

    /**
     * Enable client debug logs.
     * @default false
     */
    debug?: boolean;
}

export interface McpConnection {
    sessionId: string;
    serverId: string;
    serverName: string;
    serverUrl?: string;
    transport?: string;
    state: McpConnectionState;
    tools: ToolInfo[];
    allTools?: ToolInfo[];
    prompts?: any[];
    resources?: any[];
    resourceTemplates?: any[];
    authUrl?: string;
    error?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface McpClient {
    /**
     * All connections (Represents a Reactive Ref)
     */
    connections: { value: McpConnection[] };

    /**
     * SSE connection status (Represents a Reactive Ref)
     */
    status: { value: 'connecting' | 'connected' | 'disconnected' | 'error' };

    /**
     * Whether initializing (Represents a Reactive Ref)
     */
    isInitializing: { value: boolean };

    /**
     * Connect to an MCP server
     */
    connect: (params: {
        serverId: string;
        serverName: string;
        serverUrl: string;
        callbackUrl: string;
        transport?: { type?: 'sse' | 'streamable-http' };
    }) => Promise<string>;

    /**
     * Disconnect from an MCP server
     */
    disconnect: (sessionId: string) => Promise<void>;

    /**
     * Reconnect to an MCP server (disconnects existing session first)
     */
    reconnect: (params: {
        serverId: string;
        serverName: string;
        serverUrl: string;
        callbackUrl: string;
        transport?: { type?: 'sse' | 'streamable-http' };
    }) => Promise<string>;

    /**
     * Get connection by session ID
     */
    getConnection: (sessionId: string) => McpConnection | undefined;

    /**
     * Get connection by server ID
     */
    getConnectionByServerId: (serverId: string) => McpConnection | undefined;

    /**
     * Check if server is connected
     */
    isServerConnected: (serverId: string) => boolean;

    /**
     * Get tools for a session
     */
    getTools: (sessionId: string) => ToolInfo[];

    /**
     * Refresh all connections
     */
    refresh: () => Promise<void>;

    /**
     * Manually connect SSE
     */
    connectSSE: () => void;

    /**
     * Manually disconnect SSE
     */
    disconnectSSE: () => void;

    /**
     * Complete OAuth authorization
     */
    finishAuth: (state: string, code: string, iss?: string) => Promise<FinishAuthResult>;

    /**
     * Explicitly resume OAuth flow for an existing session
     */
    resumeAuth: (sessionId: string) => Promise<void>;

    /**
     * Call a tool from a session
     */
    callTool: (
        sessionId: string,
        toolName: string,
        toolArgs: Record<string, unknown>
    ) => Promise<unknown>;

    /**
     * List available tools for a session
     */
    listTools: (sessionId: string) => Promise<ListToolsRpcResult>;

    /**
     * List available prompts for a session
     */
    listPrompts: (sessionId: string) => Promise<ListPromptsResult>;

    /**
     * Get a specific prompt with arguments
     */
    getPrompt: (sessionId: string, name: string, args?: Record<string, string>) => Promise<unknown>;

    /**
     * List available resources for a session
     */
    listResources: (sessionId: string) => Promise<ListResourcesResult>;

    /**
     * Read a specific resource
     */
    readResource: (sessionId: string, uri: string) => Promise<unknown>;

    /**
     * Access the underlying SSEClient instance (for advanced usage like AppHost)
     */
    sseClient: SSEClient | null;
}

/**
 * Vue Composable for MCP connection management with SSE
 */
export function useMcp(options: UseMcpOptions): McpClient {
    const {
        url,
        userId,
        authToken,
        autoConnect = true,
        autoInitialize = true,
        onConnectionEvent,
        onLog,
        onRedirect,
    } = options;

    // Use shallowRef for client instance as it doesn't need deep reactivity
    const clientRef = shallowRef<SSEClient | null>(null);
    const isMountedRef = ref(true);
    const suppressAuthRedirectSessions = ref(new Set<string>());

    const connections = ref<McpConnection[]>([]);
    const status = ref<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
    const isInitializing = ref(false);

    /**
     * Update connections based on event
     */
    const updateConnectionsFromEvent = (event: McpConnectionEvent) => {
        if (!isMountedRef.value) return;

        switch (event.type) {
            case 'state_changed': {
                const existing = connections.value.find((c) => c.sessionId === event.sessionId);
                if (existing) {
                    // Normalize the incoming backend state into the smoother user-facing
                    // state we want to render for this existing connection.
                    const normalizedState = getVisibleConnectionState(event.state, existing.state, event.previousState);
                    // In stateless per-request transport, tool calls can emit transient reconnect states.
                    // Keep READY sticky to avoid UI flicker from READY -> CONNECTING -> CONNECTED.
                    const nextState =
                        existing.state === 'READY' && isTransientReconnectState(normalizedState)
                            ? existing.state
                            : normalizedState;

                    const index = connections.value.indexOf(existing);
                    connections.value[index] = {
                        ...existing,
                        state: nextState,
                        // update createdAt if present in event, otherwise keep existing
                        createdAt: event.createdAt ? new Date(event.createdAt) : existing.createdAt,
                        updatedAt: new Date(),
                    };
                } else {
                    // Fix: Don't add back disconnected sessions that were just removed
                    if (event.state === 'DISCONNECTED') {
                        break;
                    }

                    connections.value = [...connections.value, {
                        sessionId: event.sessionId,
                        serverId: event.serverId,
                        serverName: event.serverName,
                        // New connections do not have prior local state, so we normalize
                        // only against the server-reported previous state.
                        state: getVisibleConnectionState(event.state, undefined, event.previousState),
                        createdAt: event.createdAt ? new Date(event.createdAt) : undefined,
                        updatedAt: new Date(),
                        tools: [],
                    }];
                }
                break;
            }

            case 'capabilities_discovered': {
                const index = connections.value.findIndex((c) => c.sessionId === event.sessionId);
                if (index !== -1) {
                    connections.value[index] = {
                        ...connections.value[index],
                        tools: event.tools,
                        allTools: (event as any).allTools,
                        prompts: (event as any).prompts,
                        resources: (event as any).resources,
                        resourceTemplates: (event as any).resourceTemplates,
                        state: 'READY',
                        updatedAt: new Date(),
                    };
                }
                break;
            }

            case 'auth_required': {
                const url = (event.authUrl || '').trim();
                if (!url) {
                    onLog?.('error', 'OAuth required but authorization URL is missing', { sessionId: event.sessionId });
                    const index = connections.value.findIndex((c) => c.sessionId === event.sessionId);
                    if (index !== -1) {
                        connections.value[index] = {
                            ...connections.value[index],
                            state: 'FAILED',
                            error: 'OAuth authorization URL not available',
                            authUrl: undefined,
                        };
                    }
                    break;
                }
                onLog?.('info', `OAuth required - redirecting to ${url}`, { authUrl: url });

                // Suppress redirects/popups for background auto-restore on page load.
                if (!suppressAuthRedirectSessions.value.has(event.sessionId)) {
                    if (onRedirect) {
                        onRedirect(url);
                    } else if (typeof window !== 'undefined') {
                        window.location.href = url;
                    }
                }
                const index = connections.value.findIndex((c) => c.sessionId === event.sessionId);
                if (index !== -1) {
                    connections.value[index] = { ...connections.value[index], state: 'AUTHENTICATING', authUrl: url };
                }
                break;
            }

            case 'error': {
                const index = connections.value.findIndex((c) => c.sessionId === event.sessionId);
                if (index !== -1) {
                    connections.value[index] = { ...connections.value[index], state: 'FAILED', error: event.error };
                }
                break;
            }

            case 'disconnected': {
                connections.value = connections.value.filter((c) => c.sessionId !== event.sessionId);
                break;
            }
        }
    };

    /**
     * Load sessions from server
     */
    const loadSessions = async () => {
        if (!clientRef.value) return;

        try {
            isInitializing.value = true;

            const result = await clientRef.value.listSessions();
            const sessions = result.sessions || [];

            // Initialize connections
            if (isMountedRef.value) {
                connections.value = sessions.map((s: SessionInfo) => ({
                    sessionId: s.sessionId,
                    serverId: s.serverId ?? 'unknown',
                    serverName: s.serverName ?? 'Unknown Server',
                    serverUrl: s.serverUrl,
                    transport: s.transport,
                    state: getInitialConnectionState(s.status),
                    createdAt: new Date(s.createdAt),
                    updatedAt: new Date(s.updatedAt ?? s.createdAt),
                    tools: [],
                }));
            }

            // Validate each session in parallel
            await Promise.all(
                sessions.map(async (session: SessionInfo) => {
                    if (clientRef.value) {
                        try {
                            // Pending auth sessions should not auto-trigger popup/redirect on reload.
                            if (session.status !== 'active') {
                                return;
                            }
                            suppressAuthRedirectSessions.value.add(session.sessionId);
                            await clientRef.value.getSession(session.sessionId);
                        } catch (error) {
                            console.error(`[useMcp] Failed to validate session ${session.sessionId}:`, error);
                        } finally {
                            suppressAuthRedirectSessions.value.delete(session.sessionId);
                        }
                    }
                })
            );
        } catch (error) {
            console.error('[useMcp] Failed to load sessions:', error);
            onLog?.('error', 'Failed to load sessions', { error });
        } finally {
            if (isMountedRef.value) {
                isInitializing.value = false;
            }
        }
    };

    /**
     * Initialize SSE client
     */
    const initClient = () => {
        // Disconnect existing if any
        if (clientRef.value) {
            clientRef.value.disconnect();
        }

        const clientOptions: SSEClientOptions = {
            url,
            userId,
            authToken,
            onConnectionEvent: (event) => {
                // Update local state based on event
                updateConnectionsFromEvent(event);

                // Call user callback
                onConnectionEvent?.(event);
            },
            onObservabilityEvent: (event) => {
                onLog?.(event.level || 'info', event.message || event.displayMessage || 'No message', event.metadata);
            },
            onStatusChange: (newStatus) => {
                if (isMountedRef.value) {
                    status.value = newStatus;
                }
            },
            debug: options.debug,
        };

        const client = new SSEClient(clientOptions);
        clientRef.value = client;

        if (autoConnect) {
            client.connect();

            if (autoInitialize) {
                loadSessions();
            }
        }
    };

    onMounted(() => {
        isMountedRef.value = true;
        initClient();
    });

    onUnmounted(() => {
        isMountedRef.value = false;
        clientRef.value?.disconnect();
    });

    /**
     * Connect to an MCP server
     */
    const connect = async (params: {
        serverId: string;
        serverName: string;
        serverUrl: string;
        callbackUrl: string;
        transport?: { type?: 'sse' | 'streamable-http' };
    }): Promise<string> => {
        if (!clientRef.value) {
            throw new Error('SSE client not initialized');
        }

        const result = await clientRef.value.connectToServer(params);
        return result.sessionId;
    };

    /**
     * Reconnect to an MCP server (tears down existing session, then connects fresh)
     */
    const reconnect = async (params: {
        serverId: string;
        serverName: string;
        serverUrl: string;
        callbackUrl: string;
        transport?: { type?: 'sse' | 'streamable-http' };
    }): Promise<string> => {
        if (!clientRef.value) {
            throw new Error('SSE client not initialized');
        }

        // Find and disconnect existing session for the same server
        const existing = connections.value.find(
            (c) => c.serverId === params.serverId || c.serverUrl === params.serverUrl
        );
        if (existing) {
            await clientRef.value.disconnectFromServer(existing.sessionId);
            if (isMountedRef.value) {
                connections.value = connections.value.filter((c) => c.sessionId !== existing.sessionId);
            }
        }

        // Connect fresh
        const result = await clientRef.value.connectToServer(params);
        return result.sessionId;
    };

    /**
     * Disconnect from an MCP server
     */
    const disconnect = async (sessionId: string): Promise<void> => {
        if (!clientRef.value) {
            throw new Error('SSE client not initialized');
        }

        await clientRef.value.disconnectFromServer(sessionId);

        // Remove from local state
        if (isMountedRef.value) {
            connections.value = connections.value.filter((c) => c.sessionId !== sessionId);
        }
    };

    /**
     * Refresh all connections
     */
    const refresh = async () => {
        await loadSessions();
    };

    /**
     * Manually connect SSE
     */
    const connectSSE = () => {
        clientRef.value?.connect();
    };

    /**
     * Manually disconnect SSE
     */
    const disconnectSSE = () => {
        clientRef.value?.disconnect();
    };

    /**
     * Complete OAuth authorization
     */
    const finishAuth = async (state: string, code: string, iss?: string): Promise<FinishAuthResult> => {
        if (!clientRef.value) {
            throw new Error('SSE client not initialized');
        }

        return await clientRef.value.finishAuth(state, code, iss);
    };

    /**
     * Explicit user action to resume OAuth for an existing pending session.
     */
    const resumeAuth = async (sessionId: string): Promise<void> => {
        if (!clientRef.value) {
            throw new Error('SSE client not initialized');
        }
        suppressAuthRedirectSessions.value.delete(sessionId);
        await clientRef.value.getSession(sessionId);
    };

    /**
     * Call a tool
     */
    const callTool = async (
        sessionId: string,
        toolName: string,
        toolArgs: Record<string, unknown>
    ): Promise<unknown> => {
        if (!clientRef.value) {
            throw new Error('SSE client not initialized');
        }

        return await clientRef.value.callTool(sessionId, toolName, toolArgs);
    };

    /**
     * List tools (refresh tool list)
     */
    const listTools = async (sessionId: string): Promise<ListToolsRpcResult> => {
        if (!clientRef.value) {
            throw new Error('SSE client not initialized');
        }

        return await clientRef.value.listTools(sessionId);
    };

    /**
     * List prompts
     */
    const listPrompts = async (sessionId: string): Promise<ListPromptsResult> => {
        if (!clientRef.value) {
            throw new Error('SSE client not initialized');
        }

        return await clientRef.value.listPrompts(sessionId);
    };

    /**
     * Get a specific prompt
     */
    const getPrompt = async (sessionId: string, name: string, args?: Record<string, string>): Promise<unknown> => {
        if (!clientRef.value) {
            throw new Error('SSE client not initialized');
        }

        return await clientRef.value.getPrompt(sessionId, name, args);
    };

    /**
     * List resources
     */
    const listResources = async (sessionId: string): Promise<ListResourcesResult> => {
        if (!clientRef.value) {
            throw new Error('SSE client not initialized');
        }

        return await clientRef.value.listResources(sessionId);
    };

    /**
     * Read a specific resource
     */
    const readResource = async (sessionId: string, uri: string): Promise<unknown> => {
        if (!clientRef.value) {
            throw new Error('SSE client not initialized');
        }

        return await clientRef.value.readResource(sessionId, uri);
    };

    // Utility functions
    const getConnection = (sessionId: string) => connections.value.find((c) => c.sessionId === sessionId);

    const getConnectionByServerId = (serverId: string) => connections.value.find((c) => c.serverId === serverId);

    const isServerConnected = (serverId: string) => {
        const conn = getConnectionByServerId(serverId);
        return conn ? conn.state === 'CONNECTED' || conn.state === 'DISCOVERING' || conn.state === 'READY' : false;
    };

    const getTools = (sessionId: string) => {
        const conn = getConnection(sessionId);
        return conn?.tools || [];
    };

    return {
        // Return them as Ref objects so they can be destructured and stay reactive
        connections: connections as unknown as { value: McpConnection[] },
        status: status as unknown as { value: 'connecting' | 'connected' | 'disconnected' | 'error' },
        isInitializing: isInitializing as unknown as { value: boolean },
        connect,
        reconnect,
        disconnect,
        getConnection,
        getConnectionByServerId,
        isServerConnected,
        getTools,
        refresh,
        connectSSE,
        disconnectSSE,
        finishAuth,
        resumeAuth,
        callTool,
        listTools,
        listPrompts,
        getPrompt,
        listResources,
        readResource,
        sseClient: clientRef.value,
    };
}
