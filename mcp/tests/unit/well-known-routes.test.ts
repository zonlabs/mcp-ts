import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { wellKnownRoutes } from "../../src/routes/well-known";

const { mockLoadEnv, mockGetIssuer } = vi.hoisted(() => {
  return {
    mockLoadEnv: vi.fn(),
    mockGetIssuer: vi.fn(),
  };
});

vi.mock("../../src/config/env", () => ({
  loadEnv: mockLoadEnv,
  getIssuer: mockGetIssuer,
}));

describe("wellKnownRoutes", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIssuer.mockReturnValue("https://issuer.example.com");
    mockLoadEnv.mockReturnValue({});

    app = new Hono();
    app.route("/.well-known", wellKnownRoutes);
  });

  it("uses the request URL for the protected resource when MCP_RESOURCE_URL is unset", async () => {
    const res = await app.request("http://127.0.0.1:8787/.well-known/oauth-protected-resource");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      authorization_servers: ["https://issuer.example.com"],
      resource: "http://127.0.0.1:8787/mcp",
      resource_documentation: "http://127.0.0.1:8787/mcp",
    });
  });

  it("respects MCP_RESOURCE_URL when set", async () => {
    mockLoadEnv.mockReturnValue({
      MCP_RESOURCE_URL: "https://configured.example.com/custom-mcp",
    });

    const res = await app.request("http://127.0.0.1:8787/.well-known/oauth-protected-resource");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      resource: "https://configured.example.com/custom-mcp",
      resource_documentation: "https://configured.example.com/custom-mcp",
    });
  });
});
