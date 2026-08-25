import { expect, it, vi } from "vitest";
import { activateRunningGateway } from "../src/gateway/activation.js";
import { cmdLogin } from "../src/commands/login.js";

it("activates the existing gateway after login without starting another process", async () => {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ready: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  }));
  const startDaemon = vi.fn();

  await expect(activateRunningGateway({}, {
    getStatus: vi.fn(async () => ({
      state: "running",
      port: 9123,
      managed: true,
      running: true,
      gatewayResponsive: true,
    })) as never,
    fetchImpl: fetchImpl as never,
  })).resolves.toEqual({ activated: true, port: 9123 });
  expect(fetchImpl).toHaveBeenCalledWith(
    "http://127.0.0.1:9123/activate-remote",
    expect.objectContaining({ method: "POST" }),
  );
  expect(startDaemon).not.toHaveBeenCalled();
});

it("invokes gateway activation only after successful login", async () => {
  const order: string[] = [];
  const login = vi.fn(async () => {
    order.push("login");
    return {} as never;
  });
  const activate = vi.fn(async () => {
    order.push("activate");
    return { activated: true, port: 9123 } as const;
  });

  await cmdLogin("https://remote.example", undefined, { login, activate });

  expect(order).toEqual(["login", "activate"]);
});

