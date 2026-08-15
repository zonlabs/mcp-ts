export type ServerKind = "stdio" | "streamable-http" | "sse";

export interface StdioServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface HttpServerConfig {
  url?: string;
  headers?: Record<string, string>;
}

export interface McpServersConfig {
  mcpServers: Record<string, StdioServerConfig & HttpServerConfig>;
}

export interface GatewayConfig {
  /** Remote gateway base URL, e.g. https://api.mcp-assistant.in */
  remote?: string;
  /** Device identity issued by the remote gateway */
  deviceId?: string;
  /** OAuth access token (user-bound) used to authenticate the outbound WebSocket */
  token?: string;
  /** OAuth refresh token for rotating the access token */
  refreshToken?: string;
  /** OAuth client id from dynamic client registration */
  clientId?: string;
  /** Absolute epoch ms when the access token expires */
  tokenExpiresAt?: number;
  /** Local streamable HTTP bind host */
  host?: string;
  /** Local streamable HTTP port */
  port?: number;
  /** MCP path on the local endpoint */
  path?: string;
}

export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: unknown;
}

export interface ServerInfo {
  name: string;
  kind: ServerKind;
  /** Keyed by original tool name */
  tools: Record<string, ToolInfo>;
}

/** A tool exposed by the aggregate endpoint, with collision resolution. */
export interface AggregatedTool {
  /** The name exposed to clients (collision-prefixed when needed). */
  name: string;
  server: string;
  originalName: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface InvokeRequest {
  type: "invoke";
  requestId: string;
  /** Local MCP server name that owns the tool. */
  mcp_server: string;
  /** Tool name within that server. */
  tool: string;
  payload: Record<string, unknown>;
}

export interface InvokeResult {
  type: "result";
  requestId: string;
  result: Record<string, unknown>;
}

export interface RegisterMessage {
  type: "register";
  deviceId: string;
  servers: ServerInfo[];
}

export interface LogMessage {
  type: "log";
  level: "info" | "warn" | "error";
  message: string;
}
