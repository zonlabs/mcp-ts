import { beforeEach, describe, expect, it, vi } from "vitest";
import { cmdCall } from "../src/commands/call.js";
import * as commandClient from "../src/gateway/command-client.js";

function textResult(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

describe("cmdCall single-gateway routing", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("does not retry a failed mutating call", async () => {
    const callTool = vi.fn().mockRejectedValue(new Error("downstream rejected"));
    vi.spyOn(commandClient, "withGatewayClient").mockImplementation(
      async (_options, action) => action({ callTool } as never),
    );

    await expect(
      cmdCall("github::create_issue", "{}", undefined, { write: () => true }),
    ).rejects.toThrow("downstream rejected");
    expect(callTool).toHaveBeenCalledWith("call_mcp_tool", {
      toolId: "github::create_issue",
      args: {},
    });
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it("resolves an unqualified reference once and executes it once", async () => {
    const callTool = vi.fn()
      .mockResolvedValueOnce(textResult({ tools: [{
        toolId: "github::create_issue",
        serverId: "github",
        serverName: "GitHub",
        toolName: "create_issue",
        description: "Create an issue",
      }] }))
      .mockResolvedValueOnce({ content: [{ type: "text", text: "created" }] });
    vi.spyOn(commandClient, "withGatewayClient").mockImplementation(
      async (_options, action) => action({ callTool } as never),
    );

    await cmdCall("create_issue", '{"title":"Bug"}', undefined, { write: () => true });

    expect(callTool).toHaveBeenNthCalledWith(1, "search_mcp_tools", { query: "create_issue" });
    expect(callTool).toHaveBeenNthCalledWith(2, "call_mcp_tool", {
      toolId: "github::create_issue",
      args: { title: "Bug" },
    });
    expect(callTool).toHaveBeenCalledTimes(2);
  });

  it("parses arguments before opening the gateway connection", async () => {
    const withClient = vi.spyOn(commandClient, "withGatewayClient");

    await expect(
      cmdCall("github::create_issue", "{invalid", undefined, { write: () => true }),
    ).rejects.toThrow("Invalid JSON argument payload");
    expect(withClient).not.toHaveBeenCalled();
  });
});
