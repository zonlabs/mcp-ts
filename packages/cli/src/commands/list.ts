import type { Writable } from "node:stream";
import pc from "picocolors";
import type { McpEndpointClient } from "../client.js";
import { withGatewayClient } from "../gateway/command-client.js";
import { getServerConfig } from "../gateway/context.js";
import { fetchGatewayServers, searchGatewayTools } from "../gateway/meta-tools.js";
import { writeLine } from "../ux.js";
import type { McpServerConfig } from "../gateway/types.js";

export interface ListOptions {
  showTools?: boolean;
  serverName?: string;
}

export interface ToolEntry {
  name: string;
  description?: string;
}

export interface ServerEntry {
  serverId: string;
  serverName: string;
  tools: ToolEntry[];
  source?: "local" | "remote";
  advertisedToolCount?: number;
  discoveryState?: "complete" | "incomplete" | "timeout" | "error";
  message?: string;
}

function displayedToolCount(server: ServerEntry): number {
  return server.advertisedToolCount ?? server.tools.length;
}

function discoveryDiagnostic(server: ServerEntry): string {
  if (!server.discoveryState || server.discoveryState === "complete") return "";
  return ` ${pc.yellow(`[${server.discoveryState}${server.message ? `: ${server.message}` : ""}]`)}`;
}

function emptyToolDetailMessage(server: ServerEntry): string {
  return server.discoveryState && server.discoveryState !== "complete"
    ? "  (Tool details unavailable)"
    : "  (No tools registered for this server)";
}

function statusLabel(server: ServerEntry): string {
  if (server.discoveryState === "timeout") return pc.yellow("● timed out");
  if (server.discoveryState === "error") return pc.red("● failed");
  return pc.green("● active");
}

function getTransportType(cfg?: McpServerConfig): string {
  if (!cfg) return "stdio";
  if ("url" in cfg && typeof cfg.url === "string") {
    return "http";
  }
  if ("command" in cfg && typeof cfg.command === "string") {
    return "stdio";
  }
  return "stdio";
}

function getEnabledServerConfig(
  server: Pick<ServerEntry, "serverId" | "serverName">,
  allConfigs: Record<string, McpServerConfig>,
): McpServerConfig | undefined {
  const idConfig = allConfigs[server.serverId];
  if (idConfig && !idConfig.disabled) return idConfig;
  const nameConfig = allConfigs[server.serverName];
  if (nameConfig && !nameConfig.disabled) return nameConfig;
  return undefined;
}

export function renderListOutput(
  localServers: ServerEntry[],
  remoteServers: ServerEntry[],
  disabledServers: Array<[string, McpServerConfig]>,
  allConfigs: Record<string, McpServerConfig>,
  options: ListOptions,
  output: Pick<Writable, "write">,
): void {
  const { showTools = false, serverName } = options;
  const totalServers = localServers.length + remoteServers.length + disabledServers.length;

  if (totalServers === 0) {
    writeLine(output, "No servers configured in mcp.json or connected remotely.");
    return;
  }

  // 1. If a specific server is requested: mcpa list <server>
  if (serverName) {
    const query = serverName.toLowerCase();
    const matchedLocal = localServers.find(
      (s) => s.serverName.toLowerCase() === query || s.serverId.toLowerCase() === query,
    );
    const matchedRemote = remoteServers.find(
      (s) => s.serverName.toLowerCase() === query || s.serverId.toLowerCase() === query,
    );
    const matchedDisabled = disabledServers.find(
      ([name]) => name.toLowerCase() === query,
    );

    if (!matchedLocal && !matchedRemote && !matchedDisabled) {
      writeLine(output, pc.yellow(`No server matching "${serverName}" was found.`));
      writeLine(output);
      const available = [
        ...localServers.map((s) => s.serverName),
        ...remoteServers.map((s) => s.serverName),
        ...disabledServers.map(([name]) => name),
      ];
      if (available.length > 0) {
        writeLine(output, pc.dim(`Available servers: ${available.join(", ")}`));
      }
      return;
    }

    if (matchedLocal) {
      const cfg = getEnabledServerConfig(matchedLocal, allConfigs);
      const transport = getTransportType(cfg);
      writeLine(output, `${pc.cyan("•")} ${pc.bold(matchedLocal.serverName)} ${pc.dim(`(Local - mcp.json)`)}`);
      writeLine(output, `  ${pc.dim("Transport:")} ${transport}`);
      writeLine(output, `  ${pc.dim("Status:")}    ${statusLabel(matchedLocal)}`);
      writeLine(output, `  ${pc.dim("Tools:")}     ${displayedToolCount(matchedLocal)}${discoveryDiagnostic(matchedLocal)}`);
      writeLine(output);
      if (matchedLocal.tools.length > 0) {
        writeLine(output, pc.bold(`Tools (${matchedLocal.tools.length}):`));
        for (const tool of matchedLocal.tools) {
          writeLine(output, `  ${pc.cyan("-")} ${pc.bold(tool.name)}: ${pc.dim(tool.description || "No description")}`);
        }
      } else {
        writeLine(output, pc.dim(emptyToolDetailMessage(matchedLocal)));
      }
    } else if (matchedRemote) {
      writeLine(output, `${pc.magenta("•")} ${pc.bold(matchedRemote.serverName)} ${pc.dim(`(Remote - MCP Assistant)`)}`);
      writeLine(output, `  ${pc.dim("Status:")}    ${pc.green("● active")}`);
      writeLine(output, `  ${pc.dim("Tools:")}     ${displayedToolCount(matchedRemote)}${discoveryDiagnostic(matchedRemote)}`);
      writeLine(output);
      if (matchedRemote.tools.length > 0) {
        writeLine(output, pc.bold(`Tools (${matchedRemote.tools.length}):`));
        for (const tool of matchedRemote.tools) {
          writeLine(output, `  ${pc.magenta("-")} ${pc.bold(tool.name)}: ${pc.dim(tool.description || "No description")}`);
        }
      } else {
        writeLine(output, pc.dim(emptyToolDetailMessage(matchedRemote)));
      }
    } else if (matchedDisabled) {
      const [name, cfg] = matchedDisabled;
      const transport = getTransportType(cfg);
      writeLine(output, `${pc.dim("•")} ${pc.bold(name)} ${pc.yellow("(disabled)")}`);
      writeLine(output, `  ${pc.dim("Transport:")} ${transport}`);
      writeLine(output, `  ${pc.dim("Status:")}    ${pc.yellow("○ disabled in mcp.json")}`);
      writeLine(output, `  ${pc.dim("Tools:")}     0 (disabled)`);
      writeLine(output);
      writeLine(output, pc.dim(`Tip: Enable this server using "mcpa enable ${name}"`));
    }
    return;
  }

  // 2. If --tools is specified, print full tool list for all servers
  if (showTools) {
    writeLine(output, pc.bold(`Configured MCP Servers (${totalServers}):`));
    writeLine(output);

    if (localServers.length > 0 || disabledServers.length > 0) {
      if (remoteServers.length > 0) {
        writeLine(output, pc.bold(pc.dim("Local Servers (mcp.json):")));
      }
      for (const server of localServers) {
        writeLine(output, `${pc.cyan("•")} ${pc.bold(server.serverName)} - ${displayedToolCount(server)} tool(s)${discoveryDiagnostic(server)}`);
        for (const tool of server.tools) {
          writeLine(output, `    - ${tool.name}: ${pc.dim(tool.description || "No description")}`);
        }
        writeLine(output);
      }
      for (const [name] of disabledServers) {
        writeLine(output, `${pc.dim("•")} ${pc.dim(pc.bold(name))} ${pc.yellow("(disabled)")}`);
        writeLine(output);
      }
    }

    if (remoteServers.length > 0) {
      writeLine(output, pc.bold(pc.dim("Remote Servers (MCP Assistant):")));
      for (const server of remoteServers) {
        writeLine(output, `${pc.magenta("•")} ${pc.bold(server.serverName)} - ${displayedToolCount(server)} tool(s)${discoveryDiagnostic(server)}`);
        for (const tool of server.tools) {
          writeLine(output, `    - ${tool.name}: ${pc.dim(tool.description || "No description")}`);
        }
        writeLine(output);
      }
    }
    return;
  }

  // 3. Default compact summary view
  writeLine(output, pc.bold(`Configured MCP Servers (${totalServers}):`));
  writeLine(output);

  let totalTools = 0;
  let activeServers = 0;
  let failedServers = 0;

  if (localServers.length > 0 || disabledServers.length > 0) {
    if (remoteServers.length > 0) {
      writeLine(output, pc.bold(pc.dim("Local Servers (mcp.json):")));
    }
    for (const server of localServers) {
      const cfg = getEnabledServerConfig(server, allConfigs);
      const transport = getTransportType(cfg).padEnd(6);
      const count = `${displayedToolCount(server)} tool(s)${discoveryDiagnostic(server)}`;
      totalTools += displayedToolCount(server);
      if (server.discoveryState === "error" || server.discoveryState === "timeout") failedServers += 1;
      else activeServers += 1;
      writeLine(
        output,
        `  ${pc.cyan("•")} ${pc.bold(server.serverName.padEnd(20))} ${pc.dim(transport)}  ${statusLabel(server)}    ${pc.dim(count)}`,
      );
    }
    for (const [name, cfg] of disabledServers) {
      const transport = getTransportType(cfg).padEnd(6);
      writeLine(
        output,
        `  ${pc.dim("•")} ${pc.dim(pc.bold(name.padEnd(20)))} ${pc.dim(transport)}  ${pc.yellow("○ disabled")}  ${pc.dim("0 tool(s)")}`,
      );
    }
    writeLine(output);
  }

  if (remoteServers.length > 0) {
    writeLine(output, pc.bold(pc.dim("Remote Servers (MCP Assistant):")));
    for (const server of remoteServers) {
      const count = `${displayedToolCount(server)} tool(s)${discoveryDiagnostic(server)}`;
      totalTools += displayedToolCount(server);
      activeServers += 1;
      writeLine(
        output,
        `  ${pc.magenta("•")} ${pc.bold(server.serverName.padEnd(20))} ${pc.dim("remote")}  ${pc.green("● active")}    ${pc.dim(count)}`,
      );
    }
    writeLine(output);
  }

  const disabledCount = disabledServers.length;
  const stats = [
    `${activeServers} active`,
    failedServers > 0 ? `${failedServers} failed` : null,
    disabledCount > 0 ? `${disabledCount} disabled` : null,
    `${totalTools} tools available`,
  ]
    .filter(Boolean)
    .join(", ");

  writeLine(output, pc.dim(`Total: ${stats}`));
  writeLine(output, pc.dim(`Tip: Run "mcpa list <server>" or "mcpa list --tools" for detailed tool definitions.`));
}

export async function fetchGatewayCatalog(
  client: McpEndpointClient,
  allConfigs: Record<string, McpServerConfig>,
  options: { showTools?: boolean; serverName?: string },
): Promise<{ localServers: ServerEntry[]; remoteServers: ServerEntry[] }> {
  const serverList = await fetchGatewayServers(client, options.serverName ?? "");

  const toolMap = new Map<string, ToolEntry[]>();
  const states = new Map<string, Pick<ServerEntry, "discoveryState" | "message">>();
  for (const server of serverList) {
    states.set(server.serverId, {
      discoveryState: server.discoveryState,
      ...(server.error ? { message: server.error } : {}),
    });
  }
  if (options.showTools || options.serverName) {
    await Promise.all(serverList.map(async (server) => {
      if (server.discoveryState !== "complete") return;
      try {
        const results = await searchGatewayTools(client, {
          query: "",
          serverId: server.serverId,
          limit: Math.max(server.toolCount, 1),
          detail: "detailed",
        });
        const tools = results
          .filter((tool) => tool.serverId === server.serverId)
          .map((tool) => ({
            name: tool.toolName,
            description: tool.description || undefined,
          }));
        toolMap.set(server.serverId, tools);
        states.set(server.serverId, tools.length === server.toolCount
          ? { discoveryState: "complete" }
          : { discoveryState: "incomplete", message: `received ${tools.length} of ${server.toolCount} advertised tools` });
      } catch (error) {
        const message = (error as Error).message;
        states.set(server.serverId, {
          discoveryState: "error",
          message,
        });
      }
    }));
  }

  const localServers: ServerEntry[] = [];
  const remoteServers: ServerEntry[] = [];

  for (const s of serverList) {
    const sTools = toolMap.get(s.serverId) ?? [];
    const isLocal = s.source === "local";
    const entry: ServerEntry = {
      serverId: s.serverId,
      serverName: s.serverName,
      tools: sTools,
      source: s.source,
      advertisedToolCount: s.toolCount,
      ...(states.get(s.serverId) ?? {}),
    };

    if (isLocal) {
      localServers.push(entry);
    } else {
      remoteServers.push(entry);
    }
  }

  return { localServers, remoteServers };
}

export async function cmdList(
  dir: string | undefined,
  output: Pick<Writable, "write">,
  options: ListOptions = {},
): Promise<void> {
  const { showTools = false, serverName } = options;
  const allConfigs = getServerConfig(dir);
  const disabledServers = Object.entries(allConfigs).filter(([_, cfg]) => cfg.disabled);

  await withGatewayClient(
    {
      onProgress: (message) => writeLine(output, pc.dim(message)),
      onWarning: (message) => writeLine(output, pc.yellow(message)),
    },
    async (client) => {
      const { localServers, remoteServers } = await fetchGatewayCatalog(
        client,
        allConfigs,
        { showTools, serverName },
      );
      renderListOutput(
        localServers,
        remoteServers,
        disabledServers,
        allConfigs,
        options,
        output,
      );
    },
  );
}
