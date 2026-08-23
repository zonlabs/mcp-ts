import { execSync, spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { authConfigDir } from "./auth-store.js";
import { pingGateway } from "./context.js";

export interface DaemonInfo {
  pid: number;
  startedAt: number;
  port: number;
}

export interface DaemonStatus {
  state: "stopped" | "starting" | "running" | "external" | "occupied" | "unhealthy";
  managed: boolean;
  running: boolean;
  pid?: number;
  startedAt?: number;
  port?: number;
  uptimeSeconds?: number;
  pidPath: string;
  logPath: string;
  gatewayResponsive: boolean;
  portOwnerPid?: number;
}

export interface DaemonStatusInput {
  requestedPort: number;
  pidRecord: DaemonInfo | null;
  pidAlive: boolean;
  portOwnerPid: number | null;
  gatewayResponsive: boolean;
  now: number;
}

export function classifyDaemonStatus(input: DaemonStatusInput): Omit<DaemonStatus, "pidPath" | "logPath"> {
  const port = input.pidRecord?.port ?? input.requestedPort;
  const pidMatchesOwner = Boolean(
    input.pidRecord && input.pidAlive && input.portOwnerPid === input.pidRecord.pid,
  );
  const base = {
    port,
    gatewayResponsive: input.gatewayResponsive,
    ...(input.portOwnerPid ? { portOwnerPid: input.portOwnerPid } : {}),
  };
  if (pidMatchesOwner && input.gatewayResponsive) {
    return {
      ...base,
      state: "running",
      managed: true,
      running: true,
      pid: input.pidRecord!.pid,
      startedAt: input.pidRecord!.startedAt,
      uptimeSeconds: Math.max(0, Math.floor((input.now - input.pidRecord!.startedAt) / 1000)),
    };
  }
  if (pidMatchesOwner && input.now - input.pidRecord!.startedAt < 15_000) {
    return { ...base, state: "starting", managed: true, running: false, pid: input.pidRecord!.pid, startedAt: input.pidRecord!.startedAt };
  }
  if (input.gatewayResponsive) {
    return { ...base, state: "external", managed: false, running: true };
  }
  if (input.portOwnerPid) {
    return { ...base, state: "occupied", managed: false, running: false };
  }
  if (input.pidRecord && input.pidAlive) {
    return { ...base, state: "unhealthy", managed: false, running: false, pid: input.pidRecord.pid, startedAt: input.pidRecord.startedAt };
  }
  return { ...base, state: "stopped", managed: false, running: false };
}

export function validateManagedStop(
  record: DaemonInfo | null,
  pidAlive: boolean,
  portOwnerPid: number | null,
): { allowed: boolean; reason?: string } {
  if (!record || !pidAlive) return { allowed: false };
  if (portOwnerPid !== record.pid) {
    return {
      allowed: false,
      reason: `Refused to stop PID ${record.pid}: port ${record.port} is owned by ${portOwnerPid ?? "no process"}.`,
    };
  }
  return { allowed: true };
}

export function getDaemonDir(): string {
  return authConfigDir();
}

export function getDaemonPidPath(): string {
  return join(getDaemonDir(), "daemon.pid");
}

export function getDaemonLogPath(): string {
  return join(getDaemonDir(), "daemon.log");
}

/**
 * If running in background daemon mode (MCPA_DAEMON === "1"), redirects stdout and stderr to daemon.log.
 */
export function setupDaemonLogging(): void {
  if (process.env.MCPA_DAEMON !== "1") return;
  const dir = getDaemonDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const logStream = createWriteStream(getDaemonLogPath(), { flags: "a" });
  const writeOut = (chunk: unknown, encoding?: unknown, callback?: unknown) => {
    return logStream.write(chunk as any, encoding as any, callback as any);
  };
  process.stdout.write = writeOut as any;
  process.stderr.write = writeOut as any;
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    return code === "EPERM";
  }
}

export function readDaemonPid(): DaemonInfo | null {
  const pidPath = getDaemonPidPath();
  if (!existsSync(pidPath)) {
    return null;
  }

  try {
    const raw = readFileSync(pidPath, "utf8").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.pid === "number") {
      return parsed as DaemonInfo;
    }
  } catch {
    // If invalid JSON, try reading single integer PID
    try {
      const raw = readFileSync(pidPath, "utf8").trim();
      const num = parseInt(raw, 10);
      if (!isNaN(num)) {
        return { pid: num, startedAt: Date.now(), port: 8765 };
      }
    } catch {
      // Ignore
    }
  }
  return null;
}

export function writeDaemonPid(info: DaemonInfo): void {
  const dir = getDaemonDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const pidPath = getDaemonPidPath();
  writeFileSync(pidPath, JSON.stringify(info, null, 2), "utf8");
}

export function clearDaemonPid(): void {
  const pidPath = getDaemonPidPath();
  if (existsSync(pidPath)) {
    try {
      unlinkSync(pidPath);
    } catch {
      // Ignore removal error
    }
  }
}

export function getCliBinPath(): string {
  if (
    process.argv[1] &&
    existsSync(process.argv[1]) &&
    (process.argv[1].endsWith("mcp-ts.js") || process.argv[1].endsWith("mcpa.js"))
  ) {
    return resolve(process.argv[1]);
  }

  const candidates = [
    fileURLToPath(new URL("./bin/mcp-ts.js", import.meta.url)),
    fileURLToPath(new URL("./mcp-ts.js", import.meta.url)),
    fileURLToPath(new URL("../bin/mcp-ts.js", import.meta.url)),
    fileURLToPath(new URL("../dist/bin/mcp-ts.js", import.meta.url)),
    fileURLToPath(new URL("../../dist/bin/mcp-ts.js", import.meta.url)),
    resolve(process.cwd(), "dist/bin/mcp-ts.js"),
    resolve(process.cwd(), "packages/cli/dist/bin/mcp-ts.js"),
  ];
  for (const p of candidates) {
    if (existsSync(p) && p.endsWith("mcp-ts.js")) return resolve(p);
  }
  return resolve(candidates[0]);
}

/**
 * Spawns the MCP gateway as a detached, unreferenced background process.
 */
export async function spawnDaemon(options: {
  port?: number;
  verbose?: boolean;
  token?: string;
  url?: string;
} = {}): Promise<{ pid: number; port: number; logPath: string; reused?: boolean; managed?: boolean }> {
  const port = options.port ?? 8765;
  const status = await getDaemonStatus(port);
  if (status.state === "running" || status.state === "external") {
    return {
      pid: status.pid ?? status.portOwnerPid!,
      port: status.port ?? port,
      logPath: status.logPath,
      reused: true,
      managed: status.managed,
    };
  }
  if (status.state === "occupied") {
    throw new Error(`Port ${port} is occupied by PID ${status.portOwnerPid}. Use --port <available-port>; this process will not be stopped or adopted.`);
  }
  if (status.state === "starting") {
    throw new Error(`Daemon PID ${status.pid} is still starting on port ${status.port}.`);
  }
  if (status.state === "unhealthy") {
    throw new Error(`Managed PID record ${status.pid} is alive but unhealthy. Inspect ${status.logPath}; it will not be replaced automatically.`);
  }

  // Clear stale PID if previous process died
  clearDaemonPid();

  // Determine CLI entrypoint
  const binPath = getCliBinPath();

  const args = ["serve"];
  if (options.port) args.push("--port", String(options.port));
  if (options.verbose) args.push("--verbose");
  if (options.url) args.push("--remote", options.url);

  const child = spawn(process.execPath, [binPath, ...args], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    cwd: process.cwd(),
    env: {
      ...process.env,
      MCPA_DAEMON: "1",
    },
  });

  const pid = child.pid;
  if (!pid) {
    throw new Error("Failed to spawn background daemon process.");
  }

  child.unref();

  const info: DaemonInfo = {
    pid,
    startedAt: Date.now(),
    port,
  };
  writeDaemonPid(info);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) break;
    const [endpoint, owner] = await Promise.all([
      pingGateway("127.0.0.1", port, "/mcp", 300),
      Promise.resolve(findProcessOnPort(port)),
    ]);
    if (endpoint && owner === pid) {
      return { pid, port, logPath: getDaemonLogPath(), managed: true };
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  if (isProcessAlive(pid)) {
    try { process.kill(pid, "SIGTERM"); } catch { /* spawned process already exited */ }
    const terminateDeadline = Date.now() + 1_000;
    while (isProcessAlive(pid) && Date.now() < terminateDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (isProcessAlive(pid)) {
      try { process.kill(pid, "SIGKILL"); } catch { /* spawned process already exited */ }
    }
  }
  clearDaemonPid();
  throw new Error(`Daemon failed to become healthy within 15 seconds. See ${getDaemonLogPath()}`);
}

/**
 * Finds the PID of any process currently bound to the given TCP port.
 */
export function findProcessOnPort(port: number): number | null {
  try {
    if (process.platform === "win32") {
      const output = execSync(`netstat -ano -p tcp`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const lines = output.split(/\r?\n/);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        // Format: TCP  127.0.0.1:8765  0.0.0.0:0  LISTENING  16324
        if (parts.length >= 5 && parts[0] === "TCP" && parts[3] === "LISTENING") {
          const localAddr = parts[1];
          if (localAddr.endsWith(`:${port}`)) {
            const pid = parseInt(parts[4], 10);
            if (!isNaN(pid) && pid > 0) return pid;
          }
        }
      }
    } else {
      const output = execSync(`lsof -ti:${port}`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      const pid = parseInt(output.split(/\s+/)[0], 10);
      if (!isNaN(pid) && pid > 0) return pid;
    }
  } catch {
    // Port not in use or command unavailable
  }
  return null;
}

/**
 * Stops the background daemon process if active.
 */
export async function stopDaemon(port = 8765): Promise<{ stopped: boolean; pid?: number; reason?: string }> {
  const current = readDaemonPid();
  const alive = Boolean(current && isProcessAlive(current.pid));
  if (!current || !alive) {
    if (current) clearDaemonPid();
    return { stopped: false };
  }
  const effectivePort = current.port || port;
  const portOwnerPid = findProcessOnPort(effectivePort);
  const validation = validateManagedStop(current, alive, portOwnerPid);
  if (!validation.allowed) {
    clearDaemonPid();
    return {
      stopped: false,
      pid: current.pid,
      reason: validation.reason,
    };
  }
  const pid = current.pid;

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGINT");
    } catch {
      // Process already terminated
    }
  }

  // Poll for exit up to 2 seconds
  const start = Date.now();
  while (Date.now() - start < 2000) {
    if (!isProcessAlive(pid)) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  // Force kill if still lingering
  if (isProcessAlive(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Ignore
    }
  }

  clearDaemonPid();
  return { stopped: true, pid };
}

/**
 * Checks the running status of the background daemon.
 */
export async function getDaemonStatus(port = 8765): Promise<DaemonStatus> {
  const pidPath = getDaemonPidPath();
  const logPath = getDaemonLogPath();
  const current = readDaemonPid();

  const pidAlive = Boolean(current && isProcessAlive(current.pid));
  if (current && !pidAlive) clearDaemonPid();
  const effectivePort = current?.port || port;
  const [endpoint, portOwnerPid] = await Promise.all([
    pingGateway("127.0.0.1", effectivePort, "/mcp", 1_000),
    Promise.resolve(findProcessOnPort(effectivePort)),
  ]);
  return {
    ...classifyDaemonStatus({
      requestedPort: port,
      pidRecord: current,
      pidAlive,
      portOwnerPid,
      gatewayResponsive: endpoint !== null,
      now: Date.now(),
    }),
    pidPath,
    logPath,
  };
}

/**
 * Reads the last N lines from the daemon log file.
 */
export function readDaemonLogs(maxLines = 50): string {
  const logPath = getDaemonLogPath();
  if (!existsSync(logPath)) {
    return "(No daemon logs found yet)";
  }

  try {
    const text = readFileSync(logPath, "utf8");
    const rawLines = text.split(/\r?\n/);
    while (rawLines.length > 0 && rawLines[rawLines.length - 1].trim() === "") {
      rawLines.pop();
    }
    const sliced = rawLines.slice(-maxLines);
    return sliced.join("\n") || "(Log file is empty)";
  } catch (err) {
    return `Error reading log file: ${(err as Error).message}`;
  }
}
