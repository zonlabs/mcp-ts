import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockMultiConnect,
  mockMultiDisconnect,
  mockMultiGetClients,
  mockMultiSessionClientConstructor,
  mockClientListTools,
  mockClientGetServerId,
  mockClientGetServerName,
  mockClientGetSessionId,
  mockClientGetServerUrl,
  mockToolRouterSearchTools,
  mockToolRouterGetToolSchemas,
  mockToolRouterListServers,
  mockToolRouterCallTool,
  mockToolRouterConstructor,
  mockSupabaseFrom,
  mockRecordMcpToolCallEvent,
  mockGetRequestContext,
} = vi.hoisted(() => ({
  mockMultiConnect: vi.fn(),
  mockMultiDisconnect: vi.fn(),
  mockMultiGetClients: vi.fn(),
  mockMultiSessionClientConstructor: vi.fn(),
  mockClientListTools: vi.fn(),
  mockClientGetServerId: vi.fn(),
  mockClientGetServerName: vi.fn(),
  mockClientGetSessionId: vi.fn(),
  mockClientGetServerUrl: vi.fn(),
  mockToolRouterSearchTools: vi.fn(),
  mockToolRouterGetToolSchemas: vi.fn(),
  mockToolRouterListServers: vi.fn(),
  mockToolRouterCallTool: vi.fn(),
  mockToolRouterConstructor: vi.fn(),
  mockSupabaseFrom: vi.fn(),
  mockRecordMcpToolCallEvent: vi.fn(),
  mockGetRequestContext: vi.fn(),
}));

const { mockRuntimeRun, mockCreateCodeModeRuntime } = vi.hoisted(() => ({
  mockRuntimeRun: vi.fn(),
  mockCreateCodeModeRuntime: vi.fn(),
}));

vi.mock("../../src/db/supabase", () => ({
  supabase: { from: mockSupabaseFrom },
}));

vi.mock("../../src/core/analytics", () => ({
  recordMcpToolCallEvent: mockRecordMcpToolCallEvent,
}));

vi.mock("../../src/core/request-context", () => ({
  getRequestContext: mockGetRequestContext,
}));

vi.mock("@mcp-ts/client", () => ({
  McpManager: vi.fn().mockImplementation(function (userId: string) {
    mockMultiSessionClientConstructor(userId);
    return {
      connect: mockMultiConnect,
      disconnect: mockMultiDisconnect,
      getClients: mockMultiGetClients,
    };
  }),
}));

vi.mock("@mcp-ts/tool-router", async () => {
  return {
    mcpServer: (id: string, client: any, name?: string) => ({
      id,
      name,
      listTools: client.listTools,
      callTool: client.callTool,
    }),
    mcpServers: (provider: any) =>
      provider.getClients().map((client: any, i: number) => ({
        id: client.getServerId?.() ?? `mcp_${i + 1}`,
        name: client.getServerName?.() ?? client.getServerId?.() ?? `mcp_${i + 1}`,
        listTools: client.listTools,
        callTool: client.callTool,
      })),
    createToolRouter: vi.fn().mockImplementation(async function (options: unknown) {
      mockToolRouterConstructor(options);
      return {
        searchTools: mockToolRouterSearchTools,
        getToolSchemas: mockToolRouterGetToolSchemas,
        listServers: mockToolRouterListServers,
        callTool: mockToolRouterCallTool,
      };
    }),
  };
});

vi.mock("../../src/core/codemode-runtime", () => ({
  createWorkflowCodeModeRuntime: mockCreateCodeModeRuntime,
}));

import { registerMcpCoreTools } from "../../src/core/mcp-core-tools";

function makeExtra(userId = "user-abc") {
  return { authInfo: { extra: { userId } } };
}

function getContent(result: any) {
  if (!result?.content?.[0]?.text) return {};
  try {
    return JSON.parse(result.content[0].text);
  } catch {
    return result.content[0].text;
  }
}

describe("mcp-core-tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMultiConnect.mockResolvedValue(undefined);
    mockMultiDisconnect.mockResolvedValue(undefined);
    mockClientGetServerId.mockReturnValue("docs-server");
    mockClientGetServerName.mockReturnValue("Docs");
    mockClientGetSessionId.mockReturnValue("sess-docs");
    mockClientGetServerUrl.mockReturnValue("https://docs.example.com");

    mockToolRouterSearchTools.mockResolvedValue([]);
    mockToolRouterGetToolSchemas.mockReturnValue([]);
    mockToolRouterListServers.mockReturnValue([]);
    mockToolRouterCallTool.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });

    mockRecordMcpToolCallEvent.mockResolvedValue(undefined);
    mockGetRequestContext.mockReturnValue({
      userId: "user-abc",
      requestId: "request-abc",
      mcpSessionId: "mcp-session-abc",
      scopes: ["openid", "email", "mcp:tools:read", "mcp:tools:execute"],
    });

    mockMultiGetClients.mockReturnValue([
      {
        isConnected: () => true,
        listTools: mockClientListTools,
        getServerId: mockClientGetServerId,
        getServerName: mockClientGetServerName,
        getSessionId: mockClientGetSessionId,
        getServerUrl: mockClientGetServerUrl,
      },
    ]);
  });

  describe("list_mcp_servers", () => {
    it("lists connected MCP servers", async () => {
      mockToolRouterListServers.mockReturnValue([
        {
          serverId: "docs-server",
          serverName: "Docs",
          toolCount: 1,
        },
      ]);

      const handlers = new Map<string, Function>();
      const server = {
        registerTool: (name: string, _config: unknown, handler: Function) =>
          handlers.set(name, handler),
      };

      registerMcpCoreTools(server as never);
      const handler = handlers.get("list_mcp_servers");
      const result = await handler?.({ query: "docs" }, makeExtra());

      expect(mockToolRouterConstructor).toHaveBeenCalled();
      expect(mockToolRouterListServers).toHaveBeenCalledWith("docs");
      expect(getContent(result!)).toEqual({
        servers: [
          {
            serverId: "docs-server",
            serverName: "Docs",
            toolCount: 1,
          },
        ],
      });
    });

    it("returns error response on router failure", async () => {
      mockToolRouterListServers.mockImplementation(() => {
        throw new Error("Router list error");
      });

      const handlers = new Map<string, Function>();
      const server = {
        registerTool: (name: string, _config: unknown, handler: Function) =>
          handlers.set(name, handler),
      };

      registerMcpCoreTools(server as never);
      const handler = handlers.get("list_mcp_servers");
      const result = await handler?.({}, makeExtra());

      expect(result?.isError).toBe(true);
    });
  });

  describe("search_mcp_tools", () => {
    it("searches connected MCP tools", async () => {
      mockToolRouterSearchTools.mockResolvedValue([
        {
          toolId: "docs-server::search_docs",
          toolName: "search_docs",
          serverId: "docs-server",
          serverName: "Docs",
          description: "Search product documentation",
        },
      ]);

      const handlers = new Map<string, Function>();
      const server = {
        registerTool: (name: string, _config: unknown, handler: Function) =>
          handlers.set(name, handler),
      };

      registerMcpCoreTools(server as never);
      const handler = handlers.get("search_mcp_tools");
      const result = await handler?.({ query: "docs", limit: 5 }, makeExtra());

      expect(mockToolRouterSearchTools).toHaveBeenCalledWith({
        query: "docs",
        limit: 5,
        detail: "brief",
      });
      expect(getContent(result!)).toEqual({
        tools: [
          {
            toolId: "docs-server::search_docs",
            toolName: "search_docs",
            serverId: "docs-server",
            serverName: "Docs",
            description: "Search product documentation",
          },
        ],
        total: 1,
      });
    });

    it("returns error response on router failure", async () => {
      mockToolRouterSearchTools.mockRejectedValue(new Error("Search error"));

      const handlers = new Map<string, Function>();
      const server = {
        registerTool: (name: string, _config: unknown, handler: Function) =>
          handlers.set(name, handler),
      };

      registerMcpCoreTools(server as never);
      const handler = handlers.get("search_mcp_tools");
      const result = await handler?.({ query: "docs" }, makeExtra());

      expect(result?.isError).toBe(true);
    });
  });

  describe("get_mcp_tool_schemas", () => {
    it("loads schemas in batch for requested toolIds", async () => {
      mockToolRouterGetToolSchemas.mockReturnValue([
        {
          toolId: "docs-server::search_docs",
          toolName: "search_docs",
          serverId: "docs-server",
          serverName: "Docs",
          description: "Search product documentation",
          inputSchema: { type: "object", properties: { query: { type: "string" } } },
        },
      ]);

      const handlers = new Map<string, Function>();
      const server = {
        registerTool: (name: string, _config: unknown, handler: Function) =>
          handlers.set(name, handler),
      };

      registerMcpCoreTools(server as never);
      const handler = handlers.get("get_mcp_tool_schemas");
      const result = await handler?.({ toolIds: ["docs-server::search_docs"] }, makeExtra());

      expect(mockToolRouterGetToolSchemas).toHaveBeenCalledWith({
        toolIds: ["docs-server::search_docs"],
      });
      expect(getContent(result!)).toEqual({
        tools: [
          {
            toolId: "docs-server::search_docs",
            toolName: "search_docs",
            serverId: "docs-server",
            serverName: "Docs",
            description: "Search product documentation",
            inputSchema: { type: "object", properties: { query: { type: "string" } } },
          },
        ],
      });
    });
  });

  describe("call_mcp_tool", () => {
    it("calls tool via router with canonical toolId", async () => {
      mockToolRouterCallTool.mockResolvedValue({
        content: [{ type: "text", text: "done" }],
      });

      const handlers = new Map<string, Function>();
      const server = {
        registerTool: (name: string, _config: unknown, handler: Function) =>
          handlers.set(name, handler),
      };

      registerMcpCoreTools(server as never);
      const handler = handlers.get("call_mcp_tool");
      const result = await handler?.(
        { toolId: "docs-server::search_docs", args: { query: "guide" } },
        makeExtra()
      );

      expect(mockToolRouterCallTool).toHaveBeenCalledWith({
        toolId: "docs-server::search_docs",
        args: { query: "guide" },
      });
      expect(result).toEqual({
        content: [{ type: "text", text: "done" }],
      });
    });

    it("supports legacy server_id and tool_name arguments", async () => {
      mockToolRouterCallTool.mockResolvedValue({
        content: [{ type: "text", text: "done" }],
      });

      const handlers = new Map<string, Function>();
      const server = {
        registerTool: (name: string, _config: unknown, handler: Function) =>
          handlers.set(name, handler),
      };

      registerMcpCoreTools(server as never);
      const handler = handlers.get("call_mcp_tool");
      await handler?.(
        { server_id: "docs-server", tool_name: "search_docs", arguments: { query: "guide" } },
        makeExtra()
      );

      expect(mockToolRouterCallTool).toHaveBeenCalledWith({
        toolId: "docs-server::search_docs",
        args: { query: "guide" },
      });
    });
  });

  describe("codemode_run", () => {
    it("executes code mode script and returns normalized results", async () => {
      mockRuntimeRun.mockResolvedValueOnce({
        value: { ok: true },
        error: null,
        logs: [{ level: "info", args: ["created page"] }],
        toolCalls: [{ serverId: "notion", toolName: "create", ok: true }],
        durationMs: 25,
      });
      mockCreateCodeModeRuntime.mockResolvedValueOnce({ run: mockRuntimeRun });

      const tools = new Map<string, { config: Record<string, any>; handler: Function }>();
      const server = {
        registerTool: (name: string, config: Record<string, any>, handler: Function) => {
          tools.set(name, { config, handler });
        },
      };

      registerMcpCoreTools(server as never);
      const result = await tools
        .get("codemode_run")
        ?.handler(
          { script: "return { ok: true };" },
          { authInfo: { extra: { userId: "user-abc" } } }
        );

      expect(getContent(result!)).toEqual({
        success: true,
        value: { ok: true },
        error: null,
        durationMs: 25,
        toolCallCount: 1,
        logCount: 1,
        toolCalls: [{ serverId: "notion", toolName: "create", ok: true }],
      });
    });

    it("normalizes escaped newlines in codemode_run scripts before execution", async () => {
      mockRuntimeRun.mockResolvedValueOnce({
        value: { ok: true },
        error: null,
        logs: [],
        toolCalls: [],
        durationMs: 25,
      });
      mockCreateCodeModeRuntime.mockResolvedValueOnce({ run: mockRuntimeRun });

      const tools = new Map<string, { config: Record<string, any>; handler: Function }>();
      const server = {
        registerTool: (name: string, config: Record<string, any>, handler: Function) => {
          tools.set(name, { config, handler });
        },
      };

      registerMcpCoreTools(server as never);
      await tools.get("codemode_run")?.handler({
        script:
          "const result = await callTool('docs', 'search', {\\n  query: 'docs'\\n});\\n\\nreturn result;",
      });

      expect(mockRuntimeRun).toHaveBeenCalledWith(
        "const result = await callTool('docs', 'search', {\n  query: 'docs'\n});\n\nreturn result;",
        {},
        expect.anything()
      );
    });
  });

  describe("description and registration", () => {
    it("registers exactly the 5 canonical meta tools", async () => {
      const configs = new Map<string, Record<string, any>>();
      const server = {
        registerTool: (name: string, config: Record<string, any>, _handler: Function) => {
          configs.set(name, config);
        },
      };

      registerMcpCoreTools(server as never);

      expect(configs.has("list_mcp_servers")).toBe(true);
      expect(configs.has("search_mcp_tools")).toBe(true);
      expect(configs.has("get_mcp_tool_schemas")).toBe(true);
      expect(configs.has("call_mcp_tool")).toBe(true);
      expect(configs.has("codemode_run")).toBe(true);
      expect(configs.size).toBe(5);
    });
  });
});
