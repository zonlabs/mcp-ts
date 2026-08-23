import { describe, expect, test, afterEach } from "vitest";
import {
  classifyDaemonStatus,
  clearDaemonPid,
  getDaemonPidPath,
  getDaemonStatus,
  readDaemonLogs,
  readDaemonPid,
  writeDaemonPid,
  validateManagedStop,
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
    expect(status.state).toBe("stopped");
    expect(status.managed).toBe(false);
  });

  test("classifies healthy foreground gateways as external", () => {
    expect(classifyDaemonStatus({
      requestedPort: 8765,
      pidRecord: null,
      pidAlive: false,
      portOwnerPid: 4321,
      gatewayResponsive: true,
      now: 20_000,
    })).toMatchObject({ state: "external", running: true, managed: false, portOwnerPid: 4321 });
  });

  test("classifies foreign port owners as occupied", () => {
    expect(classifyDaemonStatus({
      requestedPort: 8765,
      pidRecord: null,
      pidAlive: false,
      portOwnerPid: 4321,
      gatewayResponsive: false,
      now: 20_000,
    })).toMatchObject({ state: "occupied", running: false, managed: false, portOwnerPid: 4321 });
  });

  test("does not treat a reused PID record as managed", () => {
    expect(classifyDaemonStatus({
      requestedPort: 8765,
      pidRecord: { pid: 1234, port: 8765, startedAt: 1 },
      pidAlive: true,
      portOwnerPid: 9999,
      gatewayResponsive: true,
      now: 20_000,
    })).toMatchObject({ state: "external", managed: false, portOwnerPid: 9999 });
  });

  test("refuses to stop a PID-managed record when another PID owns its port", () => {
    expect(validateManagedStop(
      { pid: 1234, port: 8765, startedAt: 1 },
      true,
      9999,
    )).toEqual({
      allowed: false,
      reason: "Refused to stop PID 1234: port 8765 is owned by 9999.",
    });
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
