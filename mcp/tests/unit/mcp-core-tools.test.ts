import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockSupabaseFrom } = vi.hoisted(() => ({
  mockSupabaseFrom: vi.fn(),
}));

const {
  mockSupermemoryAdd,
  mockSupermemorySearchDocuments,
  mockSupermemoryDeleteDocument,
  mockSupermemoryConstructor,
} = vi.hoisted(() => ({
  mockSupermemoryAdd: vi.fn(),
  mockSupermemorySearchDocuments: vi.fn(),
  mockSupermemoryDeleteDocument: vi.fn(),
  mockSupermemoryConstructor: vi.fn().mockImplementation(function (this: any) {
    this.add = mockSupermemoryAdd;
    this.documents = {
      delete: mockSupermemoryDeleteDocument,
    };
    this.search = {
      documents: mockSupermemorySearchDocuments,
    };
  }),
}));

vi.mock("supermemory", () => ({
  Supermemory: mockSupermemoryConstructor,
}));

function getContent(result: any) {
  try {
    return JSON.parse(result?.content?.[0]?.text ?? "{}");
  } catch {
    return {};
  }
}

const { mockRecordMcpToolCallEvent, mockGetRequestContext } = vi.hoisted(() => ({
  mockRecordMcpToolCallEvent: vi.fn(),
  mockGetRequestContext: vi.fn(),
}));

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
  mockToolRouterListTools,
  mockToolRouterGetToolSchema,
  mockToolRouterResolveToolSchema,
  mockToolRouterListServers,
  mockToolRouterConstructor,
} = vi.hoisted(() => ({
  mockMultiConnect: vi.fn(),
  mockMultiDisconnect: vi.fn(),
  mockMultiGetClients: vi.fn(),
  mockMultiSessionClientConstructor: vi.fn(),
  mockClientListTools: vi.fn(),
  mockClientGetServerId: vi.fn(),
  mockClientGetServerName: vi.fn(),
  mockClientGetSessionId: vi.fn(),
  mockToolRouterSearchTools: vi.fn(),
  mockToolRouterListTools: vi.fn(),
  mockToolRouterGetToolSchema: vi.fn(),
  mockToolRouterResolveToolSchema: vi.fn(),
  mockToolRouterListServers: vi.fn(),
  mockToolRouterConstructor: vi.fn(),
  mockClientGetServerUrl: vi.fn(),
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

vi.mock("@mcp-ts/client/shared", async () => {
  const actual = await import("@mcp-ts/client/shared");
  return {
    ...actual,
    ToolRouter: vi.fn().mockImplementation(function (client: unknown, options: unknown) {
      mockToolRouterConstructor(client, options);
      return {
        searchTools: mockToolRouterSearchTools,
        listTools: mockToolRouterListTools,
        getToolSchema: mockToolRouterGetToolSchema,
        resolveToolSchema: mockToolRouterResolveToolSchema,
        listServers: mockToolRouterListServers,
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

describe("mcp-core-tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMultiConnect.mockResolvedValue(undefined);
    mockMultiDisconnect.mockResolvedValue(undefined);
    mockClientGetServerId.mockReturnValue("docs-server");
    mockClientGetServerName.mockReturnValue("Docs");
    mockClientGetSessionId.mockReturnValue("sess-docs");
    mockClientGetServerUrl.mockReturnValue("https://docs.example.com");
    mockToolRouterSearchTools.mockReset();
    mockToolRouterListTools.mockReset();
    mockToolRouterListTools.mockResolvedValue({
      tools: [],
      totalCount: 0,
      returnedCount: 0,
      nextCursor: null,
      servers: [],
    });
    mockToolRouterGetToolSchema.mockReset();
    mockToolRouterResolveToolSchema.mockReset();
    mockToolRouterListServers.mockReset();
    mockToolRouterConstructor.mockReset();
    mockMultiSessionClientConstructor.mockReset();
    mockRecordMcpToolCallEvent.mockResolvedValue(undefined);
    mockGetRequestContext.mockReturnValue({
      userId: "user-abc",
      requestId: "request-abc",
      mcpSessionId: "mcp-session-abc",
      scopes: ["openid", "email", "mcp:tools:read", "mcp:tools:execute"],
    });
    mockToolRouterResolveToolSchema.mockResolvedValue(undefined);
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

  describe("search_mcp_tools", () => {
    it("searches connected MCP tools with normalized results", async () => {
      mockToolRouterListTools.mockResolvedValue({
        tools: [
          {
            name: "search_docs",
            description: "Search product documentation",
            serverId: "docs-server",
            serverName: "Docs",
            sessionId: "sess-docs",
          },
        ],
        totalCount: 1,
        returnedCount: 1,
        nextCursor: null,
        servers: [],
      });

      const configs = new Map<string, Record<string, any>>();
      const handlers = new Map<string, Function>();
      const server = {
        registerTool: (name: string, config: Record<string, any>, handler: Function) => {
          configs.set(name, config);
          handlers.set(name, handler);
        },
      };

      registerMcpCoreTools(server as never);
      const handler = handlers.get("search_mcp_tools");
      const result = await handler?.({ query: "docs", limit: 5 }, makeExtra());

      expect(configs.get("search_mcp_tools")?.description).toContain("connected MCP tools");
      expect(mockMultiConnect).toHaveBeenCalled();
      expect(mockToolRouterConstructor).toHaveBeenCalled();
      expect(mockToolRouterListTools).toHaveBeenCalledWith({ limit: Number.MAX_SAFE_INTEGER });
      expect(mockMultiDisconnect).not.toHaveBeenCalled();
      expect(getContent(result!)).toEqual({
        tools: [
          {
            serverId: "docs-server",
            toolName: "search_docs",
            title: "search_docs",
            description: "Search product documentation",
            serverName: "Docs",
            usageHint:
              'Use `callTool("docs-server", "search_docs", args)` or call the namespaced helper directly in CodeMode.',
          },
        ],
        total: 1,
      });
    });

    it("uses a conservative default limit for connected MCP tool search", async () => {
      const configs = new Map<string, Record<string, any>>();
      const handlers = new Map<string, Function>();
      const server = {
        registerTool: (name: string, config: Record<string, any>, handler: Function) => {
          configs.set(name, config);
          handlers.set(name, handler);
        },
      };

      registerMcpCoreTools(server as never);
      const handler = handlers.get("search_mcp_tools");
      await handler?.({ query: "docs" }, makeExtra());

      expect(configs.get("search_mcp_tools")?.inputSchema.shape.limit.description).toContain(
        "Defaults to 5"
      );
      expect(mockToolRouterListTools).toHaveBeenCalled();
    });

    it("compacts connected MCP tool search results by default", async () => {
      const longDescription = "A".repeat(1200);
      mockToolRouterListTools.mockResolvedValue({
        tools: [
          {
            name: "create_page",
            description: longDescription,
            serverId: "notion-server",
            serverName: "Notion",
            sessionId: "sess-notion",
            annotations: { readOnlyHint: false },
          },
        ],
        totalCount: 1,
        returnedCount: 1,
        nextCursor: null,
        servers: [],
      });

      const handlers = new Map<string, Function>();
      const server = {
        registerTool: (name: string, _config: Record<string, any>, handler: Function) => {
          handlers.set(name, handler);
        },
      };

      registerMcpCoreTools(server as never);
      const handler = handlers.get("search_mcp_tools");
      const result = await handler?.({ query: "create notion page", limit: 5 }, makeExtra());
      const tool = (getContent(result!) as any).tools[0];

      expect(tool.description.length).toBeLessThan(longDescription.length);
      expect(tool.description.length).toBeLessThanOrEqual(260);
      expect(tool).not.toHaveProperty("annotations");
      expect(tool).not.toHaveProperty("rawTool");
    });

    it("can return full search descriptions when explicitly requested", async () => {
      const longDescription = "B".repeat(1200);
      mockToolRouterListTools.mockResolvedValue({
        tools: [
          {
            name: "create_page",
            description: longDescription,
            serverId: "notion-server",
            serverName: "Notion",
            sessionId: "sess-notion",
          },
        ],
        totalCount: 1,
        returnedCount: 1,
        nextCursor: null,
        servers: [],
      });

      const handlers = new Map<string, Function>();
      const server = {
        registerTool: (name: string, _config: Record<string, any>, handler: Function) => {
          handlers.set(name, handler);
        },
      };

      registerMcpCoreTools(server as never);
      const handler = handlers.get("search_mcp_tools");
      const result = await handler?.(
        { query: "create notion page", limit: 5, verbosity: "full" },
        makeExtra()
      );

      expect((getContent(result!) as any).tools[0].description).toBe(longDescription);
    });

    it("does not include workflow-local tools in codemode search results", async () => {
      mockMultiGetClients.mockReturnValue([]);

      const handlers = new Map<string, Function>();
      const server = {
        registerTool: (name: string, _config: Record<string, any>, handler: Function) => {
          handlers.set(name, handler);
        },
      };

      registerMcpCoreTools(server as never);
      const handler = handlers.get("search_mcp_tools");
      const result = await handler?.({ query: "agent_run", limit: 5 }, makeExtra());

      expect(getContent(result!)).toEqual({
        tools: [],
        total: 0,
      });
    });
  });

  describe("list_mcp_servers", () => {
    it("lists connected MCP servers and their tool counts, omitting sessionId", async () => {
      mockToolRouterListServers.mockResolvedValue([
        {
          serverName: "Docs",
          serverId: "docs-server",
          sessionId: "sess-docs",
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
      const result = await handler?.({}, makeExtra());

      expect(mockMultiConnect).toHaveBeenCalled();
      expect(mockToolRouterConstructor).toHaveBeenCalled();
      expect(mockToolRouterListServers).toHaveBeenCalledWith({});
      expect(getContent(result!)).toEqual({
        servers: [
          {
            serverName: "Docs",
            serverId: "docs-server",
            toolCount: 1,
          },
        ],
      });
    });

    it("returns error response on router failure", async () => {
      mockToolRouterListServers.mockRejectedValue(new Error("Database failure"));

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

  describe("get_mcp_tool_schema", () => {
    it("returns normalized MCP tool schema with extraction hint", async () => {
      mockToolRouterResolveToolSchema.mockResolvedValue({
        name: "search_docs",
        description: "Search product documentation",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
          },
          required: ["query"],
        },
        outputSchema: {
          type: "object",
          properties: {
            items: { type: "array" },
          },
        },
        annotations: { readOnlyHint: true },
        serverId: "docs-server",
        serverName: "Docs",
        sessionId: "sess-docs",
      });

      const handlers = new Map<string, Function>();
      const server = {
        registerTool: (name: string, _config: Record<string, any>, handler: Function) => {
          handlers.set(name, handler);
        },
      };

      registerMcpCoreTools(server as never);
      const handler = handlers.get("get_mcp_tool_schema");
      const result = await handler?.(
        { server_id: "docs-server", tool_name: "search_docs" },
        makeExtra()
      );

      expect(mockToolRouterConstructor).toHaveBeenCalled();
      expect(mockToolRouterResolveToolSchema).toHaveBeenCalledWith("search_docs", "docs-server");
      expect(getContent(result!)).toEqual({
        tool: {
          serverId: "docs-server",
          serverName: "Docs",
          toolName: "search_docs",
          title: "search_docs",
          description: "Search product documentation",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string" },
            },
            required: ["query"],
          },
          outputSchema: {
            type: "object",
            properties: {
              items: { type: "array" },
            },
          },
          resultExtractionHint:
            "In CodeMode, `callTool(serverId, toolName, args)` and namespaced helpers return normalized tool results. Structured MCP payloads are unwrapped automatically; use raw helpers only when you explicitly need the MCP envelope.",
        },
      });
    });

    it("records schema lookup separately from real downstream MCP tool calls", async () => {
      mockClientGetSessionId.mockReturnValue("sess-github");
      mockClientGetServerUrl.mockReturnValue("https://github.com");
      mockToolRouterResolveToolSchema.mockResolvedValue({
        name: "list_commits",
        description: "List commits",
        inputSchema: {
          type: "object",
          properties: {
            owner: { type: "string" },
            repo: { type: "string" },
          },
          required: ["owner", "repo"],
        },
        outputSchema: {},
        serverId: "github-server",
        serverName: "GitHub",
        sessionId: "sess-github",
      });

      const handlers = new Map<string, Function>();
      const server = {
        registerTool: (name: string, _config: Record<string, any>, handler: Function) => {
          handlers.set(name, handler);
        },
      };

      registerMcpCoreTools(server as never);
      const handler = handlers.get("get_mcp_tool_schema");
      await handler?.({ server_id: "github-server", tool_name: "list_commits" }, makeExtra());

      expect(mockRecordMcpToolCallEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-abc",
          requestId: "request-abc",
          mcpSessionId: "mcp-session-abc",
          serverId: "github-server",
          serverName: "GitHub",
          serverUrl: "https://github.com",
          toolName: "list_commits",
          toolNamespace: "github-server",
          eventType: "schema_inspection",
          status: "success",
        })
      );
    });

    it("never returns annotations or raw tool payloads from schema lookup", async () => {
      const longDescription = "C".repeat(1200);
      mockToolRouterResolveToolSchema.mockResolvedValue({
        name: "create_page",
        description: longDescription,
        inputSchema: {
          type: "object",
          properties: {
            content: { type: "string", description: "D".repeat(1200) },
          },
        },
        outputSchema: {},
        annotations: { destructiveHint: false },
        serverId: "notion-server",
        serverName: "Notion",
        sessionId: "sess-notion",
      });

      const handlers = new Map<string, Function>();
      const server = {
        registerTool: (name: string, _config: Record<string, any>, handler: Function) => {
          handlers.set(name, handler);
        },
      };

      registerMcpCoreTools(server as never);
      const handler = handlers.get("get_mcp_tool_schema");
      const result = await handler?.(
        { server_id: "notion-server", tool_name: "create_page" },
        makeExtra()
      );
      const tool = (getContent(result!) as any).tool;

      expect(JSON.stringify(tool)).not.toContain("annotations");
      expect(tool).not.toHaveProperty("rawTool");
      expect(tool.description.length).toBeLessThan(longDescription.length);
    });

    it("falls back to an unscoped schema lookup when the provided server_id no longer resolves", async () => {
      mockToolRouterResolveToolSchema.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
        name: "search_issues",
        description: "Search issues",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
          },
          required: ["query"],
        },
        outputSchema: {
          type: "object",
          properties: {
            items: { type: "array" },
          },
        },
        annotations: { readOnlyHint: true },
        serverId: "github-server",
        serverName: "GitHub",
        sessionId: "sess-github-new",
      });

      const handlers = new Map<string, Function>();
      const server = {
        registerTool: (name: string, _config: Record<string, any>, handler: Function) => {
          handlers.set(name, handler);
        },
      };

      registerMcpCoreTools(server as never);
      const handler = handlers.get("get_mcp_tool_schema");
      const result = await handler?.(
        { server_id: "sess-github-old", tool_name: "search_issues" },
        makeExtra()
      );

      expect(mockToolRouterResolveToolSchema).toHaveBeenNthCalledWith(
        1,
        "search_issues",
        "sess-github-old"
      );
      expect(mockToolRouterResolveToolSchema).toHaveBeenNthCalledWith(2, "search_issues");
      expect(getContent(result!)).toEqual({
        tool: expect.objectContaining({
          serverId: "github-server",
          toolName: "search_issues",
        }),
      });
    });

    it("returns an error when schema lookup still cannot find the tool", async () => {
      mockToolRouterResolveToolSchema.mockResolvedValue(undefined);

      const handlers = new Map<string, Function>();
      const server = {
        registerTool: (name: string, _config: Record<string, any>, handler: Function) => {
          handlers.set(name, handler);
        },
      };

      registerMcpCoreTools(server as never);
      const handler = handlers.get("get_mcp_tool_schema");
      const result = await handler?.(
        { server_id: "XaJLC5qGDjMe", tool_name: "search_issues" },
        makeExtra()
      );

      expect(result?.isError).toBe(true);
    });

    it("initializes the tool router before reading a schema", async () => {
      const schema = {
        name: "search_issues",
        description: "Search issues",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
          },
          required: ["query"],
        },
        outputSchema: {
          type: "object",
          properties: {
            items: { type: "array" },
          },
        },
        annotations: { readOnlyHint: true },
        serverId: "XaJLC5qGDjMe",
        serverName: "Github - Personal",
        sessionId: "f7UGTXBg7Wd8",
      };

      mockToolRouterResolveToolSchema.mockResolvedValue(schema);

      const handlers = new Map<string, Function>();
      const server = {
        registerTool: (name: string, _config: Record<string, any>, handler: Function) => {
          handlers.set(name, handler);
        },
      };

      registerMcpCoreTools(server as never);
      const handler = handlers.get("get_mcp_tool_schema");
      const result = await handler?.(
        { server_id: "XaJLC5qGDjMe", tool_name: "search_issues" },
        makeExtra()
      );

      expect(mockToolRouterResolveToolSchema).toHaveBeenCalledWith("search_issues", "XaJLC5qGDjMe");
      expect(getContent(result!)).toEqual({
        tool: expect.objectContaining({
          serverId: "XaJLC5qGDjMe",
          toolName: "search_issues",
        }),
      });
    });
  });

  describe("description and registration", () => {
    it("registers workflow tools on the raw MCP server surface", async () => {
      const configs = new Map<string, Record<string, any>>();
      const server = {
        registerTool: (name: string, config: Record<string, any>, _handler: Function) => {
          configs.set(name, config);
        },
      };

      registerMcpCoreTools(server as never);

      expect(configs.has("list_mcp_servers")).toBe(true);
      expect(configs.has("search_mcp_tools")).toBe(true);
      expect(configs.has("get_mcp_tool_schema")).toBe(true);
      expect(configs.has("call_mcp_tool")).toBe(true);
      expect(configs.has("codemode_run")).toBe(true);
    });

    it("describes MCP tool discovery as search then schema inspection", async () => {
      const configs = new Map<string, Record<string, any>>();
      const server = {
        registerTool: (name: string, config: Record<string, any>, _handler: Function) => {
          configs.set(name, config);
        },
      };

      registerMcpCoreTools(server as never);

      const searchConfig = configs.get("search_mcp_tools");
      const schemaConfig = configs.get("get_mcp_tool_schema");

      expect(searchConfig).toBeDefined();
      expect(schemaConfig).toBeDefined();
      expect(searchConfig!.description).toContain("Search connected MCP tools");
      expect(searchConfig!.description).toContain("find candidate MCP tools");
      expect(searchConfig!.description).toContain("Next, pass the chosen result");
      expect(searchConfig!.description).toContain("get_mcp_tool_schema");
      expect(schemaConfig!.description).toContain("Retrieve a normalized schema payload");
      expect(schemaConfig!.description).toContain("inspect the exact input schema");
      expect(schemaConfig!.description).toContain("Then call that MCP tool");
      expect(schemaConfig!.description).toContain("codemode_run");
    });

    it("returns normalized discovery results for search matches", async () => {
      mockToolRouterListTools.mockResolvedValue({
        tools: [
          {
            name: "search_issues",
            serverId: "github-server",
            serverName: "GitHub",
            sessionId: "sess-github",
            description: "Search repository issues",
          },
        ],
        totalCount: 1,
        returnedCount: 1,
        nextCursor: null,
        servers: [],
      });

      const handlers = new Map<string, Function>();
      const server = {
        registerTool: (name: string, _config: unknown, handler: Function) =>
          handlers.set(name, handler),
      };

      registerMcpCoreTools(server as never);
      const handler = handlers.get("search_mcp_tools");
      const result = await handler?.({ query: "issues" }, makeExtra());

      expect(getContent(result!)).toEqual({
        tools: [
          expect.objectContaining({
            serverId: "github-server",
            toolName: "search_issues",
          }),
        ],
        total: 1,
      });
    });
  });

  describe("codemode_run", () => {
    it("registers codemode_run", async () => {
      const tools = new Map<string, { config: Record<string, any>; handler: Function }>();
      const server = {
        registerTool: (name: string, config: Record<string, any>, handler: Function) => {
          tools.set(name, { config, handler });
        },
      };

      registerMcpCoreTools(server as never);

      expect(tools.has("codemode_run")).toBe(true);
    });

    it("registers codemode_run with batching guidance and anti-multiple-call instruction", async () => {
      const tools = new Map<string, { config: Record<string, any>; handler: Function }>();
      const server = {
        registerTool: (name: string, config: Record<string, any>, handler: Function) => {
          tools.set(name, { config, handler });
        },
      };

      registerMcpCoreTools(server as never);

      const codemodeRun = tools.get("codemode_run");
      expect(codemodeRun).toBeDefined();

      const config = codemodeRun!.config;
      expect(config.description).toContain("## Prerequisites");
      expect(config.description).toContain("NEVER guess tool names");
      expect(config.description).toContain("NEVER hardcode data");
      expect(config.description).toContain("ALWAYS check `.ok`");
      expect(config.description).toContain("## Plan & Batch");
      expect(config.description).toContain("Independent");
      expect(config.description).toContain("Dependent");
      expect(config.description).toContain("Exploratory");
      expect(config.description).toContain("## Patterns");
      expect(config.description).toContain("Namespaced");
      expect(config.description).toContain("Raw callTool");
      expect(config.description).toContain("Batch:");
      expect(config.description).toContain("Chain:");
      expect(config.description).toContain("Bulk");
      expect(config.description).toContain("## Defensive Parsing");
      expect(config.description).toContain("unwrap safely");
      expect(config.description).toContain("## Response");
      expect(config.description).toContain("toolCall");
      expect(config.description).toContain("summarize/filter");
      expect(config.description).toContain("## Timeout");
      expect(config.description).toContain("240s");
    });

    it("returns compact codemode_run output by default", async () => {
      mockRuntimeRun.mockResolvedValueOnce({
        value: { ok: true },
        error: null,
        logs: [{ level: "info", args: ["created page"] }],
        toolCalls: [{ id: "call_1", serverId: "notion", toolName: "create", ok: true }],
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

    it("returns codemode_run debug details only when requested", async () => {
      const logs = [{ level: "info", args: ["created page"] }];
      const toolCalls = [{ id: "call_1", serverId: "notion", toolName: "create", ok: true }];
      mockRuntimeRun.mockResolvedValueOnce({
        value: { ok: true },
        error: null,
        logs,
        toolCalls,
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
          { script: "return { ok: true };", return_mode: "debug" },
          { authInfo: { extra: { userId: "user-abc" } } }
        );

      expect(getContent(result!)).toEqual({
        success: true,
        value: { ok: true },
        error: null,
        logs,
        toolCalls: [{ serverId: "notion", toolName: "create", ok: true }],
        toolCallCount: 1,
        logCount: 1,
        durationMs: 25,
      });
    });

    it("returns isError: true when runtime.run returns an error", async () => {
      const errorPayload = { code: "SANDBOX_ERROR", message: "Unexpected identifier 'docker'" };
      mockRuntimeRun.mockResolvedValueOnce({
        value: null,
        error: errorPayload,
        logs: [],
        toolCalls: [],
        durationMs: 10,
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
          { script: "docker run ...", return_mode: "debug" },
          { authInfo: { extra: { userId: "user-abc" } } }
        );

      expect(result?.isError).toBe(true);
      expect(getContent(result!)).toEqual({
        success: false,
        value: null,
        error: errorPayload,
        logs: [],
        toolCalls: [],
        toolCallCount: 0,
        logCount: 0,
        durationMs: 10,
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
          "const result = await callTool('p3ikd5kskkf0', 'web_search_exa', {\\n  query: 'docs',\\n  numResults: 3\\n});\\n\\nreturn result;",
      });

      expect(mockRuntimeRun).toHaveBeenCalledWith(
        "const result = await callTool('p3ikd5kskkf0', 'web_search_exa', {\n  query: 'docs',\n  numResults: 3\n});\n\nreturn result;",
        {},
        expect.anything()
      );
    });

    it("passes request context to CodeMode runtime for downstream tool call analytics", async () => {
      mockGetRequestContext.mockReturnValue({
        userId: "user-abc",
        requestId: "req-123",
        mcpSessionId: "session-xyz",
        scopes: ["openid", "email", "mcp:tools:execute"],
        env: { LOADER: "worker-loader" },
      });
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
      await tools
        .get("codemode_run")
        ?.handler(
          { script: "return { ok: true };" },
          { authInfo: { extra: { userId: "user-abc" } } }
        );

      expect(mockCreateCodeModeRuntime).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ maxToolCalls: 50 }),
        {
          userId: "user-abc",
          requestId: "req-123",
          mcpSessionId: "session-xyz",
        },
        {
          loader: "worker-loader",
        },
        expect.anything()
      );
    });
  });

  describe("index_mcp_server & find_mcp_servers", () => {
    let originalApiKey: string | undefined;

    beforeEach(() => {
      originalApiKey = process.env.SUPERMEMORY_API_KEY;
      process.env.SUPERMEMORY_API_KEY = "mock-api-key";
      mockSupermemoryAdd.mockReset();
      mockSupermemoryDeleteDocument.mockReset();
      mockSupermemorySearchDocuments.mockReset();
      mockGetRequestContext.mockReturnValue({
        userId: "user-abc",
        requestId: "req-123",
        scopes: ["openid", "email", "mcp:tools:execute", "mcp:tools:admin"],
      });
    });

    afterEach(() => {
      process.env.SUPERMEMORY_API_KEY = originalApiKey;
    });

    it("indexes a new mcp server into Supermemory successfully", async () => {
      mockSupermemoryAdd.mockResolvedValueOnce({ success: true });
      mockSupermemoryDeleteDocument.mockResolvedValueOnce({ success: true });

      const tools = new Map<string, { config: Record<string, any>; handler: Function }>();
      const server = {
        registerTool: (name: string, config: Record<string, any>, handler: Function) => {
          tools.set(name, { config, handler });
        },
      };

      registerMcpCoreTools(server as never);
      const result = await tools.get("index_mcp_server")?.handler({
        name: "Test Server",
        url: "https://example.com/mcp",
        description: "A mock server description",
        keywords: ["mock", "test"],
      });

      expect(result?.isError).toBeFalsy();
      expect(getContent(result!)?.success).toBe(true);
      expect(mockSupermemoryDeleteDocument).toHaveBeenCalledWith("test-server");
      expect(mockSupermemoryAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          containerTag: "mcp-directory",
          metadata: expect.objectContaining({
            server_name: "Test Server",
          }),
        })
      );
    });

    it("deletes an mcp server from Supermemory successfully", async () => {
      mockSupermemoryDeleteDocument.mockResolvedValueOnce({ success: true });

      const tools = new Map<string, { config: Record<string, any>; handler: Function }>();
      const server = {
        registerTool: (name: string, config: Record<string, any>, handler: Function) => {
          tools.set(name, { config, handler });
        },
      };

      registerMcpCoreTools(server as never);
      const result = await tools.get("delete_mcp_server")?.handler({
        name: "Test Server",
      });

      expect(result?.isError).toBeFalsy();
      expect(getContent(result!)?.success).toBe(true);
      expect(mockSupermemoryDeleteDocument).toHaveBeenCalledWith("test-server");
    });

    it("searches and finds mcp servers from Supermemory successfully", async () => {
      mockSupermemorySearchDocuments.mockResolvedValueOnce({
        results: [
          {
            title: "Test Server",
            score: 0.9,
            content: "Mock Content for Test Server",
            metadata: { keywords: ["mock", "test"] },
          },
        ],
        total: 1,
        timing: 5,
      });

      const tools = new Map<string, { config: Record<string, any>; handler: Function }>();
      const server = {
        registerTool: (name: string, config: Record<string, any>, handler: Function) => {
          tools.set(name, { config, handler });
        },
      };

      registerMcpCoreTools(server as never);
      const result = await tools.get("find_mcp_servers")?.handler({
        query: "test",
      });

      expect(result?.isError).toBeFalsy();
      expect(getContent(result!)?.servers).toHaveLength(1);
      expect(getContent(result!)?.servers[0].title).toBe("Test Server");
      expect(mockSupermemorySearchDocuments).toHaveBeenCalledWith({
        q: "test",
        containerTags: ["mcp-directory"],
        includeFullDocs: true,
        documentThreshold: 0.6,
        rerank: true,
        rewriteQuery: true,
      });
    });

    it("returns error if API key is not configured", async () => {
      delete process.env.SUPERMEMORY_API_KEY;

      const tools = new Map<string, { config: Record<string, any>; handler: Function }>();
      const server = {
        registerTool: (name: string, config: Record<string, any>, handler: Function) => {
          tools.set(name, { config, handler });
        },
      };

      registerMcpCoreTools(server as never);
      const result = await tools.get("find_mcp_servers")?.handler({
        query: "test",
      });

      expect(result?.isError).toBe(true);
      expect(result?.content?.[0]?.text).toContain("not configured on the server");
    });
  });
});
