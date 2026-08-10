import { beforeEach, describe, expect, it, vi } from "vitest";

const mockMcpInstance = { registerTool: vi.fn() };
const { mockRegisterMcpCoreTools, mockCreateInstrumentedMcpServer } = vi.hoisted(() => ({
  mockRegisterMcpCoreTools: vi.fn(),
  mockCreateInstrumentedMcpServer: vi.fn(() => mockMcpInstance),
}));

vi.mock("../../src/core/instrumentation", () => ({
  createInstrumentedMcpServer: mockCreateInstrumentedMcpServer,
  MCP_ASSISTANT_SERVER_ID: "mcp-assistant",
}));

vi.mock("../../src/core/mcp-core-tools", () => ({
  registerMcpCoreTools: mockRegisterMcpCoreTools,
}));

describe("createMcpServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates instrumented server and registers core tools", async () => {
    const { createMcpServer } = await import("../../src/core/server");

    const server = createMcpServer();

    expect(mockCreateInstrumentedMcpServer).toHaveBeenCalledWith({
      name: "mcp-assistant",
      version: "1.0.4",
    });
    expect(server).toBe(mockMcpInstance);
    expect(mockRegisterMcpCoreTools).toHaveBeenCalledWith(mockMcpInstance);
  });
});
