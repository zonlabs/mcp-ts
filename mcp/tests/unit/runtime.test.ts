import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  mockClose,
  mockServe,
  mockStopSessionInvalidation,
} = vi.hoisted(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "dummy-key-with-long-enough-length-123456789";
  process.env.MCP_OAUTH_CODE_SECRET = "dummy-code-secret-dummy-code-secret-dummy-code-secret";
  process.env.MCP_OAUTH_ACCESS_TOKEN_SECRET =
    "dummy-access-secret-dummy-access-secret-dummy-access-secret";

  const closeFn = vi.fn();
  const serveFn = vi.fn(() => ({ close: closeFn }));

  return {
    mockClose: closeFn,
    mockServe: serveFn,
    mockStopSessionInvalidation: vi.fn(),
  };
});

vi.mock("@hono/node-server", () => ({
  serve: mockServe,
}));

vi.mock("../../src/core/mcp-session-invalidation", () => ({
  startSessionInvalidation: vi.fn(),
  stopSessionInvalidation: mockStopSessionInvalidation,
}));

import { createAppRuntime } from "../../src/core/runtime";

describe("createAppRuntime lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PORT = "3002";
  });

  it("boots serve server and runs graceful shutdown idempotently", async () => {
    mockClose.mockImplementation((cb: Function) => cb());

    const runtime = createAppRuntime();

    expect(mockServe).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 3002,
      })
    );

    // Call shutdown first time
    await runtime.shutdown();

    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(mockStopSessionInvalidation).toHaveBeenCalledTimes(1);

    // Call shutdown second time
    await runtime.shutdown();

    // Verify it is idempotent (close/cleanup functions not called again)
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(mockStopSessionInvalidation).toHaveBeenCalledTimes(1);
  });
});
