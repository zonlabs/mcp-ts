import { describe, expect, it } from "vitest";
import {
  MCP_META_TOOL_NAMES,
  isSearchDiscoveryMode,
} from "../src/gateway/local-http-mcp.js";

describe("LocalHttpMcp", () => {
  it("uses the remote MCP discovery vocabulary", () => {
    expect(MCP_META_TOOL_NAMES).toEqual({
      listServers: "list_mcp_servers",
      searchTools: "search_mcp_tools",
      getToolSchema: "get_mcp_tool_schema",
      callTool: "call_mcp_tool",
    });
  });

  it("defaults to search discovery", () => {
    expect(isSearchDiscoveryMode()).toBe(true);
    expect(isSearchDiscoveryMode("search")).toBe(true);
    expect(isSearchDiscoveryMode("all")).toBe(false);
  });
});
