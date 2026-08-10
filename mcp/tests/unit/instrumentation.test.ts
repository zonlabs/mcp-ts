import { beforeEach, describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/server";

const { mockRecordMcpToolCallEvent, mockGetRequestContext } = vi.hoisted(() => ({
  mockRecordMcpToolCallEvent: vi.fn(),
  mockGetRequestContext: vi.fn(),
}));

vi.mock("../../src/core/analytics", () => ({
  recordMcpToolCallEvent: mockRecordMcpToolCallEvent,
}));

vi.mock("../../src/core/request-context", () => ({
  getRequestContext: mockGetRequestContext,
}));

import {
  createInstrumentedMcpServer,
  MCP_ASSISTANT_SERVER_ID,
} from "../../src/core/instrumentation";

describe("createInstrumentedMcpServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRequestContext.mockReturnValue({
      userId: "user-1",
      requestId: "request-1",
      mcpSessionId: "mcp-session-1",
    });
    mockRecordMcpToolCallEvent.mockResolvedValue(undefined);
  });

  it("records successful tool calls", async () => {
    const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    const origRegister = McpServer.prototype.registerTool;
    const mockSuperRegister = vi.fn();
    McpServer.prototype.registerTool = mockSuperRegister as never;

    const server = createInstrumentedMcpServer({ name: "test", version: "1.0.0" });
    server.registerTool("test-tool" as never, {} as never, handler as never);

    const [, , wrappedCb] = mockSuperRegister.mock.calls[0];
    await wrappedCb({ arg: 1 }, {});

    expect(handler).toHaveBeenCalledWith({ arg: 1 }, {});
    expect(mockRecordMcpToolCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        requestId: "request-1",
        serverId: MCP_ASSISTANT_SERVER_ID,
        toolName: "test-tool",
        eventType: "top_level",
        status: "success",
        durationMs: expect.any(Number),
      })
    );

    McpServer.prototype.registerTool = origRegister;
  });

  it("keeps top-level tool analytics alive with request waitUntil", async () => {
    const waitUntil = vi.fn();
    mockGetRequestContext.mockReturnValue({
      userId: "user-1",
      requestId: "request-1",
      executionCtx: { waitUntil },
    });
    mockRecordMcpToolCallEvent.mockResolvedValue(undefined);
    const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    const origRegister = McpServer.prototype.registerTool;
    const mockSuperRegister = vi.fn();
    McpServer.prototype.registerTool = mockSuperRegister as never;

    const server = createInstrumentedMcpServer({ name: "test", version: "1.0.0" });
    server.registerTool("test-tool" as never, {} as never, handler as never);

    const [, , wrappedCb] = mockSuperRegister.mock.calls[0];
    await wrappedCb({ arg: 1 }, {});

    expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));

    McpServer.prototype.registerTool = origRegister;
  });

  it("records failed tool calls and rethrows", async () => {
    const error = new Error("tool failed");
    const handler = vi.fn().mockRejectedValue(error);
    const origRegister = McpServer.prototype.registerTool;
    const mockSuperRegister = vi.fn();
    McpServer.prototype.registerTool = mockSuperRegister as never;

    const server = createInstrumentedMcpServer({ name: "test", version: "1.0.0" });
    server.registerTool("test-tool" as never, {} as never, handler as never);

    const [, , wrappedCb] = mockSuperRegister.mock.calls[0];
    await expect(wrappedCb({}, {})).rejects.toThrow(error);

    expect(mockRecordMcpToolCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: "test-tool", status: "error", error })
    );

    McpServer.prototype.registerTool = origRegister;
  });

  it("records returned MCP error results without throwing", async () => {
    const result = {
      content: [{ type: "text", text: "Error: bad" }],
      isError: true,
    };
    const origRegister = McpServer.prototype.registerTool;
    const mockSuperRegister = vi.fn();
    McpServer.prototype.registerTool = mockSuperRegister as never;

    const server = createInstrumentedMcpServer({ name: "test", version: "1.0.0" });
    server.registerTool(
      "test-tool" as never,
      {} as never,
      vi.fn().mockResolvedValue(result) as never
    );

    const [, , wrappedCb] = mockSuperRegister.mock.calls[0];
    await expect(wrappedCb({}, {})).resolves.toBe(result);

    expect(mockRecordMcpToolCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: "test-tool", status: "error", error: "bad" })
    );

    McpServer.prototype.registerTool = origRegister;
  });

  it("records returned MCP error object results without throwing", async () => {
    const result = {
      content: [{ type: "text", text: "Error: bad" }],
      isError: true,
    };
    const origRegister = McpServer.prototype.registerTool;
    const mockSuperRegister = vi.fn();
    McpServer.prototype.registerTool = mockSuperRegister as never;

    const server = createInstrumentedMcpServer({ name: "test", version: "1.0.0" });
    server.registerTool(
      "test-tool" as never,
      {} as never,
      vi.fn().mockResolvedValue(result) as never
    );

    const [, , wrappedCb] = mockSuperRegister.mock.calls[0];
    await expect(wrappedCb({}, {})).resolves.toBe(result);

    expect(mockRecordMcpToolCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "test-tool",
        status: "error",
        error: "bad",
      })
    );

    McpServer.prototype.registerTool = origRegister;
  });

  it("is transparent for empty request context", async () => {
    mockGetRequestContext.mockReturnValue({});
    const origRegister = McpServer.prototype.registerTool;
    const mockSuperRegister = vi.fn();
    McpServer.prototype.registerTool = mockSuperRegister as never;

    const server = createInstrumentedMcpServer({ name: "test", version: "1.0.0" });
    server.registerTool(
      "test-tool" as never,
      {} as never,
      vi.fn().mockResolvedValue("ok") as never
    );

    const [, , wrappedCb] = mockSuperRegister.mock.calls[0];
    await wrappedCb({}, {});

    expect(mockRecordMcpToolCallEvent).not.toHaveBeenCalled();

    McpServer.prototype.registerTool = origRegister;
  });
});
