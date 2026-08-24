import type { Writable } from "node:stream";
import pc from "picocolors";
import { withGatewayClient } from "../gateway/command-client.js";
import { searchGatewayTools } from "../gateway/meta-tools.js";
import { writeLine } from "../ux.js";

export interface SearchCommandOptions {
  endpoint?: string;
}

function formatSearchItem(
  index: number,
  result: { toolId: string; serverId: string; serverName: string },
  extraDetail?: string,
): string {
  const serverDetail =
    result.serverName && result.serverName !== result.serverId
      ? ` (server: ${result.serverName}${extraDetail ? `, ${extraDetail}` : ""})`
      : extraDetail
        ? ` (${extraDetail})`
        : "";
  return `${pc.cyan(String(index + 1))}. ${pc.bold(result.toolId)}${pc.dim(serverDetail)}`;
}

export async function cmdSearch(
  query: string,
  limit: number,
  options: SearchCommandOptions | undefined,
  output: Pick<Writable, "write">,
): Promise<void> {
  await withGatewayClient(
    {
      ...(options?.endpoint === undefined ? {} : { endpoint: options.endpoint }),
      onProgress: (message) => writeLine(output, pc.dim(message)),
      onWarning: (message) => writeLine(output, pc.yellow(message)),
    },
    async (client) => {
      const results = await searchGatewayTools(client, { query, limit });
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
