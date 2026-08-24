import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ensureGatewayRunning,
  withGatewayClient,
} from "../src/gateway/command-client.js";

function deferred<T>(): {
  promise: Promise<T>;
  reject: (reason: unknown) => void;
} {
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((_resolve, rejectPromise) => {
    reject = rejectPromise;
  });
  return { promise, reject };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("gateway command lifecycle", () => {
  test("starts once when cold and reuses the gateway for four warm command scopes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000_000));
    let running = false;
    const startDaemon = vi.fn(async () => {
      running = true;
      return { pid: 42, port: 8765, managed: true, logPath: "daemon.log" };
    });
    const getStatus = vi.fn(async () => running
      ? { state: "running" as const, port: 8765, managed: true }
      : { state: "stopped" as const, port: 8765, managed: false });
    const clients: Array<{ close: ReturnType<typeof vi.fn> }> = [];
    const connect = vi.fn(async () => {
      const client = { close: vi.fn(async () => undefined) };
      clients.push(client);
      return client;
    });
    const progress = vi.fn();
    const runScope = () => withGatewayClient(
      { onProgress: progress },
      async () => "complete",
      {
        ensureGateway: (options) => ensureGatewayRunning(options, {
          getStatus: getStatus as never,
          startDaemon: startDaemon as never,
        }),
        loadSession: vi.fn(() => ({ accessToken: "saved" })) as never,
        connect: connect as never,
      },
    );

    await expect(runScope()).resolves.toBe("complete");
    expect(progress).toHaveBeenCalledWith("Starting MCP gateway on port 8765...");

    for (let scope = 0; scope < 4; scope += 1) {
      const warm = runScope();
      await expect(warm).resolves.toBe("complete");
      expect(Date.now()).toBe(1_000_000);
    }

    expect(startDaemon).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(5);
    expect(clients.every((client) => client.close.mock.calls.length === 1)).toBe(true);
  });

  test("waits for a rejected command action before closing its client", async () => {
    vi.useFakeTimers();
    const request = deferred<never>();
    const failure = new Error("gateway request rejected");
    const close = vi.fn(async () => undefined);
    const unhandledRejections: unknown[] = [];
    const listener = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    process.on("unhandledRejection", listener);

    try {
      const command = withGatewayClient(
        { endpoint: "http://127.0.0.1:8765/mcp" },
        () => request.promise,
        { connect: vi.fn(async () => ({ close })) as never },
      );

      await Promise.resolve();
      expect(close).not.toHaveBeenCalled();

      request.reject(failure);
      await expect(command).rejects.toBe(failure);
      await vi.runAllTimersAsync();
      await Promise.resolve();

      expect(close).toHaveBeenCalledOnce();
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", listener);
    }
  });
});
