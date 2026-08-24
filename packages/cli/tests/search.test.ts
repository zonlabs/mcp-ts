import { beforeEach, describe, expect, it, vi } from "vitest";
import { cmdSearch } from "../src/commands/search.js";
import * as commandClient from "../src/gateway/command-client.js";

function textResult(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

describe("cmdSearch single-gateway routing", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns an empty gateway search without another path", async () => {
    const callTool = vi.fn(async () => textResult({ tools: [] }));
    const withClient = vi.spyOn(commandClient, "withGatewayClient").mockImplementation(
      async (_options, action) => action({ callTool } as never),
    );
    let output = "";

    await cmdSearch("definitely-missing", 5, undefined, {
      write: (text) => {
        output += text;
        return true;
      },
    });

    expect(output).toContain("No matching tools found.");
    expect(withClient).toHaveBeenCalledOnce();
    expect(callTool).toHaveBeenCalledWith("search_mcp_tools", {
      query: "definitely-missing",
      limit: 5,
    });
    expect(callTool).toHaveBeenCalledOnce();
  });

  it("uses an explicit endpoint as the only gateway-client path", async () => {
    const callTool = vi.fn(async () => textResult({ tools: [] }));
    const withClient = vi.spyOn(commandClient, "withGatewayClient").mockImplementation(
      async (_options, action) => action({ callTool } as never),
    );

    await cmdSearch("github", 5, { endpoint: "https://example.test/custom" }, { write: () => true });

    expect(withClient).toHaveBeenCalledOnce();
    expect(withClient.mock.calls[0][0]).toMatchObject({ endpoint: "https://example.test/custom" });
    expect(callTool).toHaveBeenCalledOnce();
  });
});
