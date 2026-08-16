import { describe, expect, it } from "vitest";
import { MCP_META_TOOL_NAMES } from "../src/gateway/local-http-mcp.js";

describe("LocalHttpMcp", () => {
  it("uses the remote MCP discovery vocabulary", () => {
    expect(MCP_META_TOOL_NAMES).toEqual({
      listServers: "list_mcp_servers",
      searchTools: "search_mcp_tools",
      getToolSchema: "get_mcp_tool_schema",
      callTool: "call_mcp_tool",
    });
  });
});
