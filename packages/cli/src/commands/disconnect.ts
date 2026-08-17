/**
 * @file packages/cli/src/commands/disconnect.ts
 * @description Disconnect and remove an MCP server from mcp.json and clear cached sessions.
 */

import type { Writable } from "node:stream";
import pc from "picocolors";
import { removeServerConfig } from "../gateway/config.js";
import { disconnectHttpMcpServer } from "../gateway/http-mcp-client.js";
import { printBanner, success, treeNote, warn } from "../ux.js";

export async function cmdDisconnect(
  name: string,
  dir?: string,
  _output: Pick<Writable, "write"> = process.stdout,
): Promise<void> {
  printBanner();

  if (!name) {
    throw new Error("disconnect requires a server name (e.g. mcpa disconnect <name>)");
  }

  const { path, removed, serverConfig } = removeServerConfig(name, dir);
  const url = serverConfig && "url" in serverConfig ? serverConfig.url : undefined;

  // Disconnect active client transport and wipe credentials using McpClient & SessionStore
  const { disconnected: sessionCleared } = await disconnectHttpMcpServer(url ?? name, {
    serverId: name,
    serverName: name,
  });

  if (removed) {
    success(`Removed server "${pc.bold(name)}" from ${pc.underline(path)}`);
    if (sessionCleared) {
      treeNote(pc.dim(`Cleared saved session & credentials for "${name}".`));
    }
    treeNote(pc.dim(`Run ${pc.bold("mcpa list")} or ${pc.bold("mcpa serve")} to see updated configuration.`));
  } else {
    warn(`Server "${pc.bold(name)}" was not found in ${pc.underline(path)}`);
    if (sessionCleared) {
      treeNote(pc.dim(`Cleared orphaned session & credentials for "${name}".`));
    }
  }
}
