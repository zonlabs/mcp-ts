import type { ToolDefinition, ToolServer } from "../types.js";

export interface ToolClient {
  listTools(): Promise<{ tools: ToolDefinition[] }>;
  callTool?:
    | ((name: string, args: Record<string, unknown>) => Promise<unknown>)
    | ((request: {
        name: string;
        args: Record<string, unknown>;
        options?: unknown;
      }) => Promise<unknown>);
  tools?(): Promise<Record<string, unknown>>;
  session?: {
    serverId?: string;
    serverName?: string;
    serverUrl?: string;
  };
}

export interface ToolClientProvider {
  getClients(): ToolClient[];
}

export function mcpServer(id: string, client: ToolClient, name?: string): ToolServer {
  let cachedToolsPromise: Promise<Record<string, unknown>> | null = null;

  return {
    id,
    name: name ?? client.session?.serverName ?? client.session?.serverId ?? id,
    listTools: () => client.listTools(),
    callTool: async (toolName, args) => {
      if (client.callTool) {
        return callClientTool(client, client.callTool, toolName, args);
      }

      if (!client.tools) {
        throw new Error(`Client for server "${id}" does not support tool execution.`);
      }

      if (!cachedToolsPromise) {
        cachedToolsPromise = client.tools();
      }
      const toolSet = await cachedToolsPromise;
      const tool = toolSet[toolName] as { execute?: (...args: unknown[]) => Promise<unknown> } | undefined;
      if (!tool || typeof tool.execute !== "function") {
        throw new Error(`Tool "${toolName}" not found on server "${id}".`);
      }
      return tool.execute(args);
    },
    refresh: async () => {
      cachedToolsPromise = null;
    }
  };
}

function callClientTool(
  client: ToolClient,
  callTool: NonNullable<ToolClient["callTool"]>,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (callTool.length >= 2) {
    return (callTool as (this: ToolClient, name: string, args: Record<string, unknown>) => Promise<unknown>).call(
      client,
      name,
      args
    );
  }

  return (callTool as (this: ToolClient, request: {
    name: string;
    args: Record<string, unknown>;
    options?: unknown;
  }) => Promise<unknown>).call(client, {
    name,
    args
  });
}

export function mcpServers(provider: ToolClientProvider): ToolServer[] {
  return provider.getClients().map((client, index) =>
    mcpServer(
      client.session?.serverId ?? `mcp_${index + 1}`,
      client,
      client.session?.serverName ?? client.session?.serverId
    )
  );
}

