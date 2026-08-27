import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const promptMocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  isCancel: vi.fn(),
}));

vi.mock("@clack/prompts", () => ({
  confirm: promptMocks.confirm,
  isCancel: promptMocks.isCancel,
}));

import { confirmSignIn } from "../src/gateway/sign-in-prompt.js";

const originalIsTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");

function setInteractive(value: boolean): void {
  Object.defineProperty(process.stdin, "isTTY", {
    configurable: true,
    value,
  });
}

beforeEach(() => {
  promptMocks.confirm.mockReset();
  promptMocks.isCancel.mockReset();
  promptMocks.isCancel.mockReturnValue(false);
});

afterEach(() => {
  if (originalIsTTY) Object.defineProperty(process.stdin, "isTTY", originalIsTTY);
  else delete (process.stdin as { isTTY?: boolean }).isTTY;
});

describe("confirmSignIn", () => {
  it("asks the conventional sign-in question with Yes selected by default", async () => {
    setInteractive(true);
    promptMocks.confirm.mockResolvedValue(true);

    await expect(confirmSignIn()).resolves.toBe(true);

    expect(promptMocks.confirm).toHaveBeenCalledWith({
      message: "Sign in now?",
      initialValue: true,
    });
  });

  it("declines without prompting outside an interactive terminal", async () => {
    setInteractive(false);

    await expect(confirmSignIn()).resolves.toBe(false);
    expect(promptMocks.confirm).not.toHaveBeenCalled();
  });

  it("treats prompt cancellation as a decline", async () => {
    setInteractive(true);
    const cancelled = Symbol("cancelled");
    promptMocks.confirm.mockResolvedValue(cancelled);
    promptMocks.isCancel.mockReturnValue(true);

    await expect(confirmSignIn()).resolves.toBe(false);
  });
});
