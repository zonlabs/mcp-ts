export type ToolInfo = {
  name: string;
  description?: string;
  schema?: unknown; // JSON type from Strawberry
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: unknown;
};

export type ToolPolicyMode = "all" | "allowlist" | "denylist";

export type ToolPolicy = {
  mode: ToolPolicyMode;
  toolIds: string[];
  updatedAt?: number;
};

export type ToolAccessInfo = ToolInfo & {
  toolId: string;
  allowed: boolean;
};

export type ToolAccessResult = {
  toolPolicy: ToolPolicy;
  tools: ToolAccessInfo[];
  toolCount: number;
  allowedToolCount: number;
};

export type Category = {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  description?: string | null;
  slug?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type McpServer = {
  id: string;
  name: string;
  description?: string | null;
  categories?: Category[] | null;
  transport: string;
  owner?: string | null;
  url?: string | null;
  /** URL or identifier for a custom server icon (catalog / display). */
  icon?: string | null;
  isVerified?: boolean;
  command?: string | null;
  args?: any | null;
  headers?: Record<string, string> | Array<{ key: string; value: string }> | null;
  requiresOauth2: boolean;
  clientId?: string | null;
  clientSecret?: string | null;
  isPublic?: boolean;
  isFeatured?: boolean;
  connectionStatus?: string | null;
  tools: ToolInfo[];
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
  updated_at: string;
  createdAt?: string;
  error?: string | null;
};

export type ConnectionResult = {
  success: boolean;
  message: string;
  tools: ToolInfo[];
  server_name: string;
  connectionStatus: string;
  requiresAuth?: boolean;
  authorizationUrl?: string | null;
  state?: string | null;
};

export type DisconnectResult = {
  success: boolean;
  message: string;
};

export type ServerHealthInfo = {
  status: string;
  tools: ToolInfo[];
};

// MCP Config format for MultiServerMCPClient (client-side, no credentials)
export type McpConfig = {
  [serverName: string]: {
    transport: string; // "sse" | "websocket" | "streamable-http"
    url: string;
    sessionId: string; // Session ID to fetch credentials server-side
  };
};

// MCP Server Config with credentials (server-side only)
export type McpServerConfig = {
  [serverName: string]: {
    transport: string;
    url: string;
    serverId?: string;
    serverName?: string;
    serverLabel?: string;
    headers?: Record<string, string>;
  };
};

export interface Tool {
  name: string;
  description: string;
}


