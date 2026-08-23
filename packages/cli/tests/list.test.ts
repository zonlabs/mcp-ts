import { describe, it, expect, vi, beforeEach } from "vitest";
import { cmdList, fetchCatalogThroughClient } from "../src/commands/list.js";
import * as context from "../src/gateway/context.js";
import * as resolution from "../src/gateway/command-resolution.js";

describe("cmdList", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(context, "pingGateway").mockResolvedValue(null);
    vi.spyOn(resolution, "resolveGateway").mockResolvedValue({
      endpoint: null,
      port: 8765,
      state: "stopped",
      managed: false,
    });
    vi.spyOn(resolution, "createAuthenticatedRemoteClient").mockResolvedValue(null);
  });

  it("handles empty configuration", async () => {
    vi.spyOn(context, "withMcpGateway").mockImplementation(async (_opts, action) => {
      const mockGateway = {
        getLocalCatalog: () => ({ servers: [] }),
        getRemoteCatalog: () => ({ servers: [] }),
        getLocalServerStartupErrors: () => new Map(),
      };
      return action(mockGateway as never);
    });
    vi.spyOn(context, "getServerConfig").mockReturnValue({});

    let output = "";
    const mockOutput = {
      write: (text: string) => {
        output += text;
        return true;
      },
    };

    await cmdList(undefined, mockOutput, { enableBridge: false });
    expect(output).toContain("No servers configured in mcp.json or connected remotely.");
  });

  it("prints compact summary by default without listing individual tools", async () => {
    vi.spyOn(context, "withMcpGateway").mockImplementation(async (_opts, action) => {
      const mockGateway = {
        getLocalCatalog: () => ({
          servers: [
            {
              serverId: "github",
              serverName: "github",
              tools: [{ name: "create_issue", description: "Create an issue" }],
            },
          ],
        }),
        getRemoteCatalog: () => ({
          servers: [
            {
              serverId: "slack",
              serverName: "slack",
              tools: [{ name: "post_message", description: "Post message" }],
            },
          ],
        }),
        getLocalServerStartupErrors: () => new Map(),
      };
      return action(mockGateway as never);
    });
    vi.spyOn(context, "getServerConfig").mockReturnValue({
      github: { command: "npx" },
      disabledServer: { command: "echo", disabled: true },
    });

    let output = "";
    const mockOutput = {
      write: (text: string) => {
        output += text;
        return true;
      },
    };

    await cmdList(undefined, mockOutput, { enableBridge: false });

    expect(output).toContain("Configured MCP Servers (3):");
    expect(output).toContain("github");
    expect(output).toContain("slack");
    expect(output).toContain("disabledServer");
    expect(output).toContain("● active");
    expect(output).toContain("○ disabled");
    expect(output).not.toContain("Create an issue"); // Tools should not be expanded by default
    expect(output).toContain('Tip: Run "mcpa list <server>" or "mcpa list --tools"');
  });

  it("expands all tools when showTools: true is passed", async () => {
    vi.spyOn(context, "withMcpGateway").mockImplementation(async (_opts, action) => {
      const mockGateway = {
        getLocalCatalog: () => ({
          servers: [
            {
              serverId: "github",
              serverName: "github",
              tools: [{ name: "create_issue", description: "Create a GitHub issue" }],
            },
          ],
        }),
        getRemoteCatalog: () => ({
          servers: [
            {
              serverId: "slack",
              serverName: "slack",
              tools: [{ name: "post_message", description: "Post a Slack message" }],
            },
          ],
        }),
        getLocalServerStartupErrors: () => new Map(),
      };
      return action(mockGateway as never);
    });
    vi.spyOn(context, "getServerConfig").mockReturnValue({
      github: { command: "npx" },
    });

    let output = "";
    const mockOutput = {
      write: (text: string) => {
        output += text;
        return true;
      },
    };

    await cmdList(undefined, mockOutput, { showTools: true, enableBridge: false });
    expect(output).toContain("Configured MCP Servers (2):");
    expect(output).toContain("create_issue:");
    expect(output).toContain("Create a GitHub issue");
    expect(output).toContain("post_message:");
    expect(output).toContain("Post a Slack message");
  });

  it("filters to single server when serverName is provided", async () => {
    vi.spyOn(context, "withMcpGateway").mockImplementation(async (_opts, action) => {
      const mockGateway = {
        getLocalCatalog: () => ({
          servers: [
            {
              serverId: "github",
              serverName: "github",
              tools: [{ name: "create_issue", description: "Create an issue" }],
            },
          ],
        }),
        getRemoteCatalog: () => ({
          servers: [
            {
              serverId: "slack",
              serverName: "slack",
              tools: [{ name: "post_message", description: "Post message" }],
            },
          ],
        }),
        getLocalServerStartupErrors: () => new Map(),
      };
      return action(mockGateway as never);
    });
    vi.spyOn(context, "getServerConfig").mockReturnValue({
      github: { command: "npx" },
      disabledServer: { command: "echo", disabled: true },
    });

    let output = "";
    const mockOutput = {
      write: (text: string) => {
        output += text;
        return true;
      },
    };

    // Filter for local server
    await cmdList(undefined, mockOutput, { serverName: "github", enableBridge: false });
    expect(output).toContain("github");
    expect(output).toContain("create_issue");
    expect(output).not.toContain("slack");

    // Filter for remote server
    output = "";
    await cmdList(undefined, mockOutput, { serverName: "slack", enableBridge: false });
    expect(output).toContain("slack");
    expect(output).toContain("post_message");
    expect(output).not.toContain("github");

    // Filter for disabled server
    output = "";
    await cmdList(undefined, mockOutput, { serverName: "disabledServer", enableBridge: false });
    expect(output).toContain("disabledServer");
    expect(output).toContain("○ disabled");

    // Filter for non-existent server
    output = "";
    await cmdList(undefined, mockOutput, { serverName: "nonexistent", enableBridge: false });
    expect(output).toContain('No server matching "nonexistent" was found.');
    expect(output).toContain("Available servers: github, slack, disabledServer");
  });

  it("queries running gateway daemon directly when pingGateway returns active endpoint", async () => {
    vi.spyOn(resolution, "resolveGateway").mockResolvedValue({
      endpoint: "http://127.0.0.1:8765/mcp",
      port: 8765,
      state: "external",
      managed: false,
    });
    vi.spyOn(context, "getServerConfig").mockReturnValue({
      localGithub: { command: "npx" },
      disabledLocal: { command: "echo", disabled: true },
    });

    const mockClient = {
      callTool: vi.fn(async (toolName: string) => {
        if (toolName === "list_mcp_servers") {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  servers: [
                    { server_id: "localGithub", server_name: "localGithub", tool_count: 2 },
                    { server_id: "remoteSlack", server_name: "remoteSlack", tool_count: 3 },
                  ],
                }),
              },
            ],
          };
        }
        return { content: [{ type: "text", text: "[]" }] };
      }),
      close: vi.fn(async () => {}),
    };

    const clientModule = await import("../src/client.js");
    vi.spyOn(clientModule, "connectRemote").mockResolvedValue(mockClient as never);

    let output = "";
    const mockOutput = {
      write: (text: string) => {
        output += text;
        return true;
      },
    };

    await cmdList(undefined, mockOutput);

    expect(output).toContain("Configured MCP Servers (3):");
    expect(output).toContain("Local Servers (mcp.json):");
    expect(output).toContain("localGithub");
    expect(output).toContain("disabledLocal");
    expect(output).toContain("Remote Servers (MCP Assistant):");
    expect(output).toContain("remoteSlack");
    expect(mockClient.callTool).toHaveBeenCalledWith("list_mcp_servers", { query: "" });
    expect(mockClient.close).toHaveBeenCalled();
  });

  it("fetches detailed tools per advertised server without placeholders or a global 100 limit", async () => {
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
