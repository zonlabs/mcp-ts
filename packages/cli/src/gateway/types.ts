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
  strategy?: "all" | "search" | "auto";
}

export interface GatewayConfig {
  remote?: string;
  host?: string;
  port?: number;
  path?: string;
  mode?: "all" | "search" | "auto";
}
