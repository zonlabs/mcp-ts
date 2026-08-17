import type { Writable } from "node:stream";
import pc from "picocolors";
import { connectRemote } from "../client.js";
import { createRouter, searchTools } from "../core.js";
import {
  pingGateway,
  withMcpGateway,
  type GatewayContextOptions,
} from "../gateway/context.js";
import { writeLine } from "../ux.js";

export interface SearchCommandOptions extends GatewayContextOptions {
  endpoint?: string;
}

function formatSearchItem(
  index: number,
  result: { name: string; toolName?: string; serverId?: string; serverName?: string },
  extraDetail?: string,
): string {
  const scopedId = result.serverId ? `${result.serverId}::${result.toolName ?? result.name}` : result.name;
  const serverDetail =
    result.serverName && result.serverName !== result.serverId
      ? ` (server: ${result.serverName}${extraDetail ? `, ${extraDetail}` : ""})`
      : extraDetail
        ? ` (${extraDetail})`
        : "";
  return `${pc.cyan(String(index + 1))}. ${pc.bold(scopedId)}${pc.dim(serverDetail)}`;
}

export async function cmdSearch(
  query: string,
  limit: number,
  options: SearchCommandOptions | undefined,
  output: Pick<Writable, "write">,
): Promise<void> {
  // Option 1: Explicit remote or custom endpoint
  if (options?.endpoint) {
    const client = await connectRemote(options.endpoint);
    try {
      const router = await createRouter(client);
      const results = await searchTools(router, query, limit);
      if (results.length === 0) {
        writeLine(output, "No matching tools found.");
        return;
      }
      results.forEach((result, index) => {
        writeLine(output, formatSearchItem(index, result));
        if (result.description) {
          writeLine(output, `   ${pc.dim(result.description)}`);
        }
      });
      return;
    } finally {
      await client.close();
    }
  }

  // Option 2: Check if a local gateway daemon (`mcpa serve`) is currently running
  const runningGateway = await pingGateway();
  if (runningGateway) {
    try {
      const client = await connectRemote(runningGateway);
      try {
        const router = await createRouter(client);
        const results = await searchTools(router, query, limit);
        if (results.length > 0) {
          results.forEach((result, index) => {
            writeLine(output, formatSearchItem(index, result));
            if (result.description) {
              writeLine(output, `   ${pc.dim(result.description)}`);
            }
          });
          return;
        }
      } finally {
        await client.close();
      }
    } catch {
      // Fall through to direct gateway initialization
    }
  }

  // Option 3: Direct local + remote bridge resolution
  await withMcpGateway(options, async (gateway) => {
    const matches = await gateway.searchTools(query, limit);
    if (matches.length === 0) {
      writeLine(output, "No matching tools found.");
      return;
    }
    matches.forEach((result, index) => {
      const tool = gateway.getTool(result.name);
      const paramCount = tool?.inputSchema?.properties
        ? Object.keys(tool.inputSchema.properties).length
        : 0;
      writeLine(output, formatSearchItem(index, result, `${paramCount} params`));
      if (result.description) {
        writeLine(output, `   ${pc.dim(result.description)}`);
      }
    });
  });
}

export async function cmdLocalSearch(
  query: string,
  limit: number,
  dir: string | undefined,
  output: Pick<Writable, "write">,
): Promise<void> {
  return cmdSearch(query, limit, { cwd: dir }, output);
}
