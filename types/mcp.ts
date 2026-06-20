export type ToolInfo = {
  name: string;
  description: string;
  schema?: unknown; // JSON type from Strawberry
  inputSchema?: unknown;
  outputSchema?: unknown;
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
  isPublic?: boolean;
  connectionStatus?: string | null;
  tools: ToolInfo[];
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

// MCP Registry API Types (actual API schema)
export type RegistryServerPackage = {
  registryType?: string;
  identifier?: string;
  transport?: {
    type: "stdio" | "sse" | "streamable-http";
  };
  environmentVariables?: {
    name: string;
    description?: string;
    format?: string;
    isSecret?: boolean;
  }[];
};

export type RegistryServerRemote = {
  type: "streamable-http" | "sse";
  url: string;
};

export type RegistryServerRepository = {
  url?: string;
  source?: string;
};

export type RegistryServerIcon = {
  src: string;
  mimeType?: "image/png" | "image/jpeg" | "image/jpg" | "image/svg+xml" | "image/webp";
  sizes?: string[];
  theme?: "light" | "dark";
};

export type RegistryServerData = {
  $schema?: string;
  name: string;
  description?: string;
  title?: string;
  icons?: RegistryServerIcon[];
  repository?: RegistryServerRepository;
  version: string;
  packages?: RegistryServerPackage[];
  remotes?: RegistryServerRemote[];
  websiteUrl?: string;
};

export type RegistryServerMeta = {
  "io.modelcontextprotocol.registry/official": {
    status: string;
    publishedAt: string;
    updatedAt: string;
    isLatest: boolean;
  };
};

export type RegistryServerEntry = {
  server: RegistryServerData;
  _meta: RegistryServerMeta;
};

export type RegistryListResponse = {
  servers: RegistryServerEntry[];
  metadata: {
    nextCursor?: string;
    count: number;
  };
};

// Parsed/simplified types for UI
export type ParsedRegistryServer = {
  id: string;
  name: string;
  shortName: string;
  vendor: string;
  title: string | null;
  description: string | null;
  version: string;
  iconUrl: string | null;
  repositoryUrl: string | null;
  websiteUrl: string | null;
  hasRemote: boolean;
  hasPackage: boolean;
  remoteUrl: string | null;
  transportType: "streamable-http" | "sse" | null;
  publishedAt: string;
  updatedAt: string;
  isLatest: boolean;
  connectionStatus?: string;
  tools?: ToolInfo[];
};
