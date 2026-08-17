import { McpGatewayRegistry } from "./registry.js";
import { loadMcpJson } from "./config.js";
import { RemoteBridgeClient } from "./bridge-client.js";
import {
  ensureFreshAuthSession,
  loadAuthSession,
} from "./auth-store.js";
import type { McpServerConfig } from "./types.js";

export const DEFAULT_LOCAL_MCP_PORT = 8765;

export interface GatewayContextOptions {
  cwd?: string;
  remoteUrl?: string;
  enableBridge?: boolean;
}

/**
 * Loads configured MCP server definitions from local mcp.json.
 */
export function getServerConfig(cwd?: string): Record<string, McpServerConfig> {
  const target = cwd ?? process.cwd();
  try {
    const { config } = loadMcpJson(target);
    return config.mcpServers ?? {};
  } catch {
    return {};
  }
}

/**
 * Pings the local gateway daemon (`mcpa serve`) to see if it is active.
 * Returns the gateway endpoint URL if responsive, or null.
 */
export async function pingGateway(
  host = "127.0.0.1",
  port = DEFAULT_LOCAL_MCP_PORT,
  path = "/mcp",
  timeoutMs = 120,
): Promise<string | null> {
  const url = `http://${host}:${port}${path}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timer);
    if (response && response.status < 500) {
      return url;
    }
  } catch {
    // Gateway daemon is not running
  }
  return null;
}

/**
 * Scoped lifecycle manager: starts registry + bridge, runs the action,
 * and guarantees clean asynchronous teardown of all subprocesses and sockets.
 */
export async function withMcpGateway<T>(
  options: GatewayContextOptions | undefined,
  action: (gateway: McpGatewayRegistry) => Promise<T>,
): Promise<T> {
  const configs = getServerConfig(options?.cwd);
  const gateway = new McpGatewayRegistry(configs, undefined, { verbose: false });
  let bridge: RemoteBridgeClient | null = null;

  await gateway.start();
  try {
    const remote = options?.remoteUrl ?? process.env.REMOTE_GATEWAY_URL ?? "https://api.mcp-assistant.in";
    if (options?.enableBridge !== false && loadAuthSession(remote)) {
      try {
        bridge = new RemoteBridgeClient(gateway, {
          remoteUrl: remote,
          getAccessToken: async () => (await ensureFreshAuthSession(remote)).accessToken,
        });
        await bridge.start();
        await bridge.waitForReady(2_000);
      } catch {
        // Remote bridge connection is best effort for one-shot commands
      }
    }
    return await action(gateway);
  } finally {
    await Promise.allSettled([
      bridge?.stop(),
      gateway.close(),
    ]);
  }
}
