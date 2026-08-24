import { beforeEach, describe, expect, it, vi } from "vitest";
import { cmdList, fetchCatalogThroughClient } from "../src/commands/list.js";
import * as commandClient from "../src/gateway/command-client.js";
import * as context from "../src/gateway/context.js";

interface FakeServer {
  server_id: string;
  server_name: string;
  tool_count: number;
  tools?: Array<{ tool_name: string; description?: string }>;
}

function fakeCatalogClient(servers: FakeServer[]) {
  return {
    callTool: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "list_mcp_servers") {
        return { content: [{ type: "text", text: JSON.stringify({ servers }) }] };
      }
      const server = servers.find((item) =>
        item.server_id === args.server_id || item.server_name === args.server_name,
      );
      const tools = (server?.tools ?? []).map((tool) => ({
        server_id: server?.server_id,
        server_name: server?.server_name,
        ...tool,
      }));
      return { content: [{ type: "text", text: JSON.stringify(tools) }] };
    }),
  };
}

describe("cmdList", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("handles an empty gateway catalog", async () => {
    vi.spyOn(context, "getServerConfig").mockReturnValue({});
    const withClient = vi.spyOn(commandClient, "withGatewayClient").mockImplementation(
      async (_options, action) => action(fakeCatalogClient([]) as never),
    );
    let output = "";

    await cmdList(undefined, { write: (text) => { output += text; return true; } });

    expect(output).toContain("No servers configured in mcp.json or connected remotely.");
    expect(withClient).toHaveBeenCalledOnce();
  });

  it("prints the combined compact catalog without fetching tool details", async () => {
    vi.spyOn(context, "getServerConfig").mockReturnValue({
      github: { command: "npx" },
      disabledServer: { command: "echo", disabled: true },
    });
    const client = fakeCatalogClient([
      { server_id: "github", server_name: "github", tool_count: 1 },
      { server_id: "slack", server_name: "slack", tool_count: 1 },
    ]);
    vi.spyOn(commandClient, "withGatewayClient").mockImplementation(
      async (_options, action) => action(client as never),
    );
    let output = "";

    await cmdList(undefined, { write: (text) => { output += text; return true; } });

    expect(output).toContain("Configured MCP Servers (3):");
    expect(output).toContain("github");
    expect(output).toContain("slack");
    expect(output).toContain("disabledServer");
    expect(client.callTool).toHaveBeenCalledOnce();
  });

  it("expands tools through the same gateway client", async () => {
    vi.spyOn(context, "getServerConfig").mockReturnValue({ github: { command: "npx" } });
    const client = fakeCatalogClient([
      {
        server_id: "github",
        server_name: "github",
        tool_count: 1,
        tools: [{ tool_name: "create_issue", description: "Create a GitHub issue" }],
      },
      {
        server_id: "slack",
        server_name: "slack",
        tool_count: 1,
        tools: [{ tool_name: "post_message", description: "Post a Slack message" }],
      },
    ]);
    vi.spyOn(commandClient, "withGatewayClient").mockImplementation(
      async (_options, action) => action(client as never),
    );
    let output = "";

    await cmdList(undefined, { write: (text) => { output += text; return true; } }, { showTools: true });

    expect(output).toContain("create_issue:");
    expect(output).toContain("Create a GitHub issue");
    expect(output).toContain("post_message:");
    expect(output).toContain("Post a Slack message");
  });

  it("renders selected and disabled servers using the gateway catalog", async () => {
    vi.spyOn(context, "getServerConfig").mockReturnValue({
      github: { command: "npx" },
      disabledServer: { command: "echo", disabled: true },
    });
    const client = fakeCatalogClient([
      {
        server_id: "github",
        server_name: "github",
        tool_count: 1,
        tools: [{ tool_name: "create_issue" }],
      },
      {
        server_id: "slack",
        server_name: "slack",
        tool_count: 1,
        tools: [{ tool_name: "post_message" }],
      },
    ]);
    vi.spyOn(commandClient, "withGatewayClient").mockImplementation(
      async (_options, action) => action(client as never),
    );
    const write = (buffer: { value: string }) => (text: string) => {
      buffer.value += text;
      return true;
    };

    const local = { value: "" };
    await cmdList(undefined, { write: write(local) }, { serverName: "github" });
    expect(local.value).toContain("create_issue");
    expect(local.value).not.toContain("slack");

    const disabled = { value: "" };
    await cmdList(undefined, { write: write(disabled) }, { serverName: "disabledServer" });
    expect(disabled.value).toContain("disabledServer");
    expect(disabled.value).toContain("disabled");

    const missing = { value: "" };
    await cmdList(undefined, { write: write(missing) }, { serverName: "nonexistent" });
    expect(missing.value).toContain('No server matching "nonexistent" was found.');
  });

  it("fetches detailed tools per advertised server without placeholders or a global limit", async () => {
    const callTool = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "list_mcp_servers") {
        return { content: [{ type: "text", text: JSON.stringify({ servers: [
          { server_id: "alpha", server_name: "Alpha", tool_count: 120 },
          { server_id: "beta", server_name: "Beta", tool_count: 2 },
        ] }) }] };
      }
      const count = args.server_id === "alpha" ? 120 : 2;
      return { content: [{ type: "text", text: JSON.stringify(Array.from({ length: count }, (_, index) => ({
        server_id: args.server_id,
        server_name: args.server_name,
        tool_name: `${String(args.server_id)}_tool_${index + 1}`,
      }))) }] };
    });

    const catalog = await fetchCatalogThroughClient({ callTool } as never, {}, { showTools: true });

    expect(callTool).toHaveBeenCalledWith("search_mcp_tools", expect.objectContaining({ server_id: "alpha", limit: 120 }));
    expect(callTool).toHaveBeenCalledWith("search_mcp_tools", expect.objectContaining({ server_id: "beta", limit: 2 }));
    expect(catalog.remoteServers[0].tools).toHaveLength(120);
    expect(catalog.remoteServers.flatMap((server) => server.tools).some((tool) => /^tool_\d+$/.test(tool.name))).toBe(false);
  });
});
