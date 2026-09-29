export interface ToolPolicy {
  mode: "all" | "allowlist" | "denylist";
  toolIds: string[];
  updatedAt?: number;
}

export interface McpServerItem {
  id: string;
  object: "mcp_server";
  name: string;
  url: string;
  description?: string;
  enabled: boolean;
  status: {
    state: "connected" | "disconnected" | "auth_required" | "error";
    authorizationUrl?: string;
    message?: string;
  };
  auth?: {
    type: "none" | "bearer" | "custom-headers" | "oauth";
    headers?: Record<string, string>;
    config?: {
      clientMetadataUrl?: string;
      scopes?: string[];
    };
  };
  toolPolicy?: ToolPolicy;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
}

export interface McpToolItem {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface PresetServer {
  name: string;
  url: string;
  description: string;
  auth: {
    type: "none" | "bearer" | "custom-headers" | "oauth";
    token?: string;
    headers?: Record<string, string>;
  };
  metadata?: Record<string, unknown>;
}
