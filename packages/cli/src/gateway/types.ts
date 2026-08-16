export interface StdioServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface HttpServerConfig {
  url: string;
  headers?: Record<string, string>;
}

export type McpServerConfig = StdioServerConfig | HttpServerConfig;

export interface McpServersConfig {
  mcpServers: Record<string, McpServerConfig>;
}
