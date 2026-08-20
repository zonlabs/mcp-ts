import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import toast from 'react-hot-toast';
import type { McpServer, ToolInfo, ToolAccessResult, ToolPolicy } from '@/types/mcp';
import { normalizeServerUrl } from '@/lib/url';
import type { McpConnection } from '@mcp-ts/client/react';

export type { McpConnection };

/**
 * Stored Connection Type
 * Represents an active MCP server connection with its state
 */
/**
 * Connection Status Types
 * Granular states for real-time connection tracking
 */
export type ConnectionStatus =
  | 'DISCONNECTED'      // Not connected
  | 'INITIALIZING'      // Session/config initialization
  | 'CONNECTING'        // Initial connection attempt
  | 'AUTHENTICATING'    // OAuth flow in progress
  | 'AUTHENTICATED'     // OAuth complete, pre-connect
  | 'DISCOVERING'       // Fetching tools from server
  | 'CONNECTED'         // Fully connected with tools
  | 'READY'             // Final ready state after discovery
  | 'VALIDATING'        // Legacy: validating existing session
  | 'FAILED';           // Connection error

export interface StoredConnection {
  sessionId: string;
  serverId: string;
  serverName: string;
  url?: string;
  transport?: string;
  connectionStatus: ConnectionStatus;
  tools: ToolInfo[];
  allTools?: ToolInfo[];
  prompts?: Array<{
    name: string;
    description?: string;
    arguments?: Array<{
      name: string;
      description?: string;
      required?: boolean;
    }>;
  }>;
  resources?: Array<{
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
  }>;
  resourceTemplates?: Array<{
    uriTemplate: string;
    name: string;
    description?: string;
    mimeType?: string;
  }>;
  toolPolicy?: ToolPolicy;
  enabled?: boolean;
  connectedAt: string;
  createdAt?: string;
  updatedAt?: string;
  error?: string;
  /** Caller-supplied metadata, stored and returned opaquely. */
  metadata?: Record<string, string>;
}
type McpActionsBundle = {
  connect: any;
  disconnect: any;
  callTool: any;
  reconnect: any;
  finishAuth?: (state: string, code: string, iss?: string) => Promise<unknown>;
  getToolAccess?: (sessionId: string) => Promise<ToolAccessResult>;
  updateToolPolicy?: (
    sessionId: string,
    policy: { mode: ToolPolicy["mode"]; toolIds?: string[] }
  ) => Promise<ToolAccessResult>;
  updateSession?: (
    sessionId: string,
    enabled: boolean
  ) => Promise<{ success: boolean }>;
  listPrompts?: (sessionId: string) => Promise<{
    prompts: Array<{ name: string; description?: string; arguments?: Array<{ name: string; description?: string; required?: boolean }> }>;
  }>;
  getPrompt?: (
    sessionId: string,
    name: string,
    args?: Record<string, string>
  ) => Promise<unknown>;
  listResources?: (sessionId: string) => Promise<{
    resources: Array<{ uri: string; name: string; description?: string; mimeType?: string }>;
  }>;
  listResourceTemplates?: (sessionId: string) => Promise<{
    resourceTemplates: Array<{ uriTemplate: string; name: string; description?: string; mimeType?: string }>;
  }>;
  readResource?: (sessionId: string, uri: string) => Promise<unknown>;
};

function normalizeConnectionStatus(
  status?: string | null
): ConnectionStatus {
  if (!status) return 'DISCONNECTED';
  const upper = status.toUpperCase();
  switch (upper) {
    case 'DISCONNECTED':
    case 'INITIALIZING':
    case 'CONNECTING':
    case 'AUTHENTICATING':
    case 'AUTHENTICATED':
    case 'DISCOVERING':
    case 'CONNECTED':
    case 'READY':
    case 'VALIDATING':
    case 'FAILED':
      return upper as ConnectionStatus;
    default:
      return 'DISCONNECTED';
  }
}

function normalizeTransport(value?: string | null): "sse" | "streamable-http" {
  if (!value) return "streamable-http";
  const normalized = value.trim().toLowerCase();
  if (normalized === "sse") return "sse";
  if (normalized === "streamable-http" || normalized === "streamable_http" || normalized === "streamablehttp") {
    return "streamable-http";
  }
  return "sse";
}

function normalizeHeaders(
  headers?: Record<string, string> | Array<{ key: string; value: string }> | null
): Record<string, string> | undefined {
  if (!headers) return undefined;

  const entries = Array.isArray(headers)
    ? headers.map((header) => [header.key, header.value] as const)
    : Object.entries(headers);

  const normalized = entries
    .map(([key, value]) => [String(key).trim(), String(value).trim()] as const)
    .filter(([key, value]) => key.length > 0 && value.length > 0);

  return normalized.length > 0 ? Object.fromEntries(normalized) : undefined;
}

export function findConnectionForServer<T extends { id: string; url?: string | null }>(
  connections: Record<string, StoredConnection>,
  server: T
): StoredConnection | undefined {
  const byId = Object.values(connections).find(
    (c) => c.serverId === server.id || c.metadata?.catalogServerId === server.id
  );
  if (byId) return byId;

  const normalizedServerUrl = normalizeServerUrl(server.url);
  if (!normalizedServerUrl) return undefined;

  return Object.values(connections).find(
    (c) => normalizeServerUrl(c.url) === normalizedServerUrl
  );
}

/**
 * Server State Slice
 * Manages MCP server catalog (both public and user servers)
 */
interface ServerState {
  // Public servers (paginated from registry)
  publicServers: McpServer[];
  publicServersLoading: boolean;
  publicServersError: string | null;
  publicServersCursor: string | null;
  publicServersHasNext: boolean;
  publicServersTotalCount: number;

  // User's personal servers
  userServers: McpServer[];
  userServersLoading: boolean;
  userServersError: string | null;
  userServersTotalCount: number;
}

/**
 * Connection State Slice
 * Manages active MCP connections and their status
 */
interface ConnectionState {
  connections: Record<string, StoredConnection>;
  connectionsLoading: boolean;
  isValidating: boolean;
  validationProgress: { validated: number; total: number } | null;
  activeConnectionCount: number;
  mcpActions: McpActionsBundle | null;
}

/**
 * UI State Slice
 * Manages UI-specific state like filters, search, selected items
 */
interface UIState {
  // Filters and search
  searchQuery: string;
  selectedCategory: string | null;
  activeTab: 'public' | 'user';

  // Selected items
  selectedServer: McpServer | null;

  // View modes
  viewMode: 'browse' | 'add' | 'edit';
  editingServer: McpServer | null;

  // Tool tester
  toolTesterOpen: boolean;
  selectedToolName: string | null;

  // Dialogs
  deleteDialogOpen: boolean;
  serverToDelete: string | null;

  // Sidebar
  sidebarOpen: boolean;
}

/**
 * Server Actions
 * Operations for managing server catalog
 */
interface ServerActions {
  // Public servers
  fetchPublicServers: (variables?: {
    first?: number;
    after?: string;
    searchQuery?: string;
    categorySlug?: string;
  }) => Promise<void>;
  loadMorePublicServers: () => Promise<void>;

  // User servers
  fetchUserServers: () => Promise<void>;
  addServer: (server: Partial<McpServer>) => Promise<McpServer | null>;
  updateServer: (serverId: string, updates: Partial<McpServer>) => Promise<McpServer | null>;
  deleteServer: (serverId: string) => Promise<boolean>;
}

/**
 * Connection Actions
 * Operations for managing connections
 */
interface ConnectionActions {
  connect: (server: McpServer) => Promise<void>;
  disconnect: (sessionId: string) => Promise<void>;
  syncConnections: (connections: Record<string, any>) => void;
  setMcpActions: (actions: McpActionsBundle) => void;
  mcpActions: McpActionsBundle | null;
  validateSession: (sessionId: string) => Promise<void>;
  validateAllSessions: () => Promise<void>;
  fetchSessionTools: (sessionId: string) => Promise<ToolInfo[]>;
  updateConnectionStatus: (sessionId: string, status: ConnectionStatus, tools?: ToolInfo[]) => void;
  updateConnectionToolAccess: (sessionId: string, access: ToolAccessResult) => void;
  getConnection: (sessionId: string) => StoredConnection | undefined;
  getConnectionByServerId: (serverId: string) => StoredConnection | undefined;
  getConnectionStatus: (sessionId: string) => ConnectionStatus | undefined;
  isServerConnected: (serverId: string) => boolean;
  getServerTools: (sessionId: string) => ToolInfo[] | undefined;
}

/**
 * UI Actions
 * Operations for managing UI state
 */
interface UIActions {
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: string | null) => void;
  setActiveTab: (tab: 'public' | 'user') => void;
  setSelectedServer: (server: McpServer | null) => void;
  setViewMode: (mode: 'browse' | 'add' | 'edit') => void;
  setEditingServer: (server: McpServer | null) => void;
  openToolTester: (toolName: string) => void;
  closeToolTester: () => void;
  openDeleteDialog: (serverId: string) => void;
  closeDeleteDialog: () => void;
  toggleSidebar: () => void;
  resetUIState: () => void;
}

/**
 * Combined MCP Store Type
 */
export type McpStore = ServerState &
  ConnectionState &
  UIState &
  ServerActions &
  ConnectionActions &
  UIActions;

/**
 * Initial state values
 */
const initialServerState: ServerState = {
  publicServers: [],
  publicServersLoading: false,
  publicServersError: null,
  publicServersCursor: null,
  publicServersHasNext: false,
  publicServersTotalCount: 0,

  userServers: [],
  userServersLoading: false,
  userServersError: null,
  userServersTotalCount: 0,
};

const initialConnectionState: ConnectionState = {
  connections: {},
  connectionsLoading: false,
  isValidating: false,
  validationProgress: null,
  activeConnectionCount: 0,
  mcpActions: null,
};

const initialUIState: UIState = {
  searchQuery: '',
  selectedCategory: null,
  activeTab: 'public',
  selectedServer: null,
  viewMode: 'browse',
  editingServer: null,
  toolTesterOpen: false,
  selectedToolName: null,
  deleteDialogOpen: false,
  serverToDelete: null,
  sidebarOpen: true,
};

/**
 * Main MCP Zustand Store
 * Centralized state management for all MCP-related data
 * Uses persist middleware to store connections in localStorage
 */
export const useMcpStore = create<McpStore>()(
  devtools(
    persist(
      (set, get) => ({
        // ==================== STATE ====================
        ...initialServerState,
        ...initialConnectionState,
        ...initialUIState,

        // ==================== SERVER ACTIONS ====================

        /**
         * Fetch public servers with optional filters and pagination
         */
        fetchPublicServers: async (variables = {}) => {
          set({ publicServersLoading: true, publicServersError: null });

          try {
            const params = new URLSearchParams();
            params.set('first', String(variables.first || 20));
            params.set('public', 'true');
            params.set('orderBy', '-createdAt');
            if (variables.after) params.set('after', variables.after);
            if (variables.categorySlug) params.set('categorySlug', variables.categorySlug);

            const response = await fetch(`/api/mcp?${params}`);
            const data = await response.json();
            if (!response.ok) {
              throw new Error(data.error || 'Failed to fetch servers');
            }

            const servers: McpServer[] = Array.isArray(data.servers) ? data.servers : [];

            set({
              publicServers: variables.after ? [...get().publicServers, ...servers] : servers,
              publicServersCursor: data.pageInfo?.endCursor ?? null,
              publicServersHasNext: Boolean(data.pageInfo?.hasNextPage),
              publicServersTotalCount: typeof data.totalCount === 'number' ? data.totalCount : servers.length,
              publicServersLoading: false,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to fetch servers';
            set({
              publicServersError: errorMessage,
              publicServersLoading: false,
            });
            toast.error(errorMessage);
          }
        },

        /**
         * Load more public servers (pagination)
         */
        loadMorePublicServers: async () => {
          const { publicServersCursor, publicServersHasNext } = get();
          if (!publicServersHasNext || !publicServersCursor) return;

          await get().fetchPublicServers({ after: publicServersCursor });
        },

        /**
         * Fetch user's personal servers
         */
        fetchUserServers: async () => {
          set({ userServersLoading: true, userServersError: null });

          try {
            const response = await fetch('/api/mcp/user');

            if (!response.ok) {
              throw new Error('Failed to fetch user servers');
            }

            const data = await response.json();
            const servers = Array.isArray(data?.servers) ? data.servers : [];

            set({
              userServers: servers,
              userServersTotalCount: servers.length,
              userServersLoading: false,
            });
          } catch (error) {
            set({
              userServersError: error instanceof Error ? error.message : 'Unknown error',
              userServersLoading: false,
            });
          }
        },

        /**
         * Add a new server
         */
        addServer: async (server) => {
          try {
            const response = await fetch('/api/mcp/servers', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(server),
            });

            const body = await response.json();
            if (!response.ok) {
              throw new Error(body.error || 'Failed to add server');
            }

            const newServer = body.server as McpServer;

            // Add to user servers list
            set((state) => ({
              userServers: [...state.userServers, newServer],
              userServersTotalCount: state.userServersTotalCount + 1,
            }));

            toast.success(`Server ${newServer.name} added successfully`);
            return newServer;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to add server';
            console.error('Error adding server:', error);
            toast.error(errorMessage);
            return null;
          }
        },

        /**
         * Update an existing server
         */
        updateServer: async (serverId, updates) => {
          try {
            const response = await fetch('/api/mcp/servers', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: serverId, ...updates }),
            });

            const body = await response.json();
            if (!response.ok) {
              throw new Error(body.error || 'Failed to update server');
            }

            const updatedServer = body.server as McpServer;

            // Update in user servers list
            set((state) => ({
              userServers: state.userServers.map((s) =>
                s.id === serverId ? updatedServer : s
              ),
            }));

            toast.success(`Server ${updatedServer.name} updated successfully`);
            return updatedServer;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to update server';
            console.error('Error updating server:', error);
            toast.error(errorMessage);
            return null;
          }
        },

        /**
         * Delete a server
         */
        deleteServer: async (serverId) => {
          try {
            const response = await fetch(`/api/mcp/servers?id=${serverId}`, {
              method: 'DELETE',
            });

            if (!response.ok) {
              throw new Error('Failed to delete server');
            }

            // Remove from user servers list
            set((state) => ({
              userServers: state.userServers.filter((s) => s.id !== serverId),
              userServersTotalCount: state.userServersTotalCount - 1,
            }));

            toast.success('Server deleted successfully');
            return true;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to delete server';
            console.error('Error deleting server:', error);
            toast.error(errorMessage);
            return false;
          }
        },

        // ==================== CONNECTION ACTIONS ====================

        /**
         * Connect to a server
         * Immediately stores the connection with VALIDATING status and fetches tools
         */
        // ==================== CONNECTION ACTIONS ====================

        syncConnections: (connections) => {
          set({
            connections: Object.values(connections).reduce((acc, val: any) => {
              if (!val?.sessionId) return acc;
              const normalizedStatus = normalizeConnectionStatus(val.state);
              const existing = get().connections[val.sessionId];

              const rawCreatedAt = val.createdAt
                ? (val.createdAt instanceof Date ? val.createdAt.toISOString() : String(val.createdAt))
                : undefined;
              const rawUpdatedAt = val.updatedAt
                ? (val.updatedAt instanceof Date ? val.updatedAt.toISOString() : String(val.updatedAt))
                : undefined;
              const connectedAt = rawCreatedAt || existing?.connectedAt || new Date().toISOString();
              const updatedAt = rawUpdatedAt || existing?.updatedAt || connectedAt;

              acc[val.sessionId] = {
                sessionId: val.sessionId,
                serverId: val.serverId || val.identity,
                serverName: val.serverName,
                url: val.serverUrl,
                transport: normalizeTransport(val.transportType || val.transport || "streamable-http"),
                connectionStatus: normalizedStatus,
                tools: val.tools || [],
                allTools: val.allTools || [],
                prompts: val.prompts ?? existing?.prompts,
                resources: val.resources ?? existing?.resources,
                resourceTemplates: val.resourceTemplates ?? existing?.resourceTemplates,
                toolPolicy: val.toolPolicy,
                enabled: val.enabled ?? existing?.enabled ?? true,
                connectedAt,
                createdAt: rawCreatedAt ?? existing?.createdAt ?? connectedAt,
                updatedAt,
                error: val.error,
                metadata: val.metadata ?? existing?.metadata,
              };
              return acc;
            }, {} as Record<string, StoredConnection>),
            activeConnectionCount: Object.values(connections).filter(
              (c: any) => normalizeConnectionStatus(c.state) === 'READY'
            ).length
          });
        },

        setMcpActions: (actions) => {
          set({ mcpActions: actions });
        },

        /**
         * Connect to a server
         * Delegates to mcp-ts hook
         */
        connect: async (server) => {
          const { mcpActions } = get();
          if (!mcpActions) throw new Error("Please sign in first.");

          try {
            const callbackUrl = `${window.location.origin}/auth/callback/success`;
            await mcpActions.connect({
              serverId: server.id,
              serverName: server.name,
              serverUrl: server.url,
              transportType: server.transport,
              callbackUrl,
              headers: normalizeHeaders(server.headers),
              clientId: server.clientId || undefined,
              clientSecret: server.clientSecret || undefined,
            });
            toast.success(`Connection initiated for ${server.name}`);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to connect';
            toast.error(errorMessage);
            throw error;
          }
        },

        /**
         * Disconnect from a server
         */
        disconnect: async (sessionId) => {
          const { mcpActions } = get();
          if (!mcpActions) throw new Error("Please sign in first.");

          try {
            await mcpActions.disconnect(sessionId);
            toast.success("Disconnected successfully");
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to disconnect';
            toast.error(errorMessage);
            throw error;
          }
        },

        /* validateSession and validateAllSessions are removed as state is managed by hook */
        validateSession: async () => { },
        validateAllSessions: async () => { },
        fetchSessionTools: async () => [],

        /**
         * Update connection status and optionally tools
         * Used by SSE stream to provide real-time status updates
         */
        updateConnectionStatus: (sessionId, status, tools) => {
          const normalizedStatus = normalizeConnectionStatus(status);
          set((state) => {
            const connection = state.connections[sessionId];
            if (!connection) {
              console.warn('[MCP Store] Cannot update status for non-existent connection:', sessionId);
              return state;
            }

            const prevActiveCount = Object.values(state.connections).filter(
              (c) => c.connectionStatus === 'READY'
            ).length;

            const wasConnected = connection.connectionStatus === 'READY';
            const isNowConnected = normalizedStatus === 'READY';

            const newActiveCount = wasConnected && !isNowConnected
              ? prevActiveCount - 1
              : !wasConnected && isNowConnected
                ? prevActiveCount + 1
                : prevActiveCount;

            const stampConnectedAt = isNowConnected && (!wasConnected || !connection.connectedAt);

            return {
              connections: {
                ...state.connections,
                [sessionId]: {
                  ...connection,
                  connectionStatus: normalizedStatus,
                  ...(tools && { tools }),
                  updatedAt: new Date().toISOString(),
                  ...(stampConnectedAt ? { connectedAt: new Date().toISOString(), createdAt: connection.createdAt || new Date().toISOString() } : {}),
                },
              },
              activeConnectionCount: newActiveCount,
            };
          });
        },

        updateConnectionToolAccess: (sessionId, access) => {
          set((state) => {
            const connection = state.connections[sessionId];
            if (!connection) return state;

            return {
              connections: {
                ...state.connections,
                [sessionId]: {
                  ...connection,
                  toolPolicy: access.toolPolicy,
                  tools: access.tools.filter((tool) => tool.allowed),
                },
              },
            };
          });
        },

        /**
         * Get connection by session ID
         */
        getConnection: (sessionId) => {
          return get().connections[sessionId];
        },

        /**
         * Get connection by server ID
         */
        getConnectionByServerId: (serverId) => {
          const byId = Object.values(get().connections).find((c) => c.serverId === serverId);
          if (byId) return byId;

          // Fallback for cases where caller passes URL instead of an internal ID.
          const normalizedInput = normalizeServerUrl(serverId);
          if (!normalizedInput) return undefined;

          return Object.values(get().connections).find(
            (c) => normalizeServerUrl(c.url) === normalizedInput
          );
        },

        /**
         * Get connection status
         */
        getConnectionStatus: (sessionId) => {
          return get().connections[sessionId]?.connectionStatus;
        },

        /**
         * Check if server is connected
         */
        isServerConnected: (serverId) => {
          return Object.values(get().connections).some(
            (c) => c.serverId === serverId && c.connectionStatus === 'READY'
          );
        },

        /**
         * Get tools for a connection
         */
        getServerTools: (sessionId) => {
          return get().connections[sessionId]?.tools;
        },

        // ==================== UI ACTIONS ====================

        setSearchQuery: (query) => set({ searchQuery: query }),
        setSelectedCategory: (category) => set({ selectedCategory: category }),
        setActiveTab: (tab) => set({ activeTab: tab }),
        setSelectedServer: (server) => set({ selectedServer: server }),
        setViewMode: (mode) => set({ viewMode: mode }),
        setEditingServer: (server) => set({ editingServer: server }),

        openToolTester: (toolName) =>
          set({ toolTesterOpen: true, selectedToolName: toolName }),

        closeToolTester: () =>
          set({ toolTesterOpen: false, selectedToolName: null }),

        openDeleteDialog: (serverId) =>
          set({ deleteDialogOpen: true, serverToDelete: serverId }),

        closeDeleteDialog: () =>
          set({ deleteDialogOpen: false, serverToDelete: null }),

        toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

        resetUIState: () => set({ ...initialUIState }),
      }),
      {
        name: 'mcp-store',
        storage: createJSONStorage(() => localStorage),
        // Only persist fully established connections (never transient authenticating/connecting states)
        partialize: (state) => {
          const cleanConnections: Record<string, StoredConnection> = {};
          for (const [key, conn] of Object.entries(state.connections)) {
            if (conn.connectionStatus === 'READY' || conn.connectionStatus === 'CONNECTED') {
              cleanConnections[key] = conn;
            }
          }
          return {
            connections: cleanConnections,
            activeConnectionCount: Object.keys(cleanConnections).length,
          };
        },
      }
    ),
    { name: 'MCP Store' }
  )
);

// ==================== SELECTORS ====================

/**
 * Selector: Get servers merged with connection state
 */
export const selectServersWithConnections = (state: McpStore) => {
  const servers = state.activeTab === 'public' ? state.publicServers : state.userServers;

  return servers.map((server) => {
    const connection = findConnectionForServer(state.connections, server);

    return {
      ...server,
      connectionStatus: connection?.connectionStatus || 'DISCONNECTED',
      sessionId: connection?.sessionId,
      tools: connection?.tools || server.tools || [],
    };
  });
};

/**
 * Selector: Get filtered servers based on search and category
 */
export const selectFilteredServers = (state: McpStore) => {
  let servers = selectServersWithConnections(state);

  // Apply search filter
  if (state.searchQuery) {
    const query = state.searchQuery.toLowerCase();
    servers = servers.filter((s) => s.name.toLowerCase().includes(query));
  }

  // Apply category filter
  if (state.selectedCategory) {
    servers = servers.filter((s) =>
      s.categories?.some((c) => c.slug === state.selectedCategory)
    );
  }

  return servers;
};

/**
 * Selector: Get all active connections (memoized for getServerSnapshot stability)
 */
let _prevConnections: Record<string, StoredConnection> | undefined;
let _cachedActive: StoredConnection[] = [];

export const selectActiveConnections = (state: McpStore) => {
  if (state.connections === _prevConnections) {
    return _cachedActive;
  }
  _prevConnections = state.connections;
  _cachedActive = Object.values(state.connections).filter(
    (c) => c.connectionStatus === 'READY'
  );
  return _cachedActive;
};

/**
 * Selector: Get loading state
 */
export const selectIsLoading = (state: McpStore) => {
  return (
    state.publicServersLoading ||
    state.userServersLoading ||
    state.connectionsLoading
  );
};




