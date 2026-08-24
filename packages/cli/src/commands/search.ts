import type { Writable } from "node:stream";
import pc from "picocolors";
import { connectMcpEndpoint } from "../client.js";
import { createRouter, searchTools } from "../core.js";
import {
  withMcpGateway,
  type GatewayContextOptions,
} from "../gateway/context.js";
import { createAuthenticatedRemoteClient, mergeSearchResults, resolveGateway, withTimeout } from "../gateway/command-resolution.js";
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
    const client = await connectMcpEndpoint(options.endpoint);
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
  const runningGateway = await resolveGateway();
  if (runningGateway.endpoint) {
    try {
    const client = await connectMcpEndpoint(runningGateway.endpoint);
      try {
        const router = await createRouter(client);
        const results = await searchTools(router, query, limit);
        if (results.length === 0) {
          writeLine(output, "No matching tools found.");
        } else {
          results.forEach((result, index) => {
            writeLine(output, formatSearchItem(index, result));
            if (result.description) writeLine(output, `   ${pc.dim(result.description)}`);
          });
        }
        return;
      } finally {
        await client.close();
      }
    } catch {
      // Fall through to direct gateway initialization
    }
  }

  // Option 3: Query local configuration and authenticated remote HTTP concurrently.
  const [localResult, remoteResult] = await Promise.allSettled([
    withTimeout(withMcpGateway({ ...options, enableBridge: false }, (gateway) => gateway.searchTools(query, limit)), 10_000, "Local discovery"),
    withTimeout((async () => {
      const client = await createAuthenticatedRemoteClient(
        options?.remoteUrl,
        { warn: (message) => writeLine(output, pc.yellow(message)) },
      );
      if (!client) return [];
      try {
        return await searchTools(await createRouter(client), query, limit);
      } finally {
        await client.close();
      }
    })(), 10_000, "Remote discovery"),
  ]);
  const local = localResult.status === "fulfilled" ? localResult.value : [];
  const remote = remoteResult.status === "fulfilled" ? remoteResult.value : [];
  const matches = mergeSearchResults(query, limit, local, remote);
  if (matches.length === 0) {
    writeLine(output, "No matching tools found.");
    return;
  }
  matches.forEach((result, index) => {
    writeLine(output, formatSearchItem(index, { ...result, name: result.name ?? result.toolName }));
    if (result.description) writeLine(output, `   ${pc.dim(result.description)}`);
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
