import { beforeEach, describe, expect, it, vi } from "vitest";

const commandMocks = vi.hoisted(() => ({
  daemon: vi.fn(),
  serve: vi.fn(),
}));

vi.mock("../src/commands/daemon.js", () => ({ cmdDaemon: commandMocks.daemon }));
vi.mock("../src/commands/serve.js", () => ({ cmdServe: commandMocks.serve }));

import { runCli } from "../src/cli.js";

function streams() {
  let stderr = "";
  return {
    value: () => stderr,
    streams: {
      input: process.stdin,
      output: { write: () => true } as never,
      error: { write: (text: string) => { stderr += text; return true; } } as never,
    },
  };
}

describe("public CLI failure exits", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    "Port 8765 is occupied by PID 4321.",
    "Gateway process record 4321 is alive but unhealthy.",
    "Daemon failed to become healthy within 15 seconds.",
  ])("returns exit 1 when daemon start fails: %s", async (message) => {
    commandMocks.daemon.mockRejectedValueOnce(new Error(message));
    const output = streams();

    await expect(runCli(["daemon", "start"], output.streams)).resolves.toBe(1);
    expect(output.value()).toContain(message);
  });

  it("returns exit 1 when foreground serve fails", async () => {
    commandMocks.serve.mockRejectedValueOnce(new Error("listen EADDRINUSE"));
    const output = streams();

    await expect(runCli(["serve"], output.streams)).resolves.toBe(1);
    expect(output.value()).toContain("listen EADDRINUSE");
  });
});
