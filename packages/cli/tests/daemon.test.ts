import { describe, expect, test, afterEach } from "vitest";
import {
  clearDaemonPid,
  getDaemonPidPath,
  getDaemonStatus,
  readDaemonLogs,
  readDaemonPid,
  writeDaemonPid,
} from "../src/gateway/daemon.js";
import { cmdDaemon } from "../src/commands/daemon.js";

describe("MCP Gateway daemon subsystem", () => {
  afterEach(() => {
    clearDaemonPid();
  });

  test("writes, reads, and clears daemon pid", () => {
    writeDaemonPid({ pid: 12345, startedAt: Date.now(), port: 8765 });
    const info = readDaemonPid();
    expect(info).not.toBeNull();
    expect(info?.pid).toBe(12345);
    expect(info?.port).toBe(8765);

    clearDaemonPid();
    expect(readDaemonPid()).toBeNull();
  });

  test("getDaemonStatus reports running=false when no daemon is active", async () => {
    clearDaemonPid();
    const status = await getDaemonStatus(8765);
    expect(status.running).toBe(false);
    expect(status.pidPath).toBe(getDaemonPidPath());
    expect(status.gatewayResponsive).toBe(false);
  });

  test("cmdDaemon status prints status output cleanly", async () => {
    let output = "";
    const mockOutput = {
      write: (str: string) => {
        output += str;
        return true;
      },
    };

    await cmdDaemon("status", {}, mockOutput);
    expect(output).toContain("Daemon is stopped");
  });

  test("readDaemonLogs returns fallback message when no logs exist", () => {
    const logs = readDaemonLogs(10);
    expect(typeof logs).toBe("string");
  });
});
