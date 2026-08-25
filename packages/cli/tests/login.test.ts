import { expect, it, vi } from "vitest";

const loginUx = vi.hoisted(() => ({
  outro: vi.fn(),
  spinnerStart: vi.fn(),
  spinnerStop: vi.fn(),
}));

vi.mock("../src/ux.js", () => ({
  intro: vi.fn(),
  outro: loginUx.outro,
  printBanner: vi.fn(),
  spinner: () => ({ start: loginUx.spinnerStart, stop: loginUx.spinnerStop }),
}));

import { activateRunningGateway } from "../src/gateway/activation.js";
import { cmdLogin } from "../src/commands/login.js";

const authSession = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  accessTokenExpiresAt: Date.now() + 120_000,
};

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
    return { ...authSession, alreadySignedIn: false } as never;
  });
  const activate = vi.fn(async () => {
    order.push("activate");
    return { activated: true, port: 9123 } as const;
  });

  await cmdLogin("https://remote.example", { login, activate });

  expect(order).toEqual(["login", "activate"]);
});

it.each([
  { alreadySignedIn: true, outroText: "Already signed in" },
  { alreadySignedIn: false, outroText: "Signed in successfully" },
])("renders the correct login result when alreadySignedIn=$alreadySignedIn", async ({
  alreadySignedIn,
  outroText,
}) => {
  loginUx.outro.mockClear();
  loginUx.spinnerStop.mockClear();

  await cmdLogin("https://remote.example", {
    login: vi.fn(async () => ({ ...authSession, alreadySignedIn })) as never,
    activate: vi.fn(async () => ({ activated: false })) as never,
  });

  expect(loginUx.spinnerStop).toHaveBeenCalledWith();
  expect(loginUx.outro).toHaveBeenCalledWith(outroText);
});

