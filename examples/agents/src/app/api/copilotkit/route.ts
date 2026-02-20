import { NextRequest } from "next/server";
import {
  CopilotRuntime,
  EmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { HttpAgent } from "@ag-ui/client";
import { AguiAdapter } from "@mcp-ts/sdk/adapters/agui-adapter";
import { createMcpMiddleware } from "@mcp-ts/sdk/adapters/agui-middleware";

const serviceAdapter = new EmptyAdapter();

export const POST = async (req: NextRequest) => {

  /**
   * Create MCP Agent
   */
  const mcpAssistant = new HttpAgent({
    url:
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      "http://127.0.0.1:8000/agent",
      headers: {
      "Content-Type": "application/json",
    },
  });

  const identity = "demo-user-123";
  // Import dynamically to avoid build-time issues if package is linking
  const { MultiSessionClient } = await import("@mcp-ts/sdk/server");
  const client = new MultiSessionClient(identity);

  const notificationSubscription = client.setNotificationHandlers({
    onProgress: (event) => {
      console.log(`[CopilotKit][progress][${event.serverId}] ${event.progress}/${event.total ?? '?'} ${event.message ?? ''}`);
    },
    onTaskStatus: (event) => {
      console.log(`[CopilotKit][task][${event.serverId}] ${event.taskId ?? 'unknown'} -> ${event.status ?? 'unknown'}`);
    },
  });

  // Connect to all active sessions before getting tools
  await client.connect();

  // Log number of connected clients for debugging
  const clients = client.getClients();
  console.log(`[CopilotKit] Connected to ${clients.length} MCP clients`);

  const adapter = new AguiAdapter(client, {
    // prefix: `mcp_tool`, //optionally set a prefix for tool names
  });

  // Get tools with handlers for the middleware
  const mcpTools = await adapter.getTools();

  console.log(`[CopilotKit] Loaded ${mcpTools.length} MCP tools for CopilotKit agent.`);

  /**
   * Add MCP Tool Execution Middleware
   * This middleware intercepts MCP tool calls (server-*) and executes them server-side
   */
  mcpAssistant.use(createMcpMiddleware({ tools: mcpTools})); // maxResult limits tool output length (dev environment)
  /**
   * Runtime
   */
  const runtime = new CopilotRuntime({
    agents: {
      mcpAssistant,
    },
  });

  /**
   * Endpoint
   */
  const { handleRequest } =
    copilotRuntimeNextJSAppRouterEndpoint({
      runtime,
      serviceAdapter,
      endpoint: "/api/copilotkit",
    });

  const response = await handleRequest(req);

  // In long-lived runtimes, prefer managed lifecycle hooks. For this per-request example,
  // clean up subscriptions after request handling.
  notificationSubscription.dispose();

  return response;
};
