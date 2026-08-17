export interface BaseServerConfig {
  disabled?: boolean;
}

export interface StdioServerConfig extends BaseServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface HttpServerConfig extends BaseServerConfig {
  url: string;
  headers?: Record<string, string>;
}

export type McpServerConfig = StdioServerConfig | HttpServerConfig;

export interface McpServersConfig {
  mcpServers: Record<string, McpServerConfig>;
}
