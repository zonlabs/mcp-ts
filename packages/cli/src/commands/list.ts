import type { Writable } from "node:stream";
import pc from "picocolors";
import { getServerConfig, withMcpGateway } from "../gateway/context.js";
import { createAuthenticatedRemoteClient, resolveGateway } from "../gateway/command-resolution.js";
import { connectMcpEndpoint } from "../client.js";
import { writeLine } from "../ux.js";
import type { McpServerConfig } from "../gateway/types.js";

export interface ListOptions {
  showTools?: boolean;
  serverName?: string;
  enableBridge?: boolean;
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
      const cfg = allConfigs[matchedLocal.serverName] ?? allConfigs[matchedLocal.serverId];
      const transport = getTransportType(cfg);
      writeLine(output, `${pc.cyan("•")} ${pc.bold(matchedLocal.serverName)} ${pc.dim(`(Local - mcp.json)`)}`);
      writeLine(output, `  ${pc.dim("Transport:")} ${transport}`);
      writeLine(output, `  ${pc.dim("Status:")}    ${pc.green("● active")}`);
      writeLine(output, `  ${pc.dim("Tools:")}     ${displayedToolCount(matchedLocal)}${discoveryDiagnostic(matchedLocal)}`);
      writeLine(output);
      if (matchedLocal.tools.length > 0) {
        writeLine(output, pc.bold(`Tools (${matchedLocal.tools.length}):`));
        for (const tool of matchedLocal.tools) {
          writeLine(output, `  ${pc.cyan("-")} ${pc.bold(tool.name)}: ${pc.dim(tool.description || "No description")}`);
        }
      } else {
        writeLine(output, pc.dim("  (No tools registered for this server)"));
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
        writeLine(output, pc.dim("  (No tools registered for this server)"));
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

  if (localServers.length > 0 || disabledServers.length > 0) {
    if (remoteServers.length > 0) {
      writeLine(output, pc.bold(pc.dim("Local Servers (mcp.json):")));
    }
    for (const server of localServers) {
      const cfg = allConfigs[server.serverName] ?? allConfigs[server.serverId];
      const transport = getTransportType(cfg).padEnd(6);
      const count = `${displayedToolCount(server)} tool(s)${discoveryDiagnostic(server)}`;
      totalTools += displayedToolCount(server);
      activeServers += 1;
      writeLine(
        output,
        `  ${pc.cyan("•")} ${pc.bold(server.serverName.padEnd(20))} ${pc.dim(transport)}  ${pc.green("● active")}    ${pc.dim(count)}`,
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
    disabledCount > 0 ? `${disabledCount} disabled` : null,
    `${totalTools} tools available`,
  ]
    .filter(Boolean)
    .join(", ");

  writeLine(output, pc.dim(`Total: ${stats}`));
  writeLine(output, pc.dim(`Tip: Run "mcpa list <server>" or "mcpa list --tools" for detailed tool definitions.`));
}

function parseTextPayload(raw: unknown): any {
  if (!raw || typeof raw !== "object") return null;
  const content = (raw as { content?: Array<{ text?: string }> }).content;
  if (!Array.isArray(content) || !content[0]?.text) return null;
  return JSON.parse(content[0].text);
}

async function withDeadline<T>(promise: Promise<T>, deadlineAt: number): Promise<T> {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw new Error("Discovery timed out after 10 seconds");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Discovery timed out after 10 seconds")), remaining);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchCatalogThroughClient(
  client: Awaited<ReturnType<typeof connectMcpEndpoint>>,
  allConfigs: Record<string, McpServerConfig>,
  options: { showTools?: boolean; serverName?: string; deadlineAt?: number },
): Promise<{ localServers: ServerEntry[]; remoteServers: ServerEntry[] }> {
  const deadlineAt = options.deadlineAt ?? Date.now() + 10_000;
  let serverList: Array<{ serverId: string; serverName: string; toolCount: number }> = [];
  try {
    const raw = await withDeadline(client.callTool("list_mcp_servers", { query: options.serverName ?? "" }), deadlineAt);
    if (raw && typeof raw === "object") {
      const res = raw as { content?: Array<{ type?: string; text?: string }> };
      if (Array.isArray(res.content) && res.content[0]?.text) {
        const parsed = JSON.parse(res.content[0].text);
        if (Array.isArray(parsed.servers)) {
          serverList = parsed.servers.map((s: any) => ({
            serverId: String(s.server_id ?? s.serverId ?? s.serverName ?? ""),
            serverName: String(s.server_name ?? s.serverName ?? s.serverId ?? ""),
            toolCount: Number(s.tool_count ?? s.toolCount ?? 0),
          }));
        }
      }
    }
  } catch {
    // If list_mcp_servers tool is unavailable, discover via tools
  }

  const toolMap = new Map<string, ToolEntry[]>();
  const states = new Map<string, Pick<ServerEntry, "discoveryState" | "message">>();
  if (options.showTools || options.serverName || serverList.length === 0) {
    const targets = serverList.length > 0
      ? serverList
      : [{ serverId: options.serverName ?? "", serverName: options.serverName ?? "", toolCount: 1000 }];
    await Promise.all(targets.map(async (server) => {
      const key = server.serverName || server.serverId || "default";
      try {
        const parsed = parseTextPayload(await withDeadline(client.callTool("search_mcp_tools", {
          query: "",
          server_id: server.serverId || undefined,
          server_name: server.serverName || undefined,
          limit: Math.max(server.toolCount, 1),
        }), deadlineAt));
        const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.tools) ? parsed.tools : [];
        const tools = items
          .filter((item: any) => {
            if (!server.serverId && !server.serverName) return true;
            const itemId = String(item.server_id ?? item.serverId ?? "");
            const itemName = String(item.server_name ?? item.serverName ?? "");
            return itemId === server.serverId || itemName === server.serverName;
          })
          .map((item: any) => ({
            name: String(item.tool_name ?? item.toolName ?? item.name ?? ""),
            description: item.description ? String(item.description) : undefined,
          }))
          .filter((tool: ToolEntry) => tool.name);
        toolMap.set(key, tools);
        states.set(key, tools.length === server.toolCount
          ? { discoveryState: "complete" }
          : { discoveryState: "incomplete", message: `received ${tools.length} of ${server.toolCount} advertised tools` });
      } catch (error) {
        const message = (error as Error).message;
        states.set(key, {
          discoveryState: message.includes("timed out") ? "timeout" : "error",
          message,
        });
      }
    }));

    // If serverList was empty, populate from toolMap
    if (serverList.length === 0 && toolMap.size > 0) {
      for (const [sName, tools] of toolMap.entries()) {
        serverList.push({
          serverId: sName,
          serverName: sName,
          toolCount: tools.length,
        });
      }
    }
  }

  const localServers: ServerEntry[] = [];
  const remoteServers: ServerEntry[] = [];

  for (const s of serverList) {
    const sTools = toolMap.get(s.serverName) ?? toolMap.get(s.serverId) ?? [];
    const isLocal = Boolean(allConfigs[s.serverName] || allConfigs[s.serverId]);
    const entry: ServerEntry = {
      serverId: s.serverId,
      serverName: s.serverName,
      tools: sTools,
      source: isLocal ? "local" : "remote",
      advertisedToolCount: s.toolCount,
      ...(states.get(s.serverName) ?? states.get(s.serverId) ?? {}),
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

  // 1. If a local gateway daemon (`mcpa serve` / daemon) is currently running, query it directly
  const runningGateway = await resolveGateway();
  if (runningGateway.endpoint) {
    try {
      const client = await connectMcpEndpoint(runningGateway.endpoint);
      try {
        const { localServers, remoteServers } = await fetchCatalogThroughClient(
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
        return;
      } finally {
        await client.close();
      }
    } catch {
      // Fall through to standalone gateway instantiation
    }
  }

  // 2. Query local configuration and authenticated remote HTTP concurrently.
  const [localResult, remoteResult] = await Promise.allSettled([
    withDeadline(withMcpGateway({ cwd: dir, dir, enableBridge: false }, async (gateway) => {
      const local = gateway.getLocalCatalog().servers as ServerEntry[];
      const startupErrors = gateway.getLocalServerStartupErrors();
      const known = new Set(local.flatMap((server) => [server.serverId, server.serverName]));
      for (const [name, config] of Object.entries(allConfigs)) {
        if (config.disabled || known.has(name)) continue;
        local.push({
          serverId: name,
          serverName: name,
          tools: [],
          source: "local",
          advertisedToolCount: 0,
          discoveryState: startupErrors.get(name)?.includes("timed out") ? "timeout" : "error",
          message: startupErrors.get(name) ?? "server did not initialize",
        });
      }
      return { local, remote: gateway.getRemoteCatalog().servers };
    }), Date.now() + 10_000),
    (async () => {
      const deadlineAt = Date.now() + 10_000;
      const client = await withDeadline(createAuthenticatedRemoteClient(undefined, {
        warn: (message) => writeLine(output, pc.yellow(message)),
      }), deadlineAt);
      if (!client) return [];
      try {
        return (await fetchCatalogThroughClient(client, {}, { showTools, serverName, deadlineAt })).remoteServers;
      } catch (error) {
        writeLine(output, pc.yellow(`Remote discovery failed: ${(error as Error).message}`));
        return [];
      } finally {
        await client.close();
      }
    })(),
  ]);
  renderListOutput(
    localResult.status === "fulfilled" ? localResult.value.local : [],
    [
      ...(localResult.status === "fulfilled" ? localResult.value.remote : []),
      ...(remoteResult.status === "fulfilled" ? remoteResult.value : []),
    ],
    disabledServers,
    allConfigs,
    options,
    output,
  );
}
