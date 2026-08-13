export type ServerKind = "stdio" | "streamable-http" | "sse";

export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: unknown;
}

export interface ServerInfo {
  name: string;
  kind: ServerKind;
  /** Keyed by original tool name. */
  tools: Record<string, ToolInfo>;
}

export interface InvokeRequest {
  type: "invoke";
  requestId: string;
  mcp_server: string;
  tool: string;
  payload: unknown;
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

/** Device record stored in the USERS KV, keyed `device:<deviceId>`. */
export interface DeviceRecord {
  deviceId: string;
  /** Supabase user id that owns this device. */
  userId: string;
  createdAt: number;
  servers: ServerInfo[];
}

/** Account record stored in the USERS KV, keyed `user:<userId>`. */
export interface UserRecord {
  userId: string;
  devices: string[];
  createdAt: number;
}

/** Props embedded in the OAuth grant / access token for API requests. */
export interface AuthProps {
  userId: string;
  deviceId?: string;
}
