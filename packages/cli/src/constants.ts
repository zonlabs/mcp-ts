/**
 * @file packages/cli/src/constants.ts
 * Consolidated constants for @mcp-ts/cli.
 */

// ============================================================================
// File: packages/cli/src/ux.ts
// ============================================================================

declare const __CLI_VERSION__: string | undefined;

/**
 * The current CLI version, injected at build time via build tools define.
 * Falls back to "0.0.0-dev" in development environments.
 */
export const CLI_VERSION: string =
  typeof __CLI_VERSION__ !== "undefined" ? __CLI_VERSION__ : "0.0.0-dev";

// ============================================================================
// File: packages/cli/src/gateway/context.ts & packages/cli/src/commands/serve.ts
// ============================================================================

/**
 * Default port for the local HTTP MCP gateway server.
 */
export const DEFAULT_LOCAL_MCP_PORT = 8765;

/**
 * Default bind host for the local HTTP MCP gateway server.
 */
export const DEFAULT_LOCAL_MCP_HOST = "127.0.0.1";

/**
 * Default endpoint path for the local HTTP MCP gateway server.
 */
export const DEFAULT_LOCAL_MCP_PATH = "/mcp";

/**
 * Default remote gateway backend URL.
 */
export const DEFAULT_REMOTE_GATEWAY_URL = "https://api.mcp-assistant.in";

// ============================================================================
// File: packages/cli/src/gateway/config.ts
// ============================================================================

/**
 * Default filename for the MCP configuration file.
 */
export const CONFIG_FILENAME = "mcp.json";

/**
 * Default folder name for global/local MCP Assistant configuration directory.
 */
export const DEFAULT_CONFIG_DIR = ".mcpassistant";

// ============================================================================
// File: packages/cli/src/gateway/auth-store.ts
// ============================================================================

/**
 * Default filename for stored user authentication session data.
 */
export const AUTH_FILENAME = "auth.json";

// ============================================================================
// File: packages/cli/src/gateway/oauth.ts
// ============================================================================

/**
 * Default localhost callback port for OAuth 2.0 PKCE browser authorization redirect.
 */
export const DEFAULT_OAUTH_CALLBACK_PORT = 43110;

// ============================================================================
// File: packages/cli/src/gateway/http-mcp-client.ts
// ============================================================================

/**
 * Loopback callback port for direct HTTP MCP client OAuth authentication.
 */
export const HTTP_CLIENT_CALLBACK_PORT = 43111;

/**
 * Loopback callback path for direct HTTP MCP client OAuth authentication.
 */
export const HTTP_CLIENT_CALLBACK_PATH = "/oauth/callback";

/**
 * Internal CLI user identifier used for local MCP client storage sessions.
 */
export const CLI_USER_ID = "mcpa-cli";

// ============================================================================
// File: packages/cli/src/token-estimator.ts
// ============================================================================

/**
 * Calibration divisor used to estimate token counts from JSON string length.
 */
export const CALIBRATION_DIVISOR = 3.6;

// ============================================================================
// File: packages/cli/src/gateway/local-http-mcp.ts & packages/cli/src/commands/call.ts
// ============================================================================

/**
 * Canonical names for discovery and routing meta-tools exposed by the local gateway.
 */
export const MCP_META_TOOL_NAMES = {
  listServers: "list_mcp_servers",
  searchTools: "search_mcp_tools",
  getToolSchemas: "get_mcp_tool_schemas",
  callTool: "call_mcp_tool",
} as const;

/**
 * Set of all meta-tool names for fast lookup.
 */
export const META_TOOL_NAMES_SET: ReadonlySet<string> = new Set(Object.values(MCP_META_TOOL_NAMES));

// ============================================================================
// File: packages/cli/src/gateway/bridge-client.ts
// ============================================================================

/**
 * Default initial reconnect delay in milliseconds for the remote bridge WebSocket.
 */
export const DEFAULT_BRIDGE_RECONNECT_INITIAL_DELAY_MS = 1_000;

/**
 * Default maximum reconnect delay in milliseconds for the remote bridge WebSocket.
 */
export const DEFAULT_BRIDGE_RECONNECT_MAX_DELAY_MS = 30_000;

/**
 * Default request timeout in milliseconds for bridge RPC calls.
 */
export const DEFAULT_BRIDGE_REQUEST_TIMEOUT_MS = 25_000;

/**
 * Default ready timeout in milliseconds when waiting for the remote bridge to sync.
 */
export const DEFAULT_BRIDGE_READY_TIMEOUT_MS = 25_000;

// ============================================================================
// File: packages/cli/src/commands/search.ts & packages/cli/src/core.ts
// ============================================================================

/**
 * Default maximum number of tools returned by search queries.
 */
export const DEFAULT_TOOL_SEARCH_LIMIT = 10;
