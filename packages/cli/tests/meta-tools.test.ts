import { describe, expect, it, vi } from "vitest";
import {
  callGatewayTool,
  fetchGatewayServers,
  fetchGatewayToolSchemas,
  resolveGatewayToolId,
  searchGatewayTools,
} from "../src/gateway/meta-tools.js";

type MetaFixtures = {
  servers?: unknown[];
  search?: unknown[];
  schemas?: unknown[];
  callResult?: unknown;
};

function textResult(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function fakeMetaClient(fixtures: MetaFixtures = {}) {
  return {
    callTool: vi.fn(async (name: string) => {
      switch (name) {
        case "list_mcp_servers":
          return textResult({ servers: fixtures.servers ?? [] });
        case "search_mcp_tools":
          return textResult({ tools: fixtures.search ?? [] });
        case "get_mcp_tool_schemas":
          return textResult({ tools: fixtures.schemas ?? [] });
        case "call_mcp_tool":
          return fixtures.callResult ?? { content: [] };
        default:
          throw new Error(`Unexpected meta tool: ${name}`);
      }
    }),
  };
}

describe("gateway meta tools", () => {
  it("fetches the gateway server catalog with one list_mcp_servers call", async () => {
    const client = fakeMetaClient({ servers: [
      { server_id: "github", server_name: "GitHub", tool_count: 4 },
    ] });

    await expect(fetchGatewayServers(client as never, "git")).resolves.toEqual([
      { serverId: "github", serverName: "GitHub", toolCount: 4 },
    ]);
    expect(client.callTool).toHaveBeenCalledWith("list_mcp_servers", { query: "git" });
    expect(client.callTool).toHaveBeenCalledTimes(1);
  });

  it("propagates list_mcp_servers failure without searching tools", async () => {
    const client = { callTool: vi.fn().mockRejectedValue(new Error("catalog offline")) };
    await expect(fetchGatewayServers(client as never, "")).rejects.toThrow("catalog offline");
    expect(client.callTool).toHaveBeenCalledTimes(1);
  });

  it("rejects gateway error, missing text, and invalid JSON results", async () => {
    const errorClient = { callTool: vi.fn().mockResolvedValue({
      isError: true,
      content: [{ type: "text", text: "catalog offline" }],
    }) } as never;
    const missingTextClient = { callTool: vi.fn().mockResolvedValue({ content: [] }) } as never;
    const invalidJsonClient = { callTool: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "not json" }],
    }) } as never;

    await expect(fetchGatewayServers(errorClient, "")).rejects.toThrow("catalog offline");
    await expect(fetchGatewayServers(missingTextClient, "")).rejects.toThrow("text content");
    await expect(fetchGatewayServers(invalidJsonClient, "")).rejects.toThrow("valid JSON");
  });

  it("searches gateway tools with the supplied search arguments once", async () => {
    const client = fakeMetaClient({ search: [
      {
        tool_id: "github::create_issue",
        server_id: "github",
        server_name: "GitHub",
        tool_name: "create_issue",
        description: "Create an issue",
      },
    ] });

    await expect(searchGatewayTools(client as never, { query: "issue", limit: 5 })).resolves.toEqual([
      {
        toolId: "github::create_issue",
        serverId: "github",
        serverName: "GitHub",
        toolName: "create_issue",
        description: "Create an issue",
      },
    ]);
    expect(client.callTool).toHaveBeenCalledWith("search_mcp_tools", { query: "issue", limit: 5 });
    expect(client.callTool).toHaveBeenCalledTimes(1);
  });

  it("fetches canonical schemas in one batch request", async () => {
    const client = fakeMetaClient({ schemas: [{ toolId: "github::create_issue" }] });

    await expect(fetchGatewayToolSchemas(client as never, ["github::create_issue"])).resolves.toEqual([
      { toolId: "github::create_issue" },
    ]);
    expect(client.callTool).toHaveBeenCalledWith("get_mcp_tool_schemas", {
      toolIds: ["github::create_issue"],
    });
    expect(client.callTool).toHaveBeenCalledTimes(1);
  });

  it("rejects non-canonical schema IDs before calling the gateway", async () => {
    const client = fakeMetaClient();

    await expect(fetchGatewayToolSchemas(client as never, ["create_issue"])).rejects.toThrow("canonical server::tool ID");
    expect(client.callTool).not.toHaveBeenCalled();
  });

  it("returns an already canonical tool ID without searching", async () => {
    const client = fakeMetaClient();

    await expect(resolveGatewayToolId(client as never, "github::create_issue")).resolves.toBe("github::create_issue");
    expect(client.callTool).not.toHaveBeenCalled();
  });

  it("resolves one case-insensitive exact tool name with one search", async () => {
    const client = fakeMetaClient({ search: [
      { tool_id: "github::create_issue", server_id: "github", server_name: "GitHub", tool_name: "create_issue" },
      { tool_id: "github::list_issues", server_id: "github", server_name: "GitHub", tool_name: "list_issues" },
    ] });

    await expect(resolveGatewayToolId(client as never, "CREATE_ISSUE")).resolves.toBe("github::create_issue");
    expect(client.callTool).toHaveBeenCalledWith("search_mcp_tools", { query: "CREATE_ISSUE" });
    expect(client.callTool).toHaveBeenCalledTimes(1);
  });

  it("requires a canonical ID when exact names are ambiguous", async () => {
    const client = fakeMetaClient({ search: [
      { tool_id: "github::create_issue", server_id: "github", server_name: "GitHub", tool_name: "create_issue" },
      { tool_id: "gitlab::create_issue", server_id: "gitlab", server_name: "GitLab", tool_name: "create_issue" },
    ] });
    await expect(resolveGatewayToolId(client as never, "create_issue")).rejects.toThrow("canonical server::tool ID");
    expect(client.callTool).toHaveBeenCalledTimes(1);
  });

  it("requires a canonical ID when an unqualified name is absent", async () => {
    const client = fakeMetaClient();

    await expect(resolveGatewayToolId(client as never, "create_issue")).rejects.toThrow("canonical server::tool ID");
    expect(client.callTool).toHaveBeenCalledTimes(1);
  });

  it("executes a canonical tool exactly once", async () => {
    const client = fakeMetaClient({ callResult: { content: [] } });
    await callGatewayTool(client as never, "github::create_issue", { title: "x" });
    expect(client.callTool).toHaveBeenCalledWith("call_mcp_tool", {
      toolId: "github::create_issue",
      args: { title: "x" },
    });
    expect(client.callTool).toHaveBeenCalledTimes(1);
  });

  it("rejects an unqualified call before calling the gateway", async () => {
    const client = fakeMetaClient();

    await expect(callGatewayTool(client as never, "create_issue", {})).rejects.toThrow("canonical server::tool ID");
    expect(client.callTool).not.toHaveBeenCalled();
  });
});
