import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authMiddleware } from "../../src/middleware/auth";

const { mockResolveUserAndScopesFromRequest, mockLoadEnv, mockGetIssuer } = vi.hoisted(() => {
  return {
    mockResolveUserAndScopesFromRequest: vi.fn(),
    mockLoadEnv: vi.fn(),
    mockGetIssuer: vi.fn(),
  };
});

vi.mock("../../src/core/auth", () => ({
  resolveUserAndScopesFromRequest: mockResolveUserAndScopesFromRequest,
}));

vi.mock("../../src/config/env", () => ({
  loadEnv: mockLoadEnv,
  getIssuer: mockGetIssuer,
}));

describe("authMiddleware", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIssuer.mockReturnValue("https://issuer.example.com");
    mockLoadEnv.mockReturnValue({});

    app = new Hono();
    app.use("/protected", authMiddleware);
    app.get("/protected", (c) => c.text("success"));
  });

  it("passes through if resolveUserAndScopesFromRequest returns user and scopes", async () => {
    mockResolveUserAndScopesFromRequest.mockResolvedValue({ userId: "user-123", scopes: ["read"] });
    const res = await app.request("/protected");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("success");
  });

  it("returns 401 and resource metadata with http origin if behind no proxy and no env set", async () => {
    mockResolveUserAndScopesFromRequest.mockResolvedValue(null);
    const res = await app.request("http://localhost/protected");
    expect(res.status).toBe(401);

    const wwwAuth = res.headers.get("WWW-Authenticate");
    expect(wwwAuth).toContain(
      'resource_metadata="http://localhost/.well-known/oauth-protected-resource"'
    );
  });

  it("respects MCP_RESOURCE_URL when set", async () => {
    mockResolveUserAndScopesFromRequest.mockResolvedValue(null);
    mockLoadEnv.mockReturnValue({
      MCP_RESOURCE_URL: "https://my-resource.example.com/mcp",
    });

    const res = await app.request("http://localhost/protected");
    expect(res.status).toBe(401);

    const wwwAuth = res.headers.get("WWW-Authenticate");
    expect(wwwAuth).toContain(
      'resource_metadata="https://my-resource.example.com/.well-known/oauth-protected-resource"'
    );
  });

});
