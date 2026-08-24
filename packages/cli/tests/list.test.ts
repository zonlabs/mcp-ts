import { setImmediate } from "node:timers/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cmdList, fetchGatewayCatalog, renderListOutput } from "../src/commands/list.js";
import * as commandClient from "../src/gateway/command-client.js";
import * as context from "../src/gateway/context.js";

interface FakeServer {
  server_id: string;
  server_name: string;
  tool_count: number;
  tools?: Array<{ tool_id: string; tool_name: string; description?: string }>;
  source?: "local" | "remote";
  discovery_state?: "complete" | "timeout" | "error";
  error?: string;
}

function fakeGatewayClient(servers: FakeServer[]) {
  return {
    callTool: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "list_mcp_servers") {
        return { content: [{ type: "text", text: JSON.stringify({
          servers: servers.map((server) => ({
            source: server.source ?? "remote",
            discovery_state: server.discovery_state ?? "complete",
            ...server,
          })),
        }) }] };
      }
      if (name !== "search_mcp_tools") throw new Error(`Unexpected tool: ${name}`);
      const server = servers.find((item) =>
        item.server_id === args.serverId,
      );
      const tools = (server?.tools ?? []).map((tool) => ({
        server_id: server?.server_id,
        server_name: server?.server_name,
        ...tool,
      }));
      return { content: [{ type: "text", text: JSON.stringify({ tools }) }] };
    }),
    close: vi.fn(async () => undefined),
  };
}

function captureOutput() {
  let rendered = "";
  return {
    output: { write: (text: string) => { rendered += text; return true; } },
    text: () => rendered.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, ""),
  };
}

describe("fetchGatewayCatalog", () => {
  it("uses one authoritative server request and advertised counts for compact output", async () => {
    const client = fakeGatewayClient([
      { server_id: "filesystem", server_name: "filesystem", tool_count: 14, source: "local" },
      { server_id: "github", server_name: "Github - Personal", tool_count: 44, source: "local" },
    ]);

    const catalog = await fetchGatewayCatalog(
      client as never,
      { filesystem: { command: "npx" }, "Github - Personal": { url: "https://example.test/mcp" } },
      {},
    );

    expect(client.callTool).toHaveBeenCalledOnce();
    expect(client.callTool).toHaveBeenCalledWith("list_mcp_servers", { query: "" });
    expect(catalog.localServers).toMatchObject([
      { serverId: "filesystem", advertisedToolCount: 14, tools: [] },
      { serverId: "github", advertisedToolCount: 44, tools: [] },
    ]);
    expect(catalog.remoteServers).toEqual([]);
  });

  it("retains and renders an enabled configured server that failed startup", async () => {
    const client = fakeGatewayClient([{
      server_id: "broken",
      server_name: "broken",
      source: "local",
      tool_count: 0,
      discovery_state: "error",
      error: "connection refused",
    }]);
    const configs = { broken: { command: "missing-command" } };

    const catalog = await fetchGatewayCatalog(client as never, configs, {});
    expect(catalog).toMatchObject({
      localServers: [{
        serverId: "broken",
        source: "local",
        advertisedToolCount: 0,
        discoveryState: "error",
        message: "connection refused",
      }],
      remoteServers: [],
    });

    const capture = captureOutput();
    renderListOutput(catalog.localServers, [], [], configs, {}, capture.output);
    expect(capture.text()).toContain("broken");
    expect(capture.text()).toContain("failed");
    expect(capture.text()).toContain("0 tool(s) [error: connection refused]");
  });

  it("fetches each advertised server's details once and concurrently", async () => {
    const releases = new Map<string, () => void>();
    const searches: string[] = [];
    const client = {
      callTool: vi.fn(async (name: string, args: Record<string, unknown>) => {
        if (name === "list_mcp_servers") {
          return { content: [{ type: "text", text: JSON.stringify({ servers: [
            { server_id: "alpha", server_name: "Alpha", tool_count: 1, source: "remote", discovery_state: "complete" },
            { server_id: "beta", server_name: "Beta", tool_count: 1, source: "remote", discovery_state: "complete" },
          ] }) }] };
        }
        const serverId = String(args.serverId);
        searches.push(serverId);
        await new Promise<void>((resolve) => releases.set(serverId, resolve));
        return { content: [{ type: "text", text: JSON.stringify({ tools: [{
          tool_id: `${serverId}::real_tool`,
          server_id: serverId,
          server_name: serverId === "alpha" ? "Alpha" : "Beta",
          tool_name: "real_tool",
          description: `${serverId} tool`,
        }] }) }] };
      }),
    };

    const pending = fetchGatewayCatalog(client as never, {}, { showTools: true });
    await vi.waitFor(() => expect(searches).toEqual(["alpha", "beta"]));
    releases.get("alpha")?.();
    releases.get("beta")?.();
    const catalog = await pending;

    expect(client.callTool).toHaveBeenCalledTimes(3);
    expect(client.callTool).toHaveBeenCalledWith("search_mcp_tools", {
      query: "",
      serverId: "alpha",
      limit: 1,
      detail: "detailed",
    });
    expect(client.callTool).toHaveBeenCalledWith("search_mcp_tools", {
      query: "",
      serverId: "beta",
      limit: 1,
      detail: "detailed",
    });
    expect(catalog.remoteServers.flatMap((server) => server.tools)).toEqual([
      { name: "real_tool", description: "alpha tool" },
      { name: "real_tool", description: "beta tool" },
    ]);
  });

  it("preserves successful servers and reports rejected detail requests without placeholders", async () => {
    const client = fakeGatewayClient([]);
    client.callTool.mockImplementation(async (name, args) => {
      if (name === "list_mcp_servers") {
        return { content: [{ type: "text", text: JSON.stringify({ servers: [
          { server_id: "alpha", server_name: "Alpha", tool_count: 2, source: "remote", discovery_state: "complete" },
          { server_id: "beta", server_name: "Beta", tool_count: 3, source: "remote", discovery_state: "complete" },
        ] }) }] };
      }
      if (args.serverId === "beta") throw new Error("Beta unavailable");
      return { content: [{ type: "text", text: JSON.stringify({ tools: [{
        tool_id: "alpha::one",
        server_id: "alpha",
        server_name: "Alpha",
        tool_name: "one",
        description: "First",
      }] }) }] };
    });

    const catalog = await fetchGatewayCatalog(client as never, {}, { showTools: true });

    expect(catalog.remoteServers).toMatchObject([
      {
        serverId: "alpha",
        tools: [{ name: "one", description: "First" }],
        discoveryState: "incomplete",
        message: "received 1 of 2 advertised tools",
      },
      {
        serverId: "beta",
        tools: [],
        discoveryState: "error",
        message: "Beta unavailable",
      },
    ]);
    expect(catalog.remoteServers.flatMap((server) => server.tools).some((tool) => /^tool_\d+$/.test(tool.name))).toBe(false);
  });

  it("uses the selected server only as the authoritative catalog query", async () => {
    const client = fakeGatewayClient([
      {
        server_id: "github",
        server_name: "GitHub",
        tool_count: 1,
        source: "local",
        tools: [{ tool_id: "github::create_issue", tool_name: "create_issue" }],
      },
    ]);

    await fetchGatewayCatalog(client as never, {}, { serverName: "GitHub" });

    expect(client.callTool).toHaveBeenNthCalledWith(1, "list_mcp_servers", { query: "GitHub" });
    expect(client.callTool).toHaveBeenNthCalledWith(2, "search_mcp_tools", {
      query: "",
      serverId: "github",
      limit: 1,
      detail: "detailed",
    });
    expect(client.callTool).toHaveBeenCalledTimes(2);
  });

  it("does not classify a disabled configured server as active local", async () => {
    const client = fakeGatewayClient([
      { server_id: "docs", server_name: "Documentation", tool_count: 2 },
    ]);

    const catalog = await fetchGatewayCatalog(
      client as never,
      { docs: { command: "npx", disabled: true } },
      {},
    );

    expect(catalog.localServers).toEqual([]);
    expect(catalog.remoteServers).toMatchObject([
      { serverId: "docs", serverName: "Documentation" },
    ]);
  });

  it.each([
    {
      label: "enabled canonical ID over disabled display name",
      configs: {
        "Docs Display": { command: "disabled-name", disabled: true },
        "docs-id": { url: "https://enabled-id.test/mcp" },
      },
      expectedTransport: "http",
    },
    {
      label: "enabled display name when canonical ID is disabled",
      configs: {
        "Docs Display": { command: "enabled-name" },
        "docs-id": { url: "https://disabled-id.test/mcp", disabled: true },
      },
      expectedTransport: "stdio",
    },
    {
      label: "canonical ID deterministically when both matches are enabled",
      configs: {
        "Docs Display": { command: "enabled-name" },
        "docs-id": { url: "https://enabled-id.test/mcp" },
      },
      expectedTransport: "http",
    },
  ])("classifies and renders with $label", async ({ configs, expectedTransport }) => {
    const client = fakeGatewayClient([
      { server_id: "docs-id", server_name: "Docs Display", tool_count: 2, source: "local" },
    ]);
    const catalog = await fetchGatewayCatalog(client as never, configs, {});

    expect(catalog.localServers).toMatchObject([
      { serverId: "docs-id", serverName: "Docs Display", source: "local" },
    ]);
    expect(catalog.remoteServers).toEqual([]);

    const capture = captureOutput();
    renderListOutput(
      catalog.localServers,
      catalog.remoteServers,
      Object.entries(configs).filter(([, config]) => config.disabled),
      configs,
      { serverName: "docs-id" },
      capture.output,
    );
    expect(capture.text()).toContain(`Transport: ${expectedTransport}`);
  });
});

describe("cmdList", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("starts or reuses one gateway and renders its combined catalog", async () => {
    vi.spyOn(context, "getServerConfig").mockReturnValue({ filesystem: { command: "npx" } });
    const client = fakeGatewayClient([
      { server_id: "filesystem", server_name: "filesystem", tool_count: 14, source: "local" },
      { server_id: "github", server_name: "Github - Personal", tool_count: 44 },
    ]);
    const withClient = vi.spyOn(commandClient, "withGatewayClient").mockImplementation(
      async (_options, action) => action(client as never),
    );
    const capture = captureOutput();

    await cmdList(undefined, capture.output, {});

    expect(withClient).toHaveBeenCalledOnce();
    expect(client.callTool).toHaveBeenCalledOnce();
    expect(capture.text()).toContain("filesystem");
    expect(capture.text()).toContain("14 tool(s)");
    expect(capture.text()).toContain("Github - Personal");
    expect(capture.text()).toContain("44 tool(s)");
  });

  it("treats an empty gateway catalog as authoritative while retaining disabled render-only entries", async () => {
    vi.spyOn(context, "getServerConfig").mockReturnValue({
      disabledServer: { command: "echo", disabled: true },
    });
    const client = fakeGatewayClient([]);
    vi.spyOn(commandClient, "withGatewayClient").mockImplementation(
      async (_options, action) => action(client as never),
    );
    const capture = captureOutput();

    await cmdList(undefined, capture.output);

    expect(client.callTool).toHaveBeenCalledOnce();
    expect(capture.text()).toContain("disabledServer");
    expect(capture.text()).toContain("disabled");
    expect(capture.text()).toContain("0 tool(s)");
  });

  it("renders detailed successes and per-server errors", async () => {
    vi.spyOn(context, "getServerConfig").mockReturnValue({});
    const client = fakeGatewayClient([]);
    client.callTool.mockImplementation(async (name, args) => {
      if (name === "list_mcp_servers") {
        return { content: [{ type: "text", text: JSON.stringify({ servers: [
          { server_id: "github", server_name: "GitHub", tool_count: 1, source: "remote", discovery_state: "complete" },
          { server_id: "slack", server_name: "Slack", tool_count: 1, source: "remote", discovery_state: "complete" },
        ] }) }] };
      }
      if (args.serverId === "slack") throw new Error("detail offline");
      return { content: [{ type: "text", text: JSON.stringify({ tools: [{
        tool_id: "github::create_issue",
        server_id: "github",
        server_name: "GitHub",
        tool_name: "create_issue",
        description: "Create an issue",
      }] }) }] };
    });
    vi.spyOn(commandClient, "withGatewayClient").mockImplementation(
      async (_options, action) => action(client as never),
    );
    const capture = captureOutput();

    await cmdList(undefined, capture.output, { showTools: true });

    expect(capture.text()).toContain("create_issue: Create an issue");
    expect(capture.text()).toContain("Slack - 1 tool(s) [error: detail offline]");
    expect(capture.text()).not.toContain("tool_1");
  });

  it("preserves selected active, disabled, and missing-server rendering", async () => {
    vi.spyOn(context, "getServerConfig").mockReturnValue({
      github: { command: "npx" },
      disabledServer: { command: "echo", disabled: true },
    });
    const activeClient = fakeGatewayClient([
      {
        server_id: "github",
        server_name: "GitHub",
        tool_count: 1,
        source: "local",
        tools: [{ tool_id: "github::create_issue", tool_name: "create_issue" }],
      },
    ]);
    const emptyClient = fakeGatewayClient([]);
    const failedClient = fakeGatewayClient([
      { server_id: "slack", server_name: "Slack", tool_count: 1 },
    ]);
    failedClient.callTool.mockImplementation(async (name) => {
      if (name === "list_mcp_servers") {
        return { content: [{ type: "text", text: JSON.stringify({ servers: [
          { server_id: "slack", server_name: "Slack", tool_count: 1, source: "remote", discovery_state: "complete" },
        ] }) }] };
      }
      throw new Error("detail unavailable");
    });
    vi.spyOn(commandClient, "withGatewayClient")
      .mockImplementationOnce(async (_options, action) => action(activeClient as never))
      .mockImplementationOnce(async (_options, action) => action(failedClient as never))
      .mockImplementation(async (_options, action) => action(emptyClient as never));

    const selected = captureOutput();
    await cmdList(undefined, selected.output, { serverName: "github" });
    expect(selected.text()).toContain("GitHub");
    expect(selected.text()).toContain("create_issue");

    const failed = captureOutput();
    await cmdList(undefined, failed.output, { serverName: "slack" });
    expect(failed.text()).toContain("[error: detail unavailable]");
    expect(failed.text()).toContain("Tool details unavailable");
    expect(failed.text()).not.toContain("No tools registered");

    const disabled = captureOutput();
    await cmdList(undefined, disabled.output, { serverName: "disabledServer" });
    expect(disabled.text()).toContain("disabledServer");
    expect(disabled.text()).toContain("disabled");

    const missing = captureOutput();
    await cmdList(undefined, missing.output, { serverName: "nonexistent" });
    expect(missing.text()).toContain('No server matching "nonexistent" was found.');
  });

  it("propagates catalog failure, closes the client, and schedules no fallback rejection", async () => {
    vi.spyOn(context, "getServerConfig").mockReturnValue({ filesystem: { command: "npx" } });
    const client = {
      callTool: vi.fn(async () => { throw new Error("catalog offline"); }),
      close: vi.fn(async () => undefined),
    };
    const withClient = vi.spyOn(commandClient, "withGatewayClient").mockImplementation(
      async (_options, action) => {
        try {
          return await action(client as never);
        } finally {
          await client.close();
        }
      },
    );
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    try {
      await expect(cmdList(undefined, captureOutput().output, {})).rejects.toThrow("catalog offline");
      await setImmediate();
      expect(withClient).toHaveBeenCalledOnce();
      expect(client.callTool).toHaveBeenCalledOnce();
      expect(client.close).toHaveBeenCalledOnce();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});
