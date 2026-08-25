import { describe, expect, it } from "vitest";
import { assertKnownOptions, parsePortOption, validatePort } from "../src/cli-options.js";
import { runCli } from "../src/cli.js";

describe("strict public port validation", () => {
  it.each(["0", "1.5", "NaN", "65536", "-1"])(
    "rejects invalid CLI port %s",
    (value) => {
      expect(() => parsePortOption(value)).toThrow(
        "--port must be an integer between 1 and 65535",
      );
    },
  );

  it.each([0, 1.5, Number.NaN, 65_536, -1])(
    "rejects invalid programmatic port %s",
    (value) => {
      expect(() => validatePort(value)).toThrow(
        "port must be an integer between 1 and 65535",
      );
    },
  );

  it.each([1, 8765, 65_535])("accepts valid port %s", (value) => {
    expect(validatePort(value)).toBe(value);
    expect(parsePortOption(String(value))).toBe(value);
  });
});

it("rejects removed and unknown serve flags instead of changing lifecycle mode", () => {
  expect(() => assertKnownOptions(
    ["--detached"],
    { "--host": "value", "--port": "value", "--verbose": "boolean" },
  )).toThrow('Unknown option: "--detached"');
  expect(() => assertKnownOptions(
    ["-d"],
    { "--host": "value", "--port": "value", "--verbose": "boolean" },
  )).toThrow('Unknown option: "-d"');
});

it.each([
  ["daemon", "start", "--port", "0"],
  ["serve", "--port", "65536"],
  ["serve", "--detached"],
  ["login", "--login", "https://auth.example"],
])("returns a nonzero public CLI exit for invalid arguments: %s", async (...args) => {
  let stderr = "";
  const code = await runCli(args, {
    input: process.stdin,
    output: { write: () => true } as never,
    error: { write: (value: string) => { stderr += value; return true; } } as never,
  });

  expect(code).toBe(1);
  expect(stderr).toMatch(/port must be an integer|unknown option/i);
});
