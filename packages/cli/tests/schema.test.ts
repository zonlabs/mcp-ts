import { beforeEach, describe, expect, it, vi } from "vitest";
import { cmdLocalSchema } from "../src/commands/schema.js";
import * as commandClient from "../src/gateway/command-client.js";

function textResult(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

describe("cmdLocalSchema single-gateway routing", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("fetches a canonical schema in one batch request", async () => {
    const callTool = vi.fn(async () => textResult({ tools: [{ toolId: "github::create_issue" }] }));
    vi.spyOn(commandClient, "withGatewayClient").mockImplementation(
      async (_options, action) => action({ callTool } as never),
    );
    let rendered = "";

    await cmdLocalSchema(["github::create_issue"], undefined, {
      write: (text) => {
        rendered += text;
        return true;
      },
    });

    expect(rendered).toContain("github::create_issue");
    expect(callTool).toHaveBeenCalledWith("get_mcp_tool_schemas", {
      toolIds: ["github::create_issue"],
    });
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it("resolves each unqualified reference once before one batch schema request", async () => {
    const callTool = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "search_mcp_tools") {
        return textResult({ tools: [{
          toolId: "gitlab::create_issue",
          serverId: "gitlab",
          serverName: "GitLab",
          toolName: String(args.query),
          description: "Create an issue",
        }] });
      }
      return textResult({ tools: [
        { toolId: "github::list_issues" },
        { toolId: "gitlab::create_issue" },
      ] });
    });
    vi.spyOn(commandClient, "withGatewayClient").mockImplementation(
      async (_options, action) => action({ callTool } as never),
    );

    await cmdLocalSchema(["github::list_issues", "create_issue"], undefined, { write: () => true });

    expect(callTool).toHaveBeenNthCalledWith(1, "search_mcp_tools", { query: "create_issue" });
    expect(callTool).toHaveBeenNthCalledWith(2, "get_mcp_tool_schemas", {
      toolIds: ["github::list_issues", "gitlab::create_issue"],
    });
    expect(callTool).toHaveBeenCalledTimes(2);
  });

  it("propagates exact-resolution errors without fetching schemas", async () => {
    const callTool = vi.fn(async () => textResult({ tools: [
      { toolId: "github::create_issue", serverId: "github", serverName: "GitHub", toolName: "create_issue" },
      { toolId: "gitlab::create_issue", serverId: "gitlab", serverName: "GitLab", toolName: "create_issue" },
    ] }));
    vi.spyOn(commandClient, "withGatewayClient").mockImplementation(
      async (_options, action) => action({ callTool } as never),
    );

    await expect(
      cmdLocalSchema(["create_issue"], undefined, { write: () => true }),
    ).rejects.toThrow("canonical server::tool ID");
    expect(callTool).toHaveBeenCalledTimes(1);
  });
});
