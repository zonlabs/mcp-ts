import { execFileSync, execSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  linkSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { authConfigDir } from "./auth-store.js";
import { pingGateway } from "./context.js";

const GATEWAY_STARTUP_TIMEOUT_MS = 15_000;
const GATEWAY_POLL_INTERVAL_MS = 150;
const PROCESS_CLAIM_TIMEOUT_MS = 1_000;
const PROCESS_CLAIM_POLL_INTERVAL_MS = 10;
const FORCE_EXIT_WAIT_MS = 250;

export interface GatewayProcessInfo {
  pid: number;
  startedAt: number;
  port: number;
  mode: "foreground" | "daemon";
}

interface GatewayStartLock {
  pid: number;
  createdAt: number;
  sentinelName: string;
}

type GatewayLockFile = Omit<GatewayStartLock, "sentinelName">;

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
  processRecord: GatewayProcessInfo | null;
  processAlive: boolean;
  portOwnerPid: number | null;
  gatewayResponsive: boolean;
  now: number;
}

export function classifyDaemonStatus(input: DaemonStatusInput): Omit<DaemonStatus, "pidPath" | "logPath"> {
  const port = input.processRecord?.port ?? input.requestedPort;
  const pidMatchesOwner = Boolean(
    input.processRecord && input.processAlive && input.portOwnerPid === input.processRecord.pid,
  );
  const managed = Boolean(input.processRecord?.mode === "daemon" && pidMatchesOwner);
  const base = {
    port,
    gatewayResponsive: input.gatewayResponsive,
    ...(input.portOwnerPid ? { portOwnerPid: input.portOwnerPid } : {}),
  };

  if (pidMatchesOwner && input.gatewayResponsive) {
    if (input.processRecord!.mode === "foreground") {
      return {
        ...base,
        state: "external",
        managed: false,
        running: true,
        pid: input.processRecord!.pid,
        startedAt: input.processRecord!.startedAt,
        uptimeSeconds: Math.max(0, Math.floor((input.now - input.processRecord!.startedAt) / 1000)),
      };
    }
    return {
      ...base,
      state: "running",
      managed,
      running: true,
      pid: input.processRecord!.pid,
      startedAt: input.processRecord!.startedAt,
      uptimeSeconds: Math.max(0, Math.floor((input.now - input.processRecord!.startedAt) / 1000)),
    };
  }

  if (
    input.processRecord?.mode === "daemon"
    && input.processAlive
    && input.now - input.processRecord.startedAt < GATEWAY_STARTUP_TIMEOUT_MS
  ) {
    return {
      ...base,
      state: "starting",
      managed,
      running: false,
      pid: input.processRecord.pid,
      startedAt: input.processRecord.startedAt,
    };
  }

  if (input.gatewayResponsive) {
    return { ...base, state: "external", managed: false, running: true };
  }
  if (input.portOwnerPid) {
    return { ...base, state: "occupied", managed: false, running: false };
  }
  if (input.processRecord && input.processAlive) {
    return {
      ...base,
      state: "unhealthy",
      managed: false,
      running: false,
      pid: input.processRecord.pid,
      startedAt: input.processRecord.startedAt,
    };
  }
  return { ...base, state: "stopped", managed: false, running: false };
}

export function validateManagedStop(
  record: GatewayProcessInfo | null,
  processAlive: boolean,
  portOwnerPid: number | null,
): { allowed: boolean; reason?: string } {
  if (record?.mode === "foreground") {
    return {
      allowed: false,
      reason: `Refused to stop PID ${record.pid}: the gateway process record is foreground-owned.`,
    };
  }
  if (!record || !processAlive) return { allowed: false };
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

export function getGatewayProcessPath(): string {
  return join(getDaemonDir(), "gateway-process.json");
}

function getGatewayStartLockPath(): string {
  return join(getDaemonDir(), "gateway-start.lock");
}

function getGatewayProcessLockPath(): string {
  return join(getDaemonDir(), "gateway-process.lock");
}

export function getDaemonLogPath(): string {
  return join(getDaemonDir(), "daemon.log");
}

function ensureDaemonDir(): void {
  const dir = getDaemonDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function isGatewayProcessInfo(value: unknown): value is GatewayProcessInfo {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return Number.isInteger(record.pid)
    && (record.pid as number) > 0
    && typeof record.startedAt === "number"
    && Number.isFinite(record.startedAt)
    && Number.isInteger(record.port)
    && (record.port as number) > 0
    && (record.port as number) <= 65_535
    && (record.mode === "foreground" || record.mode === "daemon");
}

export function readGatewayProcess(): GatewayProcessInfo | null {
  const processPath = getGatewayProcessPath();
  if (!existsSync(processPath)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(processPath, "utf8"));
    return isGatewayProcessInfo(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeGatewayProcess(info: GatewayProcessInfo): void {
  ensureDaemonDir();
  const processPath = getGatewayProcessPath();
  const temporaryPath = `${processPath}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(info, null, 2), "utf8");
  try {
    withGatewayProcessLock(() => {
      while (true) {
        try {
          linkSync(temporaryPath, processPath);
          return;
        } catch (error: unknown) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        }

        const current = readGatewayProcess();
        if (!current) {
          if (!existsSync(processPath)) continue;
          throw new Error(`Refused to replace an invalid gateway process record at ${processPath}.`);
        }
        if (current.pid === info.pid) return;
        if (isProcessAlive(current.pid)) {
          throw new Error(
            `Gateway process record is owned by live PID ${current.pid} on port ${current.port}; it will not be overwritten.`,
          );
        }
        try {
          unlinkSync(processPath);
        } catch (error: unknown) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
    });
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

export function clearGatewayProcess(expectedPid: number): boolean {
  return withGatewayProcessLock(() => {
    const current = readGatewayProcess();
    if (!current || current.pid !== expectedPid) return false;
    try {
      unlinkSync(getGatewayProcessPath());
      return true;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  });
}

function isGatewayStartLock(value: unknown): value is GatewayLockFile {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return Number.isInteger(record.pid)
    && (record.pid as number) > 0
    && typeof record.createdAt === "number"
    && Number.isFinite(record.createdAt);
}

function readGatewayLock(lockPath: string): GatewayStartLock | null {
  try {
    const entries = readdirSync(lockPath, { withFileTypes: true });
    if (entries.length !== 1 || !entries[0].isFile()) return null;
    const sentinelName = entries[0].name;
    const parsed: unknown = JSON.parse(readFileSync(join(lockPath, sentinelName), "utf8"));
    return isGatewayStartLock(parsed) ? { ...parsed, sentinelName } : null;
  } catch {
    return null;
  }
}

function createGatewayLock(lockPath: string): GatewayStartLock {
  ensureDaemonDir();
  const lockFile = { pid: process.pid, createdAt: Date.now() };
  const generation = randomUUID();
  const sentinelName = `${generation}.json`;
  const temporaryPath = `${lockPath}.${process.pid}.${generation}.tmp`;
  const sentinelPath = join(temporaryPath, sentinelName);
  mkdirSync(temporaryPath);
  try {
    writeFileSync(sentinelPath, JSON.stringify(lockFile), { encoding: "utf8", flag: "wx" });
    try {
      renameSync(temporaryPath, lockPath);
    } catch (error: unknown) {
      if (!existsSync(lockPath)) throw error;
      const occupied = new Error(`Gateway lock already exists at ${lockPath}.`) as NodeJS.ErrnoException;
      occupied.code = "EEXIST";
      throw occupied;
    }
  } finally {
    try {
      unlinkSync(sentinelPath);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      rmdirSync(temporaryPath);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return { ...lockFile, sentinelName };
}

function clearGatewayLock(lockPath: string, expected: GatewayStartLock): boolean {
  try {
    unlinkSync(join(lockPath, expected.sentinelName));
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw error;
  }
  try {
    rmdirSync(lockPath);
    return true;
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTEMPTY" || code === "EEXIST") return false;
    throw error;
  }
}

function ownsGatewayLock(lockPath: string, expected: GatewayStartLock): boolean {
  const current = readGatewayLock(lockPath);
  return Boolean(
    current
    && current.pid === expected.pid
    && current.createdAt === expected.createdAt
    && current.sentinelName === expected.sentinelName,
  );
}

function clearInvalidStaleLock(lockPath: string, now: number): boolean {
  try {
    const before = statSync(lockPath);
    if (now - before.mtimeMs <= GATEWAY_STARTUP_TIMEOUT_MS) return false;
    const entries = before.isDirectory() ? readdirSync(lockPath, { withFileTypes: true }) : [];
    const after = statSync(lockPath);
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
    ) {
      return false;
    }
    if (!before.isDirectory()) {
      try {
        unlinkSync(lockPath);
        return true;
      } catch (error: unknown) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "EISDIR" || code === "EPERM") return false;
        throw error;
      }
    }
    if (entries.some((entry) => !entry.isFile())) return false;
    for (const entry of entries) {
      try {
        unlinkSync(join(lockPath, entry.name));
      } catch (error: unknown) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") continue;
        throw error;
      }
    }
    try {
      rmdirSync(lockPath);
      return true;
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTEMPTY" || code === "EEXIST") return false;
      throw error;
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function reclaimGatewayLock(lockPath: string, now: number, reclaimLiveExpired = true): boolean {
  const existing = readGatewayLock(lockPath);
  if (existing) {
    if (isProcessAlive(existing.pid)) {
      if (!reclaimLiveExpired || now - existing.createdAt <= GATEWAY_STARTUP_TIMEOUT_MS) return false;
    }
    return clearGatewayLock(lockPath, existing);
  }
  return clearInvalidStaleLock(lockPath, now);
}

function synchronousSleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withGatewayProcessLock<T>(action: () => T): T {
  const lockPath = getGatewayProcessLockPath();
  const deadline = Date.now() + PROCESS_CLAIM_TIMEOUT_MS;
  let lock: GatewayStartLock | null = null;
  while (!lock && Date.now() < deadline) {
    try {
      lock = createGatewayLock(lockPath);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (reclaimGatewayLock(lockPath, Date.now(), false)) continue;
      synchronousSleep(PROCESS_CLAIM_POLL_INTERVAL_MS);
    }
  }
  if (!lock) throw new Error("Timed out while claiming the gateway process record.");
  try {
    return action();
  } finally {
    clearGatewayLock(lockPath, lock);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * If running in background daemon mode (MCPA_DAEMON === "1"), redirects stdout and stderr to daemon.log.
 */
export function setupDaemonLogging(): void {
  if (process.env.MCPA_DAEMON !== "1") return;
  ensureDaemonDir();
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
  } catch (error: unknown) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function getCliBinPath(): string {
  if (
    process.argv[1]
    && existsSync(process.argv[1])
    && (process.argv[1].endsWith("mcp-ts.js") || process.argv[1].endsWith("mcpa.js"))
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
  for (const path of candidates) {
    if (existsSync(path) && path.endsWith("mcp-ts.js")) return resolve(path);
  }
  return resolve(candidates[0]);
}

function daemonResultFromStatus(
  status: DaemonStatus,
  fallbackPort: number,
): { pid: number; port: number; logPath: string; reused: true; managed: boolean } {
  const pid = status.pid ?? status.portOwnerPid;
  if (!pid) {
    throw new Error(`Gateway on port ${status.port ?? fallbackPort} is healthy, but its owning PID could not be determined.`);
  }
  return {
    pid,
    port: status.port ?? fallbackPort,
    logPath: status.logPath,
    reused: true,
    managed: status.managed,
  };
}

function throwIfStartBlocked(status: DaemonStatus): void {
  if (status.state === "occupied") {
    throw new Error(
      `Port ${status.port} is occupied by PID ${status.portOwnerPid}. Use --port <available-port>; this process will not be stopped or adopted.`,
    );
  }
  if (status.state === "unhealthy") {
    throw new Error(
      `Gateway process record ${status.pid} is alive but unhealthy. Inspect ${status.logPath}; it will not be replaced automatically.`,
    );
  }
}

async function terminateProcess(pid: number, waitMs: number): Promise<boolean> {
  let forceIssued = false;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } catch {
      // Liveness is checked below; taskkill can fail if the process exited first.
    }
    forceIssued = true;
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      try {
        process.kill(pid, "SIGINT");
      } catch {
        return !isProcessAlive(pid);
      }
    }
    const gracefulDeadline = Date.now() + waitMs;
    while (isProcessAlive(pid) && Date.now() < gracefulDeadline) {
      await sleep(50);
    }
    if (isProcessAlive(pid)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Process exited after the final liveness check.
      }
      forceIssued = true;
    }
  }

  if (forceIssued) {
    const forceDeadline = Date.now() + FORCE_EXIT_WAIT_MS;
    while (isProcessAlive(pid) && Date.now() < forceDeadline) {
      await sleep(25);
    }
  }
  return !isProcessAlive(pid);
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
  const deadline = Date.now() + GATEWAY_STARTUP_TIMEOUT_MS;
  let status = await getDaemonStatus(port);
  if (status.state === "running" || status.state === "external") {
    return daemonResultFromStatus(status, port);
  }
  throwIfStartBlocked(status);

  let ownedLock: GatewayStartLock | null = null;
  const startupLockPath = getGatewayStartLockPath();
  while (!ownedLock && Date.now() < deadline) {
    try {
      ownedLock = createGatewayLock(startupLockPath);
      break;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }

    if (reclaimGatewayLock(startupLockPath, Date.now())) continue;

    status = await getDaemonStatus(port);
    if (status.state === "running" || status.state === "external") {
      return daemonResultFromStatus(status, port);
    }
    await sleep(GATEWAY_POLL_INTERVAL_MS);
  }

  if (!ownedLock) {
    throw new Error("Gateway failed to become healthy within 15 seconds while another startup was in progress.");
  }

  let spawnedPid: number | null = null;
  try {
    status = await getDaemonStatus(port);
    if (status.state === "running" || status.state === "external") {
      return daemonResultFromStatus(status, port);
    }
    throwIfStartBlocked(status);

    while (status.state === "starting" && Date.now() < deadline) {
      await sleep(GATEWAY_POLL_INTERVAL_MS);
      status = await getDaemonStatus(port);
      if (status.state === "running" || status.state === "external") {
        return daemonResultFromStatus(status, port);
      }
      throwIfStartBlocked(status);
    }
    if (status.state === "starting") {
      throw new Error(`Gateway failed to become healthy within 15 seconds. See ${status.logPath}`);
    }
    if (!ownsGatewayLock(startupLockPath, ownedLock)) {
      throw new Error("Lost gateway startup lock ownership before spawning the daemon.");
    }

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

    if (!child.pid) throw new Error("Failed to spawn background daemon process.");
    spawnedPid = child.pid;
    child.unref();
    if (!ownsGatewayLock(startupLockPath, ownedLock)) {
      await terminateProcess(spawnedPid, 1_000);
      if (!isProcessAlive(spawnedPid)) clearGatewayProcess(spawnedPid);
      throw new Error("Lost gateway startup lock ownership while spawning the daemon.");
    }
    try {
      writeGatewayProcess({
        pid: spawnedPid,
        startedAt: Date.now(),
        port,
        mode: "daemon",
      });
    } catch (cause) {
      await terminateProcess(spawnedPid, 1_000);
      if (!isProcessAlive(spawnedPid)) clearGatewayProcess(spawnedPid);
      throw cause;
    }

    while (Date.now() < deadline) {
      status = await getDaemonStatus(port);
      if (status.state === "running" && status.pid === spawnedPid && status.managed) {
        return { pid: spawnedPid, port, logPath: getDaemonLogPath(), managed: true };
      }
      if (!isProcessAlive(spawnedPid)) break;
      await sleep(GATEWAY_POLL_INTERVAL_MS);
    }

    await terminateProcess(spawnedPid, 1_000);
    if (!isProcessAlive(spawnedPid)) clearGatewayProcess(spawnedPid);
    throw new Error(`Daemon failed to become healthy within 15 seconds. See ${getDaemonLogPath()}`);
  } finally {
    clearGatewayLock(startupLockPath, ownedLock);
  }
}

/**
 * Finds the PID of any process currently bound to the given TCP port.
 */
export function findProcessOnPort(port: number): number | null {
  try {
    if (process.platform === "win32") {
      const output = execSync("netstat -ano -p tcp", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      for (const line of output.split(/\r?\n/)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[0] === "TCP" && parts[3] === "LISTENING") {
          if (parts[1].endsWith(`:${port}`)) {
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
    // Port not in use or command unavailable.
  }
  return null;
}

/**
 * Stops the background daemon process if active and if it owns its recorded port.
 */
export async function stopDaemon(port = 8765): Promise<{ stopped: boolean; pid?: number; reason?: string }> {
  const current = readGatewayProcess();
  const alive = Boolean(current && isProcessAlive(current.pid));
  if (!current || !alive) {
    if (current) clearGatewayProcess(current.pid);
    return { stopped: false };
  }

  const effectivePort = current.port ?? port;
  const validation = validateManagedStop(current, alive, findProcessOnPort(effectivePort));
  if (!validation.allowed) {
    return {
      stopped: false,
      pid: current.pid,
      reason: validation.reason,
    };
  }

  const stopped = await terminateProcess(current.pid, 2_000);
  if (!stopped) {
    return {
      stopped: false,
      pid: current.pid,
      reason: `Daemon PID ${current.pid} is still running; its process record was preserved.`,
    };
  }
  clearGatewayProcess(current.pid);
  return { stopped: true, pid: current.pid };
}

/**
 * Checks the running status of the foreground or background gateway.
 */
export async function getDaemonStatus(port = 8765): Promise<DaemonStatus> {
  const pidPath = getGatewayProcessPath();
  const logPath = getDaemonLogPath();
  let current = readGatewayProcess();
  let processAlive = Boolean(current && isProcessAlive(current.pid));
  if (current && !processAlive) {
    clearGatewayProcess(current.pid);
    current = readGatewayProcess();
    processAlive = Boolean(current && isProcessAlive(current.pid));
  }
  const effectivePort = current?.port ?? port;
  const [endpoint, portOwnerPid] = await Promise.all([
    pingGateway("127.0.0.1", effectivePort, "/mcp", 1_000),
    Promise.resolve(findProcessOnPort(effectivePort)),
  ]);
  return {
    ...classifyDaemonStatus({
      requestedPort: port,
      processRecord: current,
      processAlive,
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
  if (!existsSync(logPath)) return "(No daemon logs found yet)";
  try {
    const lines = readFileSync(logPath, "utf8").split(/\r?\n/);
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
    return lines.slice(-maxLines).join("\n") || "(Log file is empty)";
  } catch (error) {
    return `Error reading log file: ${(error as Error).message}`;
  }
}
