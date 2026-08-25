import { loadMcpJson } from "./config.js";
import type { McpServerConfig } from "./types.js";
import { DEFAULT_LOCAL_MCP_PORT, DEFAULT_REMOTE_GATEWAY_URL } from "../constants.js";
import { isGatewayHealth, type GatewayHealth } from "./gateway-health.js";

export { DEFAULT_LOCAL_MCP_PORT, DEFAULT_REMOTE_GATEWAY_URL };

/**
 * Loads configured MCP server definitions from local mcp.json.
 */
export function getServerConfig(cwdOrDir?: string): Record<string, McpServerConfig> {
  const target = cwdOrDir ?? process.cwd();
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
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timer);
    if (response && (response.status === 200 || response.status === 406)) {
      const contentType = response.headers.get("content-type") ?? "";
      if (
        !contentType.includes("application/json") &&
        !contentType.includes("+json") &&
        !contentType.includes("text/event-stream")
      ) {
        return null;
      }
      if (contentType.includes("text/event-stream")) {
        return url;
      }
      const data = (await response.json().catch(() => null)) as {
        jsonrpc?: string;
        result?: unknown;
        error?: unknown;
      } | null;
      if (
        data &&
        typeof data === "object" &&
        data.jsonrpc === "2.0" &&
        ("result" in data || "error" in data)
      ) {
        return url;
      }
    }
  } catch {
    // Gateway daemon is not running
  }
  return null;
}

/** Returns the identity asserted by a healthy local gateway. */
export async function getGatewayHealth(
  host = "127.0.0.1",
  port = DEFAULT_LOCAL_MCP_PORT,
  timeoutMs = 120,
): Promise<GatewayHealth | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`http://${host}:${port}/healthz`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timer);
    if (!response?.ok) return null;
    const payload: unknown = await response.json().catch(() => null);
    return isGatewayHealth(payload) ? payload : null;
  } catch {
    return null;
  }
}
