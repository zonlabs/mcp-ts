import { describe, expect, it } from "vitest";
import { extractReturnedError } from "../../src/core/mcp-tool-output";

describe("extractReturnedError", () => {
  it("extracts errors from MCP isError results", () => {
    expect(
      extractReturnedError({
        content: [{ type: "text", text: "Error: bad" }],
        isError: true,
      })
    ).toBe("bad");
  });

  it("returns undefined when isError is not set", () => {
    expect(
      extractReturnedError({
        content: [{ type: "text", text: '{"success":false}' }],
      })
    ).toBeUndefined();
  });
});
