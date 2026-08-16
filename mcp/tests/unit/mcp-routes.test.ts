import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockResolveCredentialAndScopes,
  mockCreateMcpHandler,
  mockMcpHandlerCallable,
} = vi.hoisted(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "dummy-key-with-long-enough-length-123456789";
  process.env.MCP_OAUTH_CODE_SECRET = "dummy-code-secret-dummy-code-secret-dummy-code-secret";
  process.env.MCP_OAUTH_ACCESS_TOKEN_SECRET =
    "dummy-access-secret-dummy-access-secret-dummy-access-secret";

  return {
    mockResolveCredentialAndScopes: vi.fn(),
    mockCreateMcpHandler: vi.fn(),
    mockMcpHandlerCallable: vi.fn(async () => new Response("mcp-ok", { status: 200 })),
  };
});

vi.mock("../../src/core/auth", () => ({
  resolveUserAndScopesFromRequest: mockResolveCredentialAndScopes,
}));

vi.mock("agents/mcp/server", () => ({
  createMcpHandler: mockCreateMcpHandler,
}));

import worker from "../../src/index";

describe("MCP Hono Routes", () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateMcpHandler.mockReturnValue(mockMcpHandlerCallable);
    mockResolveCredentialAndScopes.mockResolvedValue({
      userId: "user-1",
      scopes: ["openid", "mcp:tools:read"],
    });
  });

  it("delegates authenticated MCP requests to the Cloudflare MCP v2 handler", async () => {
    const response = await worker.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token",
        },
        body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
      }),
      { LOADER: {} },
      { waitUntil: vi.fn() } as never
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("mcp-ok");
    expect(mockCreateMcpHandler).toHaveBeenCalled();
    expect(mockMcpHandlerCallable).toHaveBeenCalled();
  });
});
