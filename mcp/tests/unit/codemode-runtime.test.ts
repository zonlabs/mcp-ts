import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateCodeModeRuntime,
  mockMcpServers,
  mockRecordMcpToolCallEvent,
  mockGetRequestContext,
  mockDynamicWorkerExecutor,
} = vi.hoisted(() => ({
  mockCreateCodeModeRuntime: vi.fn(),
  mockMcpServers: vi.fn(),
  mockRecordMcpToolCallEvent: vi.fn(),
  mockGetRequestContext: vi.fn(),
  mockDynamicWorkerExecutor: vi.fn(function DynamicWorkerExecutor(this: any, options: unknown) {
    this.options = options;
    this.execute = vi.fn();
  }),
}));

vi.mock("@mcp-ts/codemode", () => ({
  createCodeModeRuntime: mockCreateCodeModeRuntime,
  mcpServers: mockMcpServers,
}));

vi.mock("@cloudflare/codemode", () => ({
  DynamicWorkerExecutor: mockDynamicWorkerExecutor,
}));

vi.mock("../../src/core/analytics", () => ({
  recordMcpToolCallEvent: mockRecordMcpToolCallEvent,
}));

vi.mock("../../src/core/request-context", () => ({
  getRequestContext: mockGetRequestContext,
}));

describe("createWorkflowCodeModeRuntime", () => {
  beforeAll(() => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "dummy-key";
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRequestContext.mockReturnValue({});
    mockCreateCodeModeRuntime.mockResolvedValue({ run: vi.fn() });
  });

  function cloudflareLoader() {
    return { loader: { fetch: vi.fn() } };
  }

  it("records successful CodeMode tool calls with request context", async () => {
    const callTool = vi.fn().mockResolvedValue({ ok: true });
    mockMcpServers.mockReturnValue([
      {
        serverId: "github",
        serverName: "GitHub",
        serverUrl: "https://github.com",
        listTools: vi.fn(),
        callTool,
      },
    ]);
    mockGetRequestContext.mockReturnValue({
      userId: "user-1",
      requestId: "req-1",
      mcpSessionId: "session-1",
    });
    const { createWorkflowCodeModeRuntime } = await import("../../src/core/codemode-runtime");

    await createWorkflowCodeModeRuntime({ getClients: () => [] }, {}, undefined, cloudflareLoader());
    const wrappedServer = mockCreateCodeModeRuntime.mock.calls[0][0].servers[0];
    const result = await wrappedServer.callTool("search_issues", { q: "bug" });

    expect(result).toEqual({ ok: true });
    expect(mockRecordMcpToolCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        requestId: "req-1",
        mcpSessionId: "session-1",
        serverId: "github",
        serverName: "GitHub",
        serverUrl: "https://github.com",
        toolName: "search_issues",
        eventType: "downstream_tool",
        status: "success",
      })
    );
  });

  it("keeps downstream CodeMode analytics alive with request waitUntil", async () => {
    const waitUntil = vi.fn();
    const callTool = vi.fn().mockResolvedValue({ ok: true });
    mockRecordMcpToolCallEvent.mockResolvedValue(undefined);
    mockMcpServers.mockReturnValue([
      {
        serverId: "github",
        serverName: "GitHub",
        listTools: vi.fn(),
        callTool,
      },
    ]);
    mockGetRequestContext.mockReturnValue({
      userId: "user-1",
      requestId: "req-1",
      executionCtx: { waitUntil },
    });
    const { createWorkflowCodeModeRuntime } = await import("../../src/core/codemode-runtime");

    await createWorkflowCodeModeRuntime({ getClients: () => [] }, {}, undefined, cloudflareLoader());
    const wrappedServer = mockCreateCodeModeRuntime.mock.calls[0][0].servers[0];
    await wrappedServer.callTool("search_issues", { q: "bug" });

    expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));
  });

  it("records failed CodeMode tool calls and preserves thrown errors", async () => {
    const failure = new Error("GitHub failed");
    const callTool = vi.fn().mockRejectedValue(failure);
    mockMcpServers.mockReturnValue([
      {
        serverId: "github",
        serverName: "GitHub",
        listTools: vi.fn(),
        callTool,
      },
    ]);
    const { createWorkflowCodeModeRuntime } = await import("../../src/core/codemode-runtime");

    await createWorkflowCodeModeRuntime(
      { getClients: () => [] },
      {},
      { userId: "user-1", requestId: "req-1", mcpSessionId: "session-1" },
      cloudflareLoader()
    );
    const wrappedServer = mockCreateCodeModeRuntime.mock.calls[0][0].servers[0];

    await expect(wrappedServer.callTool("search_issues", {})).rejects.toThrow("GitHub failed");
    expect(mockRecordMcpToolCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        eventType: "downstream_tool",
        error: failure,
      })
    );
  });

  it("records returned raw MCP error envelopes as failed downstream calls", async () => {
    const rawError = {
      content: [{ type: "text", text: "GitHub returned 403" }],
      isError: true,
    };
    const callToolRaw = vi.fn().mockResolvedValue(rawError);
    mockMcpServers.mockReturnValue([
      {
        serverId: "github",
        serverName: "GitHub",
        listTools: vi.fn(),
        callToolRaw,
      },
    ]);
    const { createWorkflowCodeModeRuntime } = await import("../../src/core/codemode-runtime");

    await createWorkflowCodeModeRuntime(
      { getClients: () => [] },
      {},
      { userId: "user-1", requestId: "req-1", mcpSessionId: "session-1" },
      cloudflareLoader()
    );
    const wrappedServer = mockCreateCodeModeRuntime.mock.calls[0][0].servers[0];

    await expect(wrappedServer.callToolRaw("search_issues", {})).resolves.toBe(rawError);
    expect(mockRecordMcpToolCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "downstream_tool",
        status: "error",
        error: "GitHub returned 403",
      })
    );
  });

  it("preserves prototype methods on wrapped tool servers", async () => {
    class PrototypeToolServer {
      serverId = "docs";
      serverName = "Docs";

      async listTools() {
        return { tools: [] };
      }

      async callTool() {
        return { ok: true };
      }
    }
    mockMcpServers.mockReturnValue([new PrototypeToolServer()]);
    const { createWorkflowCodeModeRuntime } = await import("../../src/core/codemode-runtime");

    await createWorkflowCodeModeRuntime(
      { getClients: () => [] },
      {},
      { userId: "user-1", requestId: "req-1" },
      cloudflareLoader()
    );
    const wrappedServer = mockCreateCodeModeRuntime.mock.calls[0][0].servers[0];

    await expect(wrappedServer.listTools()).resolves.toEqual({ tools: [] });
  });

  it("does not record calls when user or request context is missing", async () => {
    const callTool = vi.fn().mockResolvedValue({ ok: true });
    mockMcpServers.mockReturnValue([
      {
        serverId: "github",
        serverName: "GitHub",
        listTools: vi.fn(),
        callTool,
      },
    ]);
    const { createWorkflowCodeModeRuntime } = await import("../../src/core/codemode-runtime");

    await createWorkflowCodeModeRuntime({ getClients: () => [] }, {}, undefined, cloudflareLoader());
    const wrappedServer = mockCreateCodeModeRuntime.mock.calls[0][0].servers[0];
    await wrappedServer.callTool("search_issues", {});

    expect(mockRecordMcpToolCallEvent).not.toHaveBeenCalled();
  });

  it("caps timeoutMs to MCP_SCRIPT_TIMEOUT_MS", async () => {
    process.env.MCP_SCRIPT_TIMEOUT_MS = "5000";
    // Clear cached env configuration so parseEnv runs again
    const { loadEnv } = await import("../../src/config/env");
    const { createWorkflowCodeModeRuntime } = await import("../../src/core/codemode-runtime");

    // Force reloading environment
    const config = loadEnv();
    (config as any).MCP_SCRIPT_TIMEOUT_MS = 5000;

    // Test case 1: requested timeout is higher than cap
    await createWorkflowCodeModeRuntime({ getClients: () => [] }, { timeoutMs: 10000 }, undefined, cloudflareLoader());
    expect(mockCreateCodeModeRuntime).toHaveBeenLastCalledWith(
      expect.objectContaining({
        limits: expect.objectContaining({ timeoutMs: 5000 }),
      })
    );

    // Test case 2: requested timeout is lower than cap
    await createWorkflowCodeModeRuntime({ getClients: () => [] }, { timeoutMs: 3000 }, undefined, cloudflareLoader());
    expect(mockCreateCodeModeRuntime).toHaveBeenLastCalledWith(
      expect.objectContaining({
        limits: expect.objectContaining({ timeoutMs: 3000 }),
      })
    );

    // Test case 3: no timeout provided, should default to cap
    await createWorkflowCodeModeRuntime({ getClients: () => [] }, {}, undefined, cloudflareLoader());
    expect(mockCreateCodeModeRuntime).toHaveBeenLastCalledWith(
      expect.objectContaining({
        limits: expect.objectContaining({ timeoutMs: 5000 }),
      })
    );
  });

  it("requires a Cloudflare Worker Loader binding", async () => {
    mockMcpServers.mockReturnValue([]);
    const { createWorkflowCodeModeRuntime } = await import("../../src/core/codemode-runtime");

    await expect(createWorkflowCodeModeRuntime({ getClients: () => [] }, {})).rejects.toThrow(
      "Cloudflare Worker Loader binding is required"
    );
  });

  it("wraps raw Cloudflare Worker Loader bindings in DynamicWorkerExecutor", async () => {
    const loader = { fetch: vi.fn() };
    mockMcpServers.mockReturnValue([]);
    const { createWorkflowCodeModeRuntime } = await import("../../src/core/codemode-runtime");

    await createWorkflowCodeModeRuntime(
      { getClients: () => [] },
      { timeoutMs: 1234 },
      { userId: "user-1", requestId: "req-1" },
      { loader }
    );

    expect(mockDynamicWorkerExecutor).toHaveBeenCalledWith({
      loader,
      timeout: 1234,
    });
    expect(mockCreateCodeModeRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        runtime: "executor",
        executor: expect.objectContaining({
          options: {
            loader,
            timeout: 1234,
          },
          execute: expect.any(Function),
        }),
      })
    );
  });
});
