import type { Writable } from "node:stream";
import pc from "picocolors";
import { createRouter, searchTools } from "../core.js";
import type { GatewayContextOptions } from "../gateway/context.js";
import { withGatewayClient } from "../gateway/command-client.js";
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
  await withGatewayClient(
    {
      endpoint: options?.endpoint,
      onProgress: (message) => writeLine(output, pc.dim(message)),
      onWarning: (message) => writeLine(output, pc.yellow(message)),
    },
    async (client) => {
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
    },
  );
}

export async function cmdLocalSearch(
  query: string,
  limit: number,
  dir: string | undefined,
  output: Pick<Writable, "write">,
): Promise<void> {
  return cmdSearch(query, limit, { cwd: dir }, output);
}
