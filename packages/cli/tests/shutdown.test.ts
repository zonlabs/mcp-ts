import { describe, expect, it, vi } from "vitest";
import { createShutdownHandler } from "../src/commands/serve.js";

describe("serve shutdown", () => {
  it("forces exit when interrupted again during graceful cleanup", async () => {
    let finishCleanup!: () => void;
    const cleanup = vi.fn(() => new Promise<void>((resolve) => {
      finishCleanup = resolve;
    }));
    const exit = vi.fn();
    const handler = createShutdownHandler({
      cleanup,
      exit,
      onSignal: vi.fn(),
      forceAfterMs: 60_000,
    });

    const firstInterrupt = handler("SIGINT");
    await Promise.resolve();
    expect(cleanup).toHaveBeenCalledOnce();

    await handler("SIGINT");
    expect(exit).toHaveBeenCalledWith(130);

    finishCleanup();
    await firstInterrupt;
  });
});
