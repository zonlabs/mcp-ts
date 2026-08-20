import { describe, it, expect, vi, beforeEach } from "vitest";
import { cmdList } from "../src/commands/list.js";
import * as context from "../src/gateway/context.js";

describe("cmdList", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("handles empty configuration", async () => {
    vi.spyOn(context, "withMcpGateway").mockImplementation(async (_opts, action) => {
      const mockGateway = {
        getLocalCatalog: () => ({ servers: [] }),
        getRemoteCatalog: () => ({ servers: [] }),
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
});
