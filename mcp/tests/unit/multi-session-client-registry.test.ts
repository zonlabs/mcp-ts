import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockRemoveSession = vi.fn();
const mockMultiSessionClientConstructor = vi.fn();

vi.mock("@mcp-ts/sdk/server", () => ({
  MultiSessionClient: vi.fn().mockImplementation(function (this: any, userId: string) {
    mockMultiSessionClientConstructor(userId);
    this.userId = userId;
    this.connect = mockConnect;
    this.disconnect = mockDisconnect;
    this.removeSession = mockRemoveSession;
    this.getClients = () => this.clients ?? [];
  }),
}));

vi.mock("../../src/config/env", () => ({
  loadEnv: vi.fn(() => ({})),
}));

describe("multi-session-client-registry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
    mockDisconnect.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    const { resetMultiSessionClientRegistryForTests } = await import(
      "../../src/core/multi-session-client-registry"
    );
    resetMultiSessionClientRegistryForTests();
  });

  it("creates and connects a fresh MultiSessionClient on every request", async () => {
    const { getMultiSessionClient } = await import(
      "../../src/core/multi-session-client-registry"
    );

    const client1 = await getMultiSessionClient("user-1");
    const client2 = await getMultiSessionClient("user-1");

    expect(client1).not.toBe(client2);
    expect(mockMultiSessionClientConstructor).toHaveBeenCalledTimes(2);
    expect(mockConnect).toHaveBeenCalledTimes(2);
  });

  it("cache invalidation hooks are Cloudflare no-ops", async () => {
    const { getMultiSessionClient, invalidateMultiSessionClient } = await import(
      "../../src/core/multi-session-client-registry"
    );

    await getMultiSessionClient("user-2");
    expect(mockConnect).toHaveBeenCalledTimes(1);

    invalidateMultiSessionClient("user-2");
    expect(mockDisconnect).not.toHaveBeenCalled();

    await getMultiSessionClient("user-2");
    expect(mockDisconnect).not.toHaveBeenCalled();
    expect(mockConnect).toHaveBeenCalledTimes(2);
  });

  it("closeAllCachedClients is a Cloudflare no-op", async () => {
    const { getMultiSessionClient, closeAllCachedClients } = await import(
      "../../src/core/multi-session-client-registry"
    );

    await getMultiSessionClient("user-4");
    await getMultiSessionClient("user-5");

    closeAllCachedClients();

    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it("invalidateAllMultiSessionClients is a Cloudflare no-op", async () => {
    const { getMultiSessionClient, invalidateAllMultiSessionClients } = await import(
      "../../src/core/multi-session-client-registry"
    );

    invalidateAllMultiSessionClients();
    await getMultiSessionClient("user-6");

    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it("removeCachedSession is a Cloudflare no-op", async () => {
    const { removeCachedSession } = await import(
      "../../src/core/multi-session-client-registry"
    );

    mockRemoveSession.mockResolvedValue(true);

    await removeCachedSession("user-7", "sess-1");

    expect(mockRemoveSession).not.toHaveBeenCalled();
  });
});
