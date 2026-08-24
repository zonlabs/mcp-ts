import { describe, expect, it, vi } from "vitest";
import {
  ensureGatewayRunning,
  withGatewayClient,
} from "../src/gateway/command-client.js";

describe("ensureGatewayRunning", () => {
  it("starts one daemon when the gateway is stopped", async () => {
    const getStatus = vi.fn(async () => ({ state: "stopped", port: 8765, managed: false }));
    const startDaemon = vi.fn(async () => ({ pid: 42, port: 8765, managed: true, logPath: "daemon.log" }));

    const result = await ensureGatewayRunning({}, {
      getStatus: getStatus as never,
      startDaemon: startDaemon as never,
    });

    expect(startDaemon).toHaveBeenCalledOnce();
    expect(result).toEqual({
      endpoint: "http://127.0.0.1:8765/mcp",
      port: 8765,
      state: "running",
      managed: true,
    });
  });

  it("reuses a foreground gateway without starting a daemon", async () => {
    const startDaemon = vi.fn();

    const result = await ensureGatewayRunning({}, {
      getStatus: vi.fn(async () => ({
        state: "external",
        port: 9123,
        managed: false,
        gatewayResponsive: true,
      })) as never,
      startDaemon: startDaemon as never,
    });

    expect(result).toEqual({
      endpoint: "http://127.0.0.1:9123/mcp",
      port: 9123,
      state: "external",
      managed: false,
    });
    expect(startDaemon).not.toHaveBeenCalled();
  });

  it.each(["occupied", "unhealthy"] as const)(
    "returns the %s error without starting another path",
    async (state) => {
      const startDaemon = vi.fn();

      await expect(ensureGatewayRunning({}, {
        getStatus: vi.fn(async () => ({
          state,
          port: 8765,
          portOwnerPid: 99,
          logPath: "daemon.log",
        })) as never,
        startDaemon: startDaemon as never,
      })).rejects.toThrow(state === "occupied" ? /Port 8765 is occupied by PID 99/ : /unhealthy.*daemon\.log/i);
      expect(startDaemon).not.toHaveBeenCalled();
    },
  );
});

describe("withGatewayClient", () => {
  it("uses managed gateway defaults when options are omitted", async () => {
    const close = vi.fn(async () => undefined);

    await withGatewayClient(
      undefined as never,
      async () => undefined,
      {
        connect: vi.fn(async () => ({ close })) as never,
        ensureGateway: vi.fn(async () => ({
          endpoint: "http://127.0.0.1:8765/mcp",
          port: 8765,
          state: "running",
          managed: true,
        })) as never,
        loadSession: vi.fn(() => ({ accessToken: "saved" })) as never,
      },
    );

    expect(close).toHaveBeenCalledOnce();
  });

  it("connects exactly once to an explicit endpoint without inspecting the local gateway", async () => {
    const close = vi.fn(async () => undefined);
    const client = { close };
    const connect = vi.fn(async () => client);
    const ensureGateway = vi.fn();
    const loadSession = vi.fn();
    const action = vi.fn(async () => "result");

    await expect(withGatewayClient(
      { endpoint: "https://example.test/custom" },
      action as never,
      {
        connect: connect as never,
        ensureGateway: ensureGateway as never,
        loadSession: loadSession as never,
      },
    )).resolves.toBe("result");

    expect(connect).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledWith("https://example.test/custom", { onProgress: undefined });
    expect(action).toHaveBeenCalledOnce();
    expect(action).toHaveBeenCalledWith(client);
    expect(close).toHaveBeenCalledOnce();
    expect(ensureGateway).not.toHaveBeenCalled();
    expect(loadSession).not.toHaveBeenCalled();
  });

  it("treats an explicitly supplied empty endpoint as an endpoint error path", async () => {
    const close = vi.fn(async () => undefined);
    const connect = vi.fn(async () => ({ close }));
    const ensureGateway = vi.fn();

    await withGatewayClient(
      { endpoint: "" },
      async () => undefined,
      { connect: connect as never, ensureGateway: ensureGateway as never },
    );

    expect(connect).toHaveBeenCalledWith("", { onProgress: undefined });
    expect(ensureGateway).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it("warns once when the ensured gateway has no saved remote session", async () => {
    const warning = vi.fn();
    const close = vi.fn(async () => undefined);
    const connect = vi.fn(async () => ({ close }));
    const ensureGateway = vi.fn(async () => ({
      endpoint: "http://127.0.0.1:8765/mcp",
      port: 8765,
      state: "running",
      managed: true,
    }));

    await withGatewayClient(
      { onWarning: warning },
      async () => undefined,
      {
        connect: connect as never,
        ensureGateway: ensureGateway as never,
        loadSession: vi.fn(() => null),
      },
    );

    expect(warning).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledWith("Remote tools are unavailable. Run mcpa login.");
    expect(connect).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("does not warn when a saved remote session exists", async () => {
    const warning = vi.fn();
    const close = vi.fn(async () => undefined);

    await withGatewayClient(
      { onWarning: warning },
      async () => undefined,
      {
        connect: vi.fn(async () => ({ close })) as never,
        ensureGateway: vi.fn(async () => ({
          endpoint: "http://127.0.0.1:8765/mcp",
          port: 8765,
          state: "external",
          managed: false,
        })) as never,
        loadSession: vi.fn(() => ({ accessToken: "saved" })) as never,
      },
    );

    expect(warning).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it("propagates an action failure without retrying and closes once", async () => {
    const failure = new Error("downstream rejected");
    const close = vi.fn(async () => undefined);
    const connect = vi.fn(async () => ({ close }));
    const action = vi.fn(async () => {
      throw failure;
    });

    await expect(withGatewayClient(
      { endpoint: "https://example.test/mcp" },
      action as never,
      { connect: connect as never },
    )).rejects.toBe(failure);

    expect(connect).toHaveBeenCalledOnce();
    expect(action).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
