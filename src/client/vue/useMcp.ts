/**
 * useMcp Vue Composable
 * Manages MCP connections with SSE-based real-time updates
 * Based on Cloudflare's agents pattern
 */

import { ref, onMounted, onUnmounted, watch, computed, shallowRef } from 'vue';
import { SSEClient, type SSEClientOptions } from '../core/sse-client';
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
    identity: string;

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
}

export interface McpConnection {
    sessionId: string;
    serverId: string;
    serverName: string;
    serverUrl?: string;
    transport?: string;
    state: McpConnectionState;
    tools: ToolInfo[];
    error?: string;
    connectedAt?: Date;
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
        transportType?: 'sse' | 'streamable_http';
    }) => Promise<string>;

    /**
     * Disconnect from an MCP server
     */
    disconnect: (sessionId: string) => Promise<void>;

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
    finishAuth: (sessionId: string, code: string) => Promise<FinishAuthResult>;

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
}

/**
 * Vue Composable for MCP connection management with SSE
 */
export function useMcp(options: UseMcpOptions): McpClient {
    const {
        url,
        identity,
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
                    // Update existing connection in place to trigger reactivity granularly if needed, or replace
                    // For Vue simple replacement is fine and often cleaner
                    const index = connections.value.indexOf(existing);
                    connections.value[index] = { ...existing, state: event.state };
                } else {
                    connections.value = [...connections.value, {
                        sessionId: event.sessionId,
                        serverId: event.serverId,
                        serverName: event.serverName,
                        state: event.state,
                        tools: [],
                    }];
                }
                break;
            }

            case 'tools_discovered': {
                const index = connections.value.findIndex((c) => c.sessionId === event.sessionId);
                if (index !== -1) {
                    connections.value[index] = { ...connections.value[index], tools: event.tools, state: 'READY' };
                }
                break;
            }

            case 'auth_required': {
                // Handle OAuth redirect
                if (event.authUrl) {
                    onLog?.('info', `OAuth required - redirecting to ${event.authUrl}`, { authUrl: event.authUrl });

                    if (onRedirect) {
                        onRedirect(event.authUrl);
                    } else if (typeof window !== 'undefined') {
                        window.location.href = event.authUrl;
                    }
                }
                const index = connections.value.findIndex((c) => c.sessionId === event.sessionId);
                if (index !== -1) {
                    connections.value[index] = { ...connections.value[index], state: 'AUTHENTICATING' };
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

            const result = await clientRef.value.getSessions();
            const sessions = result.sessions || [];

            // Initialize connections
            if (isMountedRef.value) {
                connections.value = sessions.map((s: SessionInfo) => ({
                    sessionId: s.sessionId,
                    serverId: s.serverId ?? 'unknown',
                    serverName: s.serverName ?? 'Unknown Server',
                    serverUrl: s.serverUrl,
                    transport: s.transport,
                    state: 'VALIDATING' as McpConnectionState,
                    tools: [],
                }));
            }

            // Validate each session in parallel
            await Promise.all(
                sessions.map(async (session: SessionInfo) => {
                    if (clientRef.value) {
                        try {
                            await clientRef.value.restoreSession(session.sessionId);
                        } catch (error) {
                            console.error(`[useMcp] Failed to validate session ${session.sessionId}:`, error);
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
            identity,
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

    // Watch for option changes to re-initialize
    // Note: Deep watching options object might be expensive, so we watch specific props if possible
    // In a composable, usually the arguments are reactive refs or simple values.
    // Here options is a plain object, so we might not react to its changes unless the user passes refs inside options (which our interface doesn't strictly support yet).
    // However, if the user calls useMcp with different args due to re-render of parent handling it, this code runs once.
    // To support reactivity on inputs, we'd need the inputs to be Refs.
    // For now, mirroring React hook behavior: we assume options might change if the component re-executes, but in Vue setup() runs once.
    // So to truly support reactive URL/Identity changes, they should be Refs.
    // But to keep API simple and consistent with React one (which takes object), we will leave it static for now
    // or use `watch(() => [options.url, options.identity], ...)` if we expected them to be reactive sources.
    // Given the TS definition uses string, they are likely static or unwrapped refs.

    // If the user wants to change identity/url dynamically, they should destroy and recreate the composable or we should accept MaybeRef.
    // For maintainability/simplicity matching the React version, we assume static config for the lifetime of the component/composable usage unless we want to enhance it.
    // Let's stick to the simple version first.


    /**
     * Connect to an MCP server
     */
    const connect = async (params: {
        serverId: string;
        serverName: string;
        serverUrl: string;
        callbackUrl: string;
        transportType?: 'sse' | 'streamable_http';
    }): Promise<string> => {
        if (!clientRef.value) {
            throw new Error('SSE client not initialized');
        }

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
    const finishAuth = async (sessionId: string, code: string): Promise<FinishAuthResult> => {
        if (!clientRef.value) {
            throw new Error('SSE client not initialized');
        }

        return await clientRef.value.finishAuth(sessionId, code);
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
        return conn?.state === 'CONNECTED';
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
        disconnect,
        getConnection,
        getConnectionByServerId,
        isServerConnected,
        getTools,
        refresh,
        connectSSE,
        disconnectSSE,
        finishAuth,
        callTool,
        listTools,
        listPrompts,
        getPrompt,
        listResources,
        readResource,
    };
}
