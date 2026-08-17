/**
 * @file packages/cli/src/commands/connect.ts
 * @description Test and connect a remote or local MCP server, discover its tools,
 * and persist its configuration into mcp.json.
 */

import type { Writable } from "node:stream";
import pc from "picocolors";
import { connectRemote } from "../client.js";
import { LocalMcpConnection } from "../gateway/registry.js";
import { addOrUpdateServerConfig } from "../gateway/config.js";
import type { HttpServerConfig, StdioServerConfig } from "../gateway/types.js";
import { printBanner, spinner, success, treeNote, writeLine } from "../ux.js";

export interface ConnectOptions {
  name?: string;
  url?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
  auth?: string;
  dir?: string;
  save?: boolean;
}

export async function cmdConnect(
  target: { name?: string; url?: string; command?: string; args?: string[] },
  options: ConnectOptions = {},
  output: Pick<Writable, "write"> = process.stdout,
): Promise<void> {
  printBanner();

  const name = options.name || target.name;
  const url = options.url || target.url;
  const command = options.command || target.command;
  const args = options.args || target.args || [];

  if (!url && !command) {
    throw new Error(
      "connect requires either an endpoint URL or a command (e.g. mcpa connect mem0 https://mcp.mem0.ai/mcp or mcpa connect --name postgres --command npx --args ...)",
    );
  }

  const serverName = name || (url ? new URL(url).hostname.replace(/\./g, "-") : "custom-server");
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.auth) {
    headers["Authorization"] = `Bearer ${options.auth}`;
  }

  const targetDesc = url ? `"${serverName}" (${url})` : `"${serverName}"`;
  const spin = spinner();
  spin.start(`Connecting to ${targetDesc}...`);

  let toolNames: string[] = [];

  try {
    if (url) {
      // 1. Connect and test remote HTTP MCP server
      const client = await connectRemote(url, {
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        onProgress: (stage) => {
          if (stage === "browser_opened") {
            spin.stop("Opened browser for OAuth authorization");
            spin.start("Waiting for authorization in browser...");
          } else if (stage === "code_exchanged") {
            spin.stop("Authorization code received & exchanged for tokens");
            spin.start(`Discovering tools from "${serverName}"...`);
          }
        },
      });
      try {
        const toolsResult = await client.listTools();
        toolNames = (toolsResult.tools ?? []).map((t) => t.name);
      } finally {
        await client.close();
      }
    } else if (command) {
      // 2. Connect and test local stdio MCP server
      const stdioConn = new LocalMcpConnection(serverName, serverName, {
        command,
        args,
        cwd: options.dir,
      });
      try {
        await stdioConn.start();
        const toolsResult = await stdioConn.listTools();
        toolNames = (toolsResult.tools ?? []).map((t) => t.name);
      } finally {
        await stdioConn.stop();
      }
    } else {
      throw new Error("Either --url or --command is required to connect to an MCP server.");
    }
    spin.stop(`Connected to "${serverName}" — ${toolNames.length} tool(s) discovered:`);
  } catch (error) {
    spin.stop(`Failed to connect to "${serverName}"`);
    throw error;
  }

  if (toolNames.length > 0) {
    const preview = toolNames.slice(0, 8);
    preview.forEach((t) => {
      treeNote(`${pc.cyan("•")} ${pc.bold(serverName + "::" + t)}`);
    });
    if (toolNames.length > preview.length) {
      treeNote(pc.dim(`  ... and ${toolNames.length - preview.length} more tool(s)`));
    }
  }

  // Persist to mcp.json unless explicitly disabled with --no-save
  const shouldSave = options.save !== false;
  if (shouldSave) {
    const serverConfig = url
      ? ({ url, headers: Object.keys(headers).length > 0 ? headers : undefined } as HttpServerConfig)
      : ({ command: command!, args } as StdioServerConfig);

    const { path } = addOrUpdateServerConfig(serverName, serverConfig, options.dir);
    success(`Saved "${serverName}" to ${pc.underline(path)}`);
    treeNote(pc.dim(`Run ${pc.bold("mcpa serve")} or ${pc.bold("mcpa call " + serverName + "::<tool>")} to use it.`));
  }
}
