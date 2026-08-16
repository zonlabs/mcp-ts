import { MCP_ASSISTANT_SERVER_ID, createInstrumentedMcpServer } from "./instrumentation";
import { registerMcpCoreTools } from "./mcp-core-tools";

const version = "1.0.4";

export function createMcpServer(options?: { scopes?: string[] }) {
  const server = options?.scopes
    ? createInstrumentedMcpServer({ name: MCP_ASSISTANT_SERVER_ID, version }, options.scopes)
    : createInstrumentedMcpServer({ name: MCP_ASSISTANT_SERVER_ID, version });
  registerMcpCoreTools(server);
  return server;
}
