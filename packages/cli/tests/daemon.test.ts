import { execFileSync, execSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { getGatewayHealth } from "../src/gateway/context.js";
import {
  classifyDaemonStatus,
  clearGatewayProcess as clearGatewayProcessRecord,
  getDaemonStatus,
  getGatewayProcessPath,
  readDaemonLogs,
  readGatewayProcess,
  reclaimInvalidGatewayProcess,
  spawnDaemon,
  stopDaemon,
  validateManagedStop,
  writeGatewayProcess as writeGatewayProcessRecord,
  type GatewayProcessInfo,
} from "../src/gateway/daemon.js";
import { cmdDaemon } from "../src/commands/daemon.js";

const filesystemInterleaving = vi.hoisted(() => ({
  beforeUnlink: undefined as undefined | ((path: string) => void),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    unlinkSync(path: Parameters<typeof actual.unlinkSync>[0]) {
      filesystemInterleaving.beforeUnlink?.(String(path));
      return actual.unlinkSync(path);
    },
  };
});

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock("../src/gateway/context.js", () => ({
  getGatewayHealth: vi.fn(),
}));

const mockedExecFileSync = vi.mocked(execFileSync);
const mockedExecSync = vi.mocked(execSync);
const mockedGatewayHealth = vi.mocked(getGatewayHealth);
const mockedSpawn = vi.mocked(spawn);
const originalConfigDir = process.env.MCPA_CONFIG_DIR;
let configDir: string;
const PROCESS_GENERATION = "11111111-1111-4111-8111-111111111111";

function writeGatewayProcess(info: Omit<GatewayProcessInfo, "generation"> & { generation?: string }): void {
  writeGatewayProcessRecord({ generation: PROCESS_GENERATION, ...info });
}

function clearGatewayProcess(pid: number, generation?: string): boolean {
  return clearGatewayProcessRecord(
    pid,
    generation ?? readGatewayProcess()?.generation ?? PROCESS_GENERATION,
  );
}

function healthFromRecord() {
  const record = readGatewayProcess();
  return record ? {
    status: "ok" as const,
    pid: record.pid,
    port: record.port,
    mode: record.mode,
    generation: record.generation,
  } : null;
}

function leaseGeneration(label: string): string {
  const suffix = [...label].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 0);
  return `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
}

function publishTestLease(lockPath: string, pid: number, createdAt: number, generation: string): string {
  const temporaryPath = `${lockPath}.${generation}.tmp`;
  const sentinelName = `${leaseGeneration(generation)}.json`;
  rmSync(temporaryPath, { recursive: true, force: true });
  mkdirSync(temporaryPath);
  writeFileSync(join(temporaryPath, sentinelName), JSON.stringify({ pid, createdAt }), "utf8");
  renameSync(temporaryPath, lockPath);
  return join(lockPath, sentinelName);
}

function replaceTestLease(lockPath: string, pid: number, createdAt: number, generation: string): string {
  rmSync(lockPath, { recursive: true, force: true });
  return publishTestLease(lockPath, pid, createdAt, generation);
}

function clearOwnedRecord(): void {
  const current = readGatewayProcess();
  if (current) clearGatewayProcess(current.pid);
}

describe("MCP Gateway daemon subsystem", () => {
  beforeAll(() => {
    configDir = mkdtempSync(join(tmpdir(), "mcpa-daemon-test-"));
    process.env.MCPA_CONFIG_DIR = configDir;
  });

  afterEach(() => {
    filesystemInterleaving.beforeUnlink = undefined;
    rmSync(join(configDir, "gateway-start.lock"), { recursive: true, force: true });
    rmSync(join(configDir, "gateway-process.lock"), { recursive: true, force: true });
    clearOwnedRecord();
    rmSync(getGatewayProcessPath(), { force: true });
    mockedExecFileSync.mockReset();
    mockedExecSync.mockReset();
    mockedGatewayHealth.mockReset();
    mockedSpawn.mockReset();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    if (originalConfigDir === undefined) delete process.env.MCPA_CONFIG_DIR;
    else process.env.MCPA_CONFIG_DIR = originalConfigDir;
    rmSync(configDir, { recursive: true, force: true });
  });

  test("writes, reads, and clears an owned gateway process record", () => {
    writeGatewayProcess({ pid: 12345, startedAt: Date.now(), port: 8765, mode: "daemon" });
    const info = readGatewayProcess();
    expect(info).toMatchObject({ pid: 12345, port: 8765, mode: "daemon" });

    expect(clearGatewayProcess(12345)).toBe(true);
    expect(readGatewayProcess()).toBeNull();
  });

  test("clearGatewayProcess removes only the caller-owned record", () => {
    writeGatewayProcess({ pid: 1234, port: 8765, startedAt: 1, mode: "daemon" });
    expect(clearGatewayProcess(9999)).toBe(false);
    expect(readGatewayProcess()?.pid).toBe(1234);
    expect(clearGatewayProcess(1234)).toBe(true);
  });

  test("accepts the same process claim without overwriting its published record", () => {
    writeGatewayProcess({ pid: 1234, port: 8765, startedAt: 1, mode: "daemon" });
    writeGatewayProcess({ pid: 1234, port: 9123, startedAt: 2, mode: "daemon" });

    expect(readGatewayProcess()).toEqual({
      pid: 1234,
      port: 8765,
      startedAt: 1,
      mode: "daemon",
      generation: PROCESS_GENERATION,
    });
  });

  test("refuses a same-PID process claim from another generation", () => {
    writeGatewayProcess({ pid: 1234, port: 8765, startedAt: 1, mode: "daemon" });
    vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: NodeJS.Signals | number) => {
      if (pid === 1234 && signal === 0) return true;
      throw new Error(`Unexpected process probe for PID ${pid}.`);
    }) as typeof process.kill);

    expect(() => writeGatewayProcessRecord({
      pid: 1234,
      port: 9123,
      startedAt: 2,
      mode: "foreground",
      generation: "22222222-2222-4222-8222-222222222222",
    })).toThrow(/live PID 1234/i);

    expect(readGatewayProcess()).toEqual({
      pid: 1234,
      port: 8765,
      startedAt: 1,
      mode: "daemon",
      generation: PROCESS_GENERATION,
    });
  });

  test("reclaims a legacy process record only after proving its PID and port are unused", async () => {
    const processPath = getGatewayProcessPath();
    writeFileSync(processPath, JSON.stringify({
      pid: 1234,
      port: 9123,
      startedAt: 1,
      mode: "daemon",
    }), "utf8");
    vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: NodeJS.Signals | number) => {
      expect(pid).toBe(1234);
      expect(signal).toBe(0);
      const error = new Error("not running") as NodeJS.ErrnoException;
      error.code = "ESRCH";
      throw error;
    }) as typeof process.kill);
    mockedGatewayHealth.mockResolvedValue(null);
    mockedExecSync.mockReturnValue("");

    await expect(reclaimInvalidGatewayProcess()).resolves.toBe(true);
    expect(existsSync(processPath)).toBe(false);
  });

  test("preserves an invalid process record when its PID is still live", async () => {
    const processPath = getGatewayProcessPath();
    const invalidRecord = JSON.stringify({
      pid: 1234,
      port: 9123,
      startedAt: 1,
      mode: "daemon",
    });
    writeFileSync(processPath, invalidRecord, "utf8");
    vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: NodeJS.Signals | number) => {
      if (pid === 1234 && signal === 0) return true;
      throw new Error(`Unexpected process probe for PID ${pid}.`);
    }) as typeof process.kill);

    await expect(reclaimInvalidGatewayProcess()).rejects.toThrow(/live PID 1234/i);
    expect(readFileSync(processPath, "utf8")).toBe(invalidRecord);
    expect(mockedGatewayHealth).not.toHaveBeenCalled();
  });

  test("preserves a malformed process record whose ownership cannot be established", async () => {
    const processPath = getGatewayProcessPath();
    writeFileSync(processPath, "not-json", "utf8");

    await expect(reclaimInvalidGatewayProcess()).rejects.toThrow(/ownership cannot be established/i);
    expect(readFileSync(processPath, "utf8")).toBe("not-json");
  });

  test("publishes one authoritative winner with an atomic no-replace claim", () => {
    writeGatewayProcess({ pid: 1111, port: 8765, startedAt: 1, mode: "daemon" });
    const originalKill = process.kill.bind(process);
    vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: NodeJS.Signals | number) => {
      if (pid === 1111) {
        const error = new Error("stale") as NodeJS.ErrnoException;
        error.code = "ESRCH";
        throw error;
      }
      if ((pid === 2222 || pid === 3333) && signal === 0) return true;
      return originalKill(pid, signal as NodeJS.Signals | number | undefined);
    }) as typeof process.kill);

    writeGatewayProcess({ pid: 2222, port: 9122, startedAt: 2, mode: "foreground" });
    expect(() => writeGatewayProcess({
      pid: 3333,
      port: 9123,
      startedAt: 3,
      mode: "daemon",
    })).toThrow(/owned by live PID 2222/i);

    expect(readGatewayProcess()).toMatchObject({ pid: 2222, port: 9122, mode: "foreground" });
  });

  test("stale lease cleanup cannot unlink a newly published lease generation", () => {
    const lockPath = join(configDir, "gateway-process.lock");
    const oldSentinel = publishTestLease(lockPath, 1111, 1, "old-generation");
    const replacementSentinel = join(lockPath, `${leaseGeneration("new-generation")}.json`);
    const originalKill = process.kill.bind(process);
    vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: NodeJS.Signals | number) => {
      if (pid === 1111) {
        const error = new Error("stale") as NodeJS.ErrnoException;
        error.code = "ESRCH";
        throw error;
      }
      if (pid === 2222 && signal === 0) return true;
      return originalKill(pid, signal as NodeJS.Signals | number | undefined);
    }) as typeof process.kill);

    filesystemInterleaving.beforeUnlink = (path) => {
      if (path !== oldSentinel) return;
      filesystemInterleaving.beforeUnlink = undefined;
      replaceTestLease(lockPath, 2222, Date.now(), "new-generation");
    };

    expect(() => writeGatewayProcess({
      pid: 3333,
      port: 9333,
      startedAt: 3,
      mode: "daemon",
    })).toThrow(/timed out/i);
    expect(existsSync(replacementSentinel)).toBe(true);
    expect(readdirSync(lockPath)).toEqual([`${leaseGeneration("new-generation")}.json`]);
    expect(readGatewayProcess()).toBeNull();
  });

  test("invalid stale lease recovery never broad-deletes multiple entries", () => {
    const lockPath = join(configDir, "gateway-process.lock");
    mkdirSync(lockPath);
    writeFileSync(join(lockPath, "unexpected-a"), "invalid", "utf8");
    writeFileSync(join(lockPath, "unexpected-b"), "invalid", "utf8");
    utimesSync(lockPath, new Date(1_000), new Date(1_000));
    let now = 20_000;
    vi.spyOn(Date, "now").mockImplementation(() => {
      const current = now;
      now += 100;
      return current;
    });

    expect(() => writeGatewayProcess({
      pid: 3333,
      port: 9333,
      startedAt: 3,
      mode: "daemon",
    })).toThrow(/timed out/i);
    expect(readdirSync(lockPath).sort()).toEqual(["unexpected-a", "unexpected-b"]);
    expect(readGatewayProcess()).toBeNull();
  });

  test("stale record reclaim cannot remove a successor published under a replacement lease", () => {
    const processPath = getGatewayProcessPath();
    const lockPath = join(configDir, "gateway-process.lock");
    writeFileSync(processPath, JSON.stringify({ pid: 1111, port: 9111, startedAt: 1, mode: "daemon", generation: PROCESS_GENERATION }), "utf8");
    const oldSentinel = publishTestLease(lockPath, 1111, 1, "stale-owner");
    const successor = { pid: 2222, port: 9222, startedAt: 2, mode: "foreground", generation: PROCESS_GENERATION } as const;
    const originalKill = process.kill.bind(process);
    vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: NodeJS.Signals | number) => {
      if (pid === 1111) {
        const error = new Error("stale") as NodeJS.ErrnoException;
        error.code = "ESRCH";
        throw error;
      }
      if (pid === 2222 && signal === 0) return true;
      return originalKill(pid, signal as NodeJS.Signals | number | undefined);
    }) as typeof process.kill);

    filesystemInterleaving.beforeUnlink = (path) => {
      if (path !== oldSentinel) return;
      filesystemInterleaving.beforeUnlink = undefined;
      replaceTestLease(lockPath, successor.pid, Date.now(), "successor-owner");
      rmSync(processPath, { force: true });
      writeFileSync(processPath, JSON.stringify(successor), "utf8");
    };

    expect(() => writeGatewayProcess({
      pid: 3333,
      port: 9333,
      startedAt: 3,
      mode: "daemon",
    })).toThrow(/timed out/i);
    expect(readGatewayProcess()).toEqual(successor);
  });

  test("a live process mutex cannot be age-reclaimed between clear and publish", () => {
    const processPath = getGatewayProcessPath();
    const successor = { pid: 2222, port: 9222, startedAt: 2, mode: "foreground", generation: PROCESS_GENERATION } as const;
    writeGatewayProcess({ pid: 1111, port: 9111, startedAt: 1, mode: "daemon" });
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => {
      const current = now;
      if (now >= 20_000) now += 100;
      return current;
    });
    let concurrentError: unknown;
    filesystemInterleaving.beforeUnlink = (path) => {
      if (path !== processPath) return;
      filesystemInterleaving.beforeUnlink = undefined;
      now = 20_000;
      try {
        writeGatewayProcess(successor);
      } catch (error: unknown) {
        concurrentError = error;
      }
    };

    expect(clearGatewayProcess(1111)).toBe(true);
    expect(concurrentError).toEqual(expect.objectContaining({
      message: expect.stringMatching(/timed out/i),
    }));
    expect(readGatewayProcess()).toBeNull();

    writeGatewayProcess(successor);
    expect(readGatewayProcess()).toEqual(successor);
  });

  test("refuses to overwrite a live foreign gateway process record", () => {
    writeGatewayProcess({ pid: 1234, port: 8765, startedAt: 1, mode: "foreground" });
    const originalKill = process.kill.bind(process);
    vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: NodeJS.Signals | number) => {
      if (pid === 1234 && signal === 0) return true;
      return originalKill(pid, signal as NodeJS.Signals | number | undefined);
    }) as typeof process.kill);

    expect(() => writeGatewayProcess({
      pid: 5678,
      port: 9123,
      startedAt: 2,
      mode: "daemon",
    })).toThrow(/owned by live PID 1234/i);
    expect(readGatewayProcess()).toMatchObject({ pid: 1234, port: 8765, mode: "foreground" });
  });

  test("does not read the removed daemon.pid format", () => {
    writeFileSync(
      join(configDir, "daemon.pid"),
      JSON.stringify({ pid: 1234, port: 8765, startedAt: 1 }),
      "utf8",
    );
    expect(readGatewayProcess()).toBeNull();
  });

  test("getDaemonStatus reports running=false when no gateway is active", async () => {
    mockedGatewayHealth.mockResolvedValue(null);
    mockedExecSync.mockReturnValue("");

    const status = await getDaemonStatus(54321);
    expect(status.running).toBe(false);
    expect(status.pidPath).toBe(getGatewayProcessPath());
    expect(status.gatewayResponsive).toBe(false);
    expect(status.state).toBe("stopped");
    expect(status.managed).toBe(false);
  });

  test("uses the requested port after clearing a dead custom-port record", async () => {
    writeGatewayProcess({ pid: 1234, port: 9123, startedAt: 1, mode: "daemon" });
    vi.spyOn(process, "kill").mockImplementation((() => {
      const error = new Error("not running") as NodeJS.ErrnoException;
      error.code = "ESRCH";
      throw error;
    }) as typeof process.kill);
    mockedGatewayHealth.mockResolvedValue(null);
    mockedExecSync.mockReturnValue("");

    const status = await getDaemonStatus(8765);

    expect(mockedGatewayHealth).toHaveBeenCalledWith("127.0.0.1", 8765, 1_000);
    expect(status.port).toBe(8765);
    expect(readGatewayProcess()).toBeNull();
  });

  test("classifies healthy gateways without a process record as external", () => {
    expect(classifyDaemonStatus({
      requestedPort: 8765,
      processRecord: null,
      processAlive: false,
      portOwnerPid: 4321,
      gatewayHealth: {
        status: "ok",
        pid: 4321,
        port: 8765,
        mode: "foreground",
        generation: PROCESS_GENERATION,
      },
      now: 20_000,
    })).toMatchObject({ state: "external", running: true, managed: false, portOwnerPid: 4321 });
  });

  test("classifies a healthy foreground record as external on its custom port", () => {
    expect(classifyDaemonStatus({
      requestedPort: 8765,
      processRecord: { pid: 4321, port: 9123, startedAt: 1, mode: "foreground", generation: PROCESS_GENERATION },
      processAlive: true,
      portOwnerPid: 4321,
      gatewayHealth: {
        status: "ok",
        pid: 4321,
        port: 9123,
        mode: "foreground",
        generation: PROCESS_GENERATION,
      },
      now: 20_000,
    })).toMatchObject({ state: "external", managed: false, port: 9123 });
  });

  test("classifies foreign port owners as occupied", () => {
    expect(classifyDaemonStatus({
      requestedPort: 8765,
      processRecord: null,
      processAlive: false,
      portOwnerPid: 4321,
      gatewayHealth: null,
      now: 20_000,
    })).toMatchObject({ state: "occupied", running: false, managed: false, portOwnerPid: 4321 });
  });

  test("does not treat a reused PID record as managed", () => {
    expect(classifyDaemonStatus({
      requestedPort: 8765,
      processRecord: { pid: 1234, port: 8765, startedAt: 1, mode: "daemon", generation: PROCESS_GENERATION },
      processAlive: true,
      portOwnerPid: 9999,
      gatewayHealth: {
        status: "ok",
        pid: 9999,
        port: 8765,
        mode: "foreground",
        generation: "22222222-2222-4222-8222-222222222222",
      },
      now: 20_000,
    })).toMatchObject({ state: "external", managed: false, portOwnerPid: 9999 });
  });

  test("does not manage or stop a same-PID gateway from another generation", () => {
    const record = {
      pid: 1234,
      port: 8765,
      startedAt: 1,
      mode: "daemon",
      generation: "11111111-1111-4111-8111-111111111111",
    } as const;
    const foregroundHealth = {
      status: "ok",
      pid: 1234,
      port: 8765,
      mode: "foreground",
      generation: "22222222-2222-4222-8222-222222222222",
    } as const;

    expect(classifyDaemonStatus({
      requestedPort: 8765,
      processRecord: record,
      processAlive: true,
      portOwnerPid: 1234,
      gatewayHealth: foregroundHealth,
      now: 20_000,
    } as never)).toMatchObject({ state: "external", managed: false });
    expect(validateManagedStop(record as never, true, 1234, foregroundHealth as never)).toEqual({
      allowed: false,
      reason: expect.stringContaining("generation"),
    });
  });

  test("refuses daemon stop for a foreground gateway record", () => {
    expect(validateManagedStop(
      { pid: 4321, port: 9123, startedAt: 1, mode: "foreground", generation: PROCESS_GENERATION },
      true,
      4321,
      { status: "ok", pid: 4321, port: 9123, mode: "foreground", generation: PROCESS_GENERATION },
    )).toEqual({ allowed: false, reason: expect.stringContaining("foreground") });
  });

  test("refuses to stop a daemon record when another PID owns its port", () => {
    expect(validateManagedStop(
      { pid: 1234, port: 8765, startedAt: 1, mode: "daemon", generation: PROCESS_GENERATION },
      true,
      9999,
      { status: "ok", pid: 1234, port: 8765, mode: "daemon", generation: PROCESS_GENERATION },
    )).toEqual({
      allowed: false,
      reason: "Refused to stop PID 1234: port 8765 is owned by 9999.",
    });
  });

  test("two concurrent cold starts spawn exactly one daemon", async () => {
    const childPid = 24680;
    let spawned = false;
    const originalKill = process.kill.bind(process);
    vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: NodeJS.Signals | number) => {
      if (pid === childPid && signal === 0) return true;
      return originalKill(pid, signal as NodeJS.Signals | number | undefined);
    }) as typeof process.kill);
    mockedSpawn.mockImplementation((() => {
      spawned = true;
      return { pid: childPid, unref: vi.fn() };
    }) as unknown as typeof spawn);
    mockedGatewayHealth.mockImplementation(async () => spawned ? healthFromRecord() : null);
    mockedExecSync.mockImplementation((() => {
      if (!spawned) return "";
      return process.platform === "win32"
        ? `TCP    127.0.0.1:9311    0.0.0.0:0    LISTENING    ${childPid}`
        : String(childPid);
    }) as unknown as typeof execSync);

    const [first, second] = await Promise.all([
      spawnDaemon({ port: 9311 }),
      spawnDaemon({ port: 9311 }),
    ]);

    expect(mockedSpawn).toHaveBeenCalledTimes(1);
    expect([first.reused, second.reused].filter(Boolean)).toHaveLength(1);
    expect(first.pid).toBe(childPid);
    expect(second.pid).toBe(childPid);
  });

  test("reuses a healthy managed daemon without spawning a warm replacement", async () => {
    const childPid = 24688;
    writeGatewayProcess({ pid: childPid, port: 9319, startedAt: 1, mode: "daemon" });
    const originalKill = process.kill.bind(process);
    vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: NodeJS.Signals | number) => {
      if (pid === childPid && signal === 0) return true;
      return originalKill(pid, signal as NodeJS.Signals | number | undefined);
    }) as typeof process.kill);
    mockedGatewayHealth.mockImplementation(async () => healthFromRecord());
    mockedExecSync.mockReturnValue(process.platform === "win32"
      ? `TCP    127.0.0.1:9319    0.0.0.0:0    LISTENING    ${childPid}`
      : String(childPid));

    await expect(spawnDaemon({ port: 9319 })).resolves.toEqual({
      pid: childPid,
      port: 9319,
      logPath: expect.any(String),
      reused: true,
      managed: true,
    });

    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  test("a foreground claim that wins the spawn race is preserved", async () => {
    const foregroundPid = 24684;
    const childPid = 24685;
    let childAlive = true;
    const originalKill = process.kill.bind(process);
    vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: NodeJS.Signals | number) => {
      if (pid === foregroundPid && signal === 0) return true;
      if (pid === childPid && signal === 0) {
        if (childAlive) return true;
        const error = new Error("not running") as NodeJS.ErrnoException;
        error.code = "ESRCH";
        throw error;
      }
      if (pid === childPid) {
        childAlive = false;
        return true;
      }
      return originalKill(pid, signal as NodeJS.Signals | number | undefined);
    }) as typeof process.kill);
    mockedExecFileSync.mockImplementation((() => {
      childAlive = false;
      return Buffer.from("");
    }) as unknown as typeof execFileSync);
    mockedGatewayHealth.mockResolvedValue(null);
    mockedExecSync.mockReturnValue("");
    mockedSpawn.mockImplementation((() => {
      writeGatewayProcess({
        pid: foregroundPid,
        port: 9411,
        startedAt: Date.now(),
        mode: "foreground",
      });
      return { pid: childPid, unref: vi.fn() };
    }) as unknown as typeof spawn);

    await expect(spawnDaemon({ port: 9311 })).rejects.toThrow(/owned by live PID 24684/i);

    expect(readGatewayProcess()).toMatchObject({ pid: foregroundPid, port: 9411, mode: "foreground" });
    expect(childAlive).toBe(false);
  });

  test("does not spawn after losing its startup-lock token", async () => {
    let probes = 0;
    mockedGatewayHealth.mockImplementation(async () => {
      probes += 1;
      if (probes === 2) {
        replaceTestLease(
          join(configDir, "gateway-start.lock"),
          9999,
          Date.now(),
          "replacement-before-spawn",
        );
      }
      return null;
    });
    mockedExecSync.mockReturnValue("");

    await expect(spawnDaemon({ port: 9316 })).rejects.toThrow(/lost gateway startup lock ownership/i);

    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  test("terminates its known child after losing the startup-lock token during spawn", async () => {
    const childPid = 24686;
    let childAlive = true;
    let spawned = false;
    const originalKill = process.kill.bind(process);
    vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: NodeJS.Signals | number) => {
      if (pid === childPid && signal === 0) {
        if (childAlive) return true;
        const error = new Error("not running") as NodeJS.ErrnoException;
        error.code = "ESRCH";
        throw error;
      }
      if (pid === childPid) {
        childAlive = false;
        return true;
      }
      return originalKill(pid, signal as NodeJS.Signals | number | undefined);
    }) as typeof process.kill);
    mockedExecFileSync.mockImplementation((() => {
      childAlive = false;
      return Buffer.from("");
    }) as unknown as typeof execFileSync);
    mockedSpawn.mockImplementation((() => {
      spawned = true;
      replaceTestLease(
        join(configDir, "gateway-start.lock"),
        9999,
        Date.now(),
        "replacement-during-spawn",
      );
      return { pid: childPid, unref: vi.fn() };
    }) as unknown as typeof spawn);
    mockedGatewayHealth.mockImplementation(async () => spawned ? healthFromRecord() : null);
    mockedExecSync.mockImplementation((() => {
      if (!spawned) return "";
      return process.platform === "win32"
        ? `TCP    127.0.0.1:9317    0.0.0.0:0    LISTENING    ${childPid}`
        : String(childPid);
    }) as unknown as typeof execSync);

    await expect(spawnDaemon({ port: 9317 })).rejects.toThrow(/lost gateway startup lock ownership/i);

    expect(mockedSpawn).toHaveBeenCalledOnce();
    expect(childAlive).toBe(false);
    expect(readGatewayProcess()).toBeNull();
  });

  test("a live startup-lock owner receives the full 15-second readiness deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000_000));
    publishTestLease(
      join(configDir, "gateway-start.lock"),
      process.pid,
      Date.now(),
      "live-startup-owner",
    );
    mockedGatewayHealth.mockResolvedValue(null);
    let portChecks = 0;
    mockedExecSync.mockImplementation((() => {
      portChecks += 1;
      if (portChecks === 1) return "";
      return process.platform === "win32"
        ? "TCP    127.0.0.1:9312    0.0.0.0:0    LISTENING    9999"
        : "9999";
    }) as unknown as typeof execSync);

    let outcome: { error?: Error } | undefined;
    const starting = spawnDaemon({ port: 9312 }).then(
      () => ({}),
      (error: Error) => ({ error }),
    );
    void starting.then((result) => {
      outcome = result;
    });

    await vi.advanceTimersByTimeAsync(14_999);
    expect(outcome).toBeUndefined();
    expect(mockedSpawn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    const result = await starting;
    expect("error" in result ? result.error.message : "").toContain("within 15 seconds");
  });

  test("reclaims an invalid startup lock only after it is stale", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000_000));
    const lockPath = join(configDir, "gateway-start.lock");
    writeFileSync(lockPath, "", "utf8");
    utimesSync(lockPath, new Date(1_000), new Date(1_000));
    const childPid = 24681;
    let spawned = false;
    const originalKill = process.kill.bind(process);
    vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: NodeJS.Signals | number) => {
      if (pid === childPid && signal === 0) return true;
      return originalKill(pid, signal as NodeJS.Signals | number | undefined);
    }) as typeof process.kill);
    mockedSpawn.mockImplementation((() => {
      spawned = true;
      return { pid: childPid, unref: vi.fn() };
    }) as unknown as typeof spawn);
    mockedGatewayHealth.mockImplementation(async () => spawned ? healthFromRecord() : null);
    mockedExecSync.mockImplementation((() => {
      if (!spawned) return "";
      return process.platform === "win32"
        ? `TCP    127.0.0.1:9313    0.0.0.0:0    LISTENING    ${childPid}`
        : String(childPid);
    }) as unknown as typeof execSync);

    const starting = spawnDaemon({ port: 9313 });
    const resolved = expect(starting).resolves.toMatchObject({ pid: childPid, port: 9313, managed: true });
    await vi.advanceTimersByTimeAsync(15_000);

    await resolved;
    expect(mockedSpawn).toHaveBeenCalledOnce();
  });

  test("terminates its known child when readiness times out before the port is bound", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000_000));
    const childPid = 24682;
    let alive = true;
    const originalKill = process.kill.bind(process);
    const kill = vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: NodeJS.Signals | number) => {
      if (pid === childPid && signal === 0) {
        if (alive) return true;
        const error = new Error("not running") as NodeJS.ErrnoException;
        error.code = "ESRCH";
        throw error;
      }
      if (pid === childPid) {
        alive = false;
        return true;
      }
      return originalKill(pid, signal as NodeJS.Signals | number | undefined);
    }) as typeof process.kill);
    mockedExecFileSync.mockImplementation((() => {
      alive = false;
      return Buffer.from("");
    }) as unknown as typeof execFileSync);
    mockedSpawn.mockReturnValue({ pid: childPid, unref: vi.fn() } as never);
    mockedGatewayHealth.mockResolvedValue(null);
    mockedExecSync.mockReturnValue("");

    const starting = spawnDaemon({ port: 9314 });
    const rejected = expect(starting).rejects.toThrow("within 15 seconds");
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;

    if (process.platform === "win32") {
      expect(mockedExecFileSync).toHaveBeenCalledWith(
        "taskkill",
        ["/PID", String(childPid), "/T", "/F"],
        expect.objectContaining({ stdio: "ignore" }),
      );
    } else {
      expect(kill).toHaveBeenCalledWith(childPid, "SIGTERM");
    }
    expect(readGatewayProcess()).toBeNull();
  });

  test("preserves the process record when a validated daemon cannot be terminated", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000_000));
    const childPid = 24683;
    writeGatewayProcess({ pid: childPid, port: 9315, startedAt: 1, mode: "daemon" });
    const originalKill = process.kill.bind(process);
    vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: NodeJS.Signals | number) => {
      if (pid === childPid) return true;
      return originalKill(pid, signal as NodeJS.Signals | number | undefined);
    }) as typeof process.kill);
    mockedExecFileSync.mockReturnValue(Buffer.from(""));
    mockedExecSync.mockReturnValue(process.platform === "win32"
      ? `TCP    127.0.0.1:9315    0.0.0.0:0    LISTENING    ${childPid}`
      : String(childPid));
    mockedGatewayHealth.mockImplementation(async () => healthFromRecord());

    const stopping = stopDaemon();
    await vi.advanceTimersByTimeAsync(2_250);
    const result = await stopping;

    expect(result).toMatchObject({ stopped: false, pid: childPid, reason: expect.stringContaining("still running") });
    expect(readGatewayProcess()?.pid).toBe(childPid);
  });

  test("polls for bounded exit after SIGKILL before clearing the record", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000_000));
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    const childPid = 24687;
    let alive = true;
    writeGatewayProcess({ pid: childPid, port: 9318, startedAt: 1, mode: "daemon" });
    const originalKill = process.kill.bind(process);
    const kill = vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: NodeJS.Signals | number) => {
      if (pid !== childPid) return originalKill(pid, signal as NodeJS.Signals | number | undefined);
      if (signal === 0) {
        if (alive) return true;
        const error = new Error("not running") as NodeJS.ErrnoException;
        error.code = "ESRCH";
        throw error;
      }
      if (signal === "SIGKILL") {
        setTimeout(() => {
          alive = false;
        }, 100);
      }
      return true;
    }) as typeof process.kill);
    mockedExecSync.mockReturnValue(String(childPid));
    mockedGatewayHealth.mockImplementation(async () => healthFromRecord());

    const stopping = stopDaemon();
    await vi.advanceTimersByTimeAsync(2_250);
    const result = await stopping;

    expect(kill).toHaveBeenCalledWith(childPid, "SIGKILL");
    expect(result).toEqual({ stopped: true, pid: childPid });
    expect(readGatewayProcess()).toBeNull();
  });

  test("cmdDaemon status prints status output cleanly", async () => {
    mockedGatewayHealth.mockResolvedValue(null);
    mockedExecSync.mockReturnValue("");
    let output = "";
    const mockOutput = {
      write: (str: string) => {
        output += str;
        return true;
      },
    };

    await cmdDaemon("status", { port: 54321 }, mockOutput);
    expect(output).toContain("Daemon is stopped");
  });

  test("cmdDaemon start rejects occupied-port failures for the public CLI", async () => {
    mockedGatewayHealth.mockResolvedValue(null);
    mockedExecSync.mockReturnValue(process.platform === "win32"
      ? "TCP    127.0.0.1:54321    0.0.0.0:0    LISTENING    9999"
      : "9999");
    let output = "";

    await expect(cmdDaemon("start", { port: 54321 }, {
      write: (text: string) => {
        output += text;
        return true;
      },
    })).rejects.toThrow("occupied by PID 9999");
    expect(output).not.toContain("started in background");
  });

  test("readDaemonLogs returns fallback message when no logs exist", () => {
    const logs = readDaemonLogs(10);
    expect(typeof logs).toBe("string");
  });
});
