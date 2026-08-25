import { DEFAULT_LOCAL_MCP_PORT } from "../constants.js";
import { validatePort } from "../cli-options.js";
import { getDaemonStatus } from "./daemon.js";

export interface GatewayActivationResult {
  activated: boolean;
  port?: number;
  state?: string;
}

interface GatewayActivationDependencies {
  getStatus?: typeof getDaemonStatus;
  fetchImpl?: typeof fetch;
}

export async function activateRunningGateway(
  options: { port?: number } = {},
  dependencies: GatewayActivationDependencies = {},
): Promise<GatewayActivationResult> {
  const port = validatePort(options.port ?? DEFAULT_LOCAL_MCP_PORT);
  const status = await (dependencies.getStatus ?? getDaemonStatus)(port);
  if (status.state !== "running" && status.state !== "external") {
    return { activated: false, state: status.state };
  }

  const activePort = validatePort(status.port ?? port);
  const response = await (dependencies.fetchImpl ?? fetch)(
    `http://127.0.0.1:${activePort}/activate-remote`,
    {
      method: "POST",
      headers: { accept: "application/json" },
    },
  );
  const payload = await response.json().catch(() => null) as {
    ready?: unknown;
    error?: unknown;
  } | null;
  if (!response.ok || payload?.ready !== true) {
    const detail = typeof payload?.error === "string" ? `: ${payload.error}` : "";
    throw new Error(`The running gateway could not activate its remote bridge${detail}`);
  }
  return { activated: true, port: activePort };
}

