import type { Writable } from "node:stream";
import pc from "picocolors";
import { getServerConfig, withMcpGateway } from "../gateway/context.js";
import { writeLine } from "../ux.js";
import type { McpServerConfig } from "../gateway/types.js";

export interface ListOptions {
  showTools?: boolean;
  serverName?: string;
  enableBridge?: boolean;
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

export async function cmdList(
  dir: string | undefined,
  output: Pick<Writable, "write">,
  options: ListOptions = {},
): Promise<void> {
  const { showTools = false, serverName, enableBridge } = options;

  await withMcpGateway({ cwd: dir, dir, enableBridge }, async (gateway) => {
    const localServers = gateway.getLocalCatalog().servers;
    const remoteServers = gateway.getRemoteCatalog().servers;
    const allConfigs = getServerConfig(dir);
    const disabledServers = Object.entries(allConfigs).filter(([_, cfg]) => cfg.disabled);
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
        const cfg = allConfigs[matchedLocal.serverName];
        const transport = getTransportType(cfg);
        writeLine(output, `${pc.cyan("•")} ${pc.bold(matchedLocal.serverName)} ${pc.dim(`(Local - mcp.json)`)}`);
        writeLine(output, `  ${pc.dim("Transport:")} ${transport}`);
        writeLine(output, `  ${pc.dim("Status:")}    ${pc.green("● active")}`);
        writeLine(output, `  ${pc.dim("Tools:")}     ${matchedLocal.tools.length}`);
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
        writeLine(output, `  ${pc.dim("Tools:")}     ${matchedRemote.tools.length}`);
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
          writeLine(output, `${pc.cyan("•")} ${pc.bold(server.serverName)} - ${server.tools.length} tool(s)`);
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
          writeLine(output, `${pc.magenta("•")} ${pc.bold(server.serverName)} - ${server.tools.length} tool(s)`);
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
        const cfg = allConfigs[server.serverName];
        const transport = getTransportType(cfg).padEnd(6);
        const count = `${server.tools.length} tool(s)`;
        totalTools += server.tools.length;
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
        const count = `${server.tools.length} tool(s)`;
        totalTools += server.tools.length;
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
  });
}
