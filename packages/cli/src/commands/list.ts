import type { Writable } from "node:stream";
import pc from "picocolors";
import { getServerConfig, withMcpGateway } from "../gateway/context.js";
import { writeLine } from "../ux.js";

export async function cmdList(
  dir: string | undefined,
  output: Pick<Writable, "write">,
): Promise<void> {
  await withMcpGateway({ cwd: dir, dir }, async (gateway) => {
    const localServers = gateway.getLocalCatalog().servers;
    const remoteServers = gateway.getRemoteCatalog().servers;
    const allConfigs = getServerConfig(dir);
    const disabledServers = Object.entries(allConfigs).filter(([_, cfg]) => cfg.disabled);
    const totalServers = localServers.length + remoteServers.length + disabledServers.length;

    if (totalServers === 0) {
      writeLine(output, "No servers configured in mcp.json or connected remotely.");
      return;
    }

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
  });
}
