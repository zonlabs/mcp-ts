import { beforeEach, describe, expect, it, vi } from "vitest";
import { cmdSearch } from "../src/commands/search.js";
import * as commandClient from "../src/gateway/command-client.js";

function fakeSearchClient(results: unknown[]) {
  return {
    listTools: async () => ({
      tools: [{ name: "search_mcp_tools", inputSchema: { type: "object" } }],
    }),
    callTool: vi.fn(async () => ({
      content: [{ type: "text", text: JSON.stringify(results) }],
    })),
    getServerId: () => "gateway",
    getServerName: () => "gateway",
  };
}

describe("cmdSearch single-gateway routing", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("treats an empty gateway search as authoritative", async () => {
    const client = fakeSearchClient([]);
    const withClient = vi.spyOn(commandClient, "withGatewayClient").mockImplementation(
      async (_options, action) => action(client as never),
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
    expect(client.callTool).toHaveBeenCalledOnce();
  });

  it("uses an explicit endpoint as the only gateway-client path", async () => {
    const client = fakeSearchClient([]);
    const withClient = vi.spyOn(commandClient, "withGatewayClient").mockImplementation(
      async (_options, action) => action(client as never),
    );

    await cmdSearch("github", 5, { endpoint: "https://example.test/custom" }, { write: () => true });

    expect(withClient).toHaveBeenCalledOnce();
    expect(withClient.mock.calls[0][0]).toMatchObject({ endpoint: "https://example.test/custom" });
  });
});
