import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveCredentialAndScopes = vi.fn();
vi.mock("../../src/core/auth", () => ({ resolveCredentialAndScopes }));

describe("bridge connection route", () => {
  beforeEach(() => resolveCredentialAndScopes.mockReset());

  it("requires a Bearer token and routes by authenticated user", async () => {
    resolveCredentialAndScopes.mockResolvedValue({ userId: "user-1", scopes: [] });
    const fetch = vi.fn(async (request: Request) => {
      expect(request.headers.get("x-mcpa-user-id")).toBe("user-1");
      expect(request.url).not.toContain("token=");
      return new Response("forwarded");
    });
    const namespace = {
      idFromName: vi.fn((value: string) => `id:${value}`),
      get: vi.fn(() => ({ fetch })),
    };
    const { handleBridgeConnect } = await import("../../src/routes/connect");

    const response = await handleBridgeConnect(
      new Request("https://api.example/bridge/connect", {
        headers: { authorization: "Bearer secret", upgrade: "websocket" },
      }),
      { BRIDGE_SESSION: namespace },
    );

    expect(response.status).toBe(200);
    expect(resolveCredentialAndScopes).toHaveBeenCalledWith("secret");
    expect(namespace.idFromName).toHaveBeenCalledWith("user-1");
  });

  it("rejects query-string credentials", async () => {
    const { handleBridgeConnect } = await import("../../src/routes/connect");
    const response = await handleBridgeConnect(
      new Request("https://api.example/bridge/connect?token=secret", {
        headers: { upgrade: "websocket" },
      }),
      { BRIDGE_SESSION: {} },
    );
    expect(response.status).toBe(401);
    expect(resolveCredentialAndScopes).not.toHaveBeenCalled();
  });
});
