import { beforeEach, describe, expect, it, vi } from "vitest";
import { cmdCall } from "../src/commands/call.js";
import { cmdLocalSchema } from "../src/commands/schema.js";
import * as commandClient from "../src/gateway/command-client.js";

describe("gateway command consumers", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("fetches schemas through one gateway client scope", async () => {
    const callTool = vi.fn(async () => ({
      content: [{ type: "text", text: JSON.stringify({ tools: [{ toolId: "github::create_issue" }] }) }],
    }));
    const withClient = vi.spyOn(commandClient, "withGatewayClient").mockImplementation(
      async (_options, action) => action({ callTool } as never),
    );
    let output = "";

    await cmdLocalSchema(["github::create_issue"], undefined, {
      write: (text) => { output += text; return true; },
    });

    expect(withClient).toHaveBeenCalledOnce();
    expect(callTool).toHaveBeenCalledOnce();
    expect(output).toContain("github::create_issue");
  });

  it("calls a gateway meta-tool once through one gateway client scope", async () => {
    const callTool = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const withClient = vi.spyOn(commandClient, "withGatewayClient").mockImplementation(
      async (_options, action) => action({ callTool } as never),
    );

    await cmdCall("search_mcp_tools", '{"query":"github"}', undefined, { write: () => true });

    expect(withClient).toHaveBeenCalledOnce();
    expect(callTool).toHaveBeenCalledOnce();
    expect(callTool).toHaveBeenCalledWith("search_mcp_tools", { query: "github" });
  });
});
