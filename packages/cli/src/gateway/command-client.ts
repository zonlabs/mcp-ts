import {
  connectMcpEndpoint,
  type McpEndpointClient,
} from "../client.js";
import {
  DEFAULT_LOCAL_MCP_PORT,
  DEFAULT_REMOTE_GATEWAY_URL,
} from "../constants.js";
import { loadAuthSession } from "./auth-store.js";
import {
  getDaemonStatus,
  spawnDaemon,
} from "./daemon.js";

const REMOTE_SESSION_WARNING = "Remote tools are unavailable. Run mcpa login.";

export interface RunningGateway {
  endpoint: string;
  port: number;
  state: "running" | "external";
  managed: boolean;
  portOwnerPid?: number;
}

export interface EnsureGatewayOptions {
  port?: number;
  startupTimeoutMs?: number;
  onProgress?: (message: string) => void;
}

export interface GatewayClientOptions extends EnsureGatewayOptions {
  endpoint?: string;
  onWarning?: (message: string) => void;
}

interface EnsureGatewayDependencies {
  getStatus?: typeof getDaemonStatus;
  startDaemon?: typeof spawnDaemon;
}

interface GatewayClientDependencies {
  ensureGateway?: typeof ensureGatewayRunning;
  loadSession?: typeof loadAuthSession;
  connect?: typeof connectMcpEndpoint;
}

function gatewayEndpoint(port: number): string {
  return `http://127.0.0.1:${port}/mcp`;
}

export async function ensureGatewayRunning(
  options: EnsureGatewayOptions = {},
  dependencies: EnsureGatewayDependencies = {},
): Promise<RunningGateway> {
  const port = options.port ?? DEFAULT_LOCAL_MCP_PORT;
  const getStatus = dependencies.getStatus ?? getDaemonStatus;
  const startDaemon = dependencies.startDaemon ?? spawnDaemon;
  const status = await getStatus(port);
  const statusPort = status.port ?? port;

  if (status.state === "running" || status.state === "external") {
    return {
      endpoint: gatewayEndpoint(statusPort),
      port: statusPort,
      state: status.state,
      managed: status.managed,
      ...(status.portOwnerPid ? { portOwnerPid: status.portOwnerPid } : {}),
    };
  }

  if (status.state === "occupied") {
    const owner = status.portOwnerPid ? ` by PID ${status.portOwnerPid}` : "";
    throw new Error(
      `Port ${statusPort} is occupied${owner}. Use --port <available-port>; this process will not be stopped or adopted.`,
    );
  }

  if (status.state === "unhealthy") {
    throw new Error(
      `Gateway on port ${statusPort} is unhealthy. Inspect ${status.logPath}; it will not be replaced automatically.`,
    );
  }

  if (status.state !== "stopped" && status.state !== "starting") {
    throw new Error(`Cannot ensure gateway from unexpected state: ${status.state as string}`);
  }

  options.onProgress?.(`Starting MCP gateway on port ${statusPort}...`);
  const started = await startDaemon({ port: statusPort });
  const managed = started.managed !== false;
  return {
    endpoint: gatewayEndpoint(started.port),
    port: started.port,
    state: managed ? "running" : "external",
    managed,
  };
}

export async function withGatewayClient<T>(
  options: GatewayClientOptions = {},
  action: (client: McpEndpointClient) => Promise<T> | T,
  dependencies: GatewayClientDependencies = {},
): Promise<T> {
  const connect = dependencies.connect ?? connectMcpEndpoint;
  let endpoint: string;

  if (options.endpoint !== undefined) {
    endpoint = options.endpoint;
  } else {
    const ensureGateway = dependencies.ensureGateway ?? ensureGatewayRunning;
    endpoint = (await ensureGateway(options)).endpoint;
    const loadSession = dependencies.loadSession ?? loadAuthSession;
    const remoteUrl = process.env.REMOTE_GATEWAY_URL ?? DEFAULT_REMOTE_GATEWAY_URL;
    if (!loadSession(remoteUrl)) {
      options.onWarning?.(REMOTE_SESSION_WARNING);
    }
  }

  const client = await connect(endpoint, { onProgress: options.onProgress });
  try {
    return await action(client);
  } finally {
    await client.close();
  }
}
