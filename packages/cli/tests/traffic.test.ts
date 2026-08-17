import { describe, expect, it } from "vitest";
import { Traffic } from "../src/traffic.js";

describe("Traffic live streaming logger", () => {
  it("records incoming JSON-RPC requests and formats log lines", () => {
    const lines: string[] = [];
    const traffic = new Traffic({ onLine: (line) => lines.push(line) });

    traffic.recordIncoming({
      protocol: "JSON-RPC",
      method: "tools/list",
      latencyMs: 2,
      status: 200,
    });

    expect(traffic.requests).toBe(1);
    expect(traffic.errors).toBe(0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("JSON-RPC");
    expect(lines[0]).toContain("tools/list");
    expect(lines[0]).toContain("200 OK");
    expect(lines[0]).toContain("(2ms)");
  });

  it("records tool execution calls with latency and success/error status", () => {
    const lines: string[] = [];
    const traffic = new Traffic({ onLine: (line) => lines.push(line) });

    // Success call
    traffic.recordCall("github", "create_issue", 142, true);
    expect(traffic.calls).toBe(1);
    expect(traffic.errors).toBe(0);
    expect(lines[0]).toContain("EXECUTE");
    expect(lines[0]).toContain("github::create_issue");
    expect(lines[0]).toContain("200 OK");
    expect(lines[0]).toContain("(142ms)");

    // Error call
    traffic.recordCall("postgres", "query", 45, false, 'table "users" does not exist');
    expect(traffic.calls).toBe(2);
    expect(traffic.errors).toBe(1);
    expect(lines[1]).toContain("EXECUTE");
    expect(lines[1]).toContain("postgres::query");
    expect(lines[1]).toContain("500 ERR");
    expect(lines[1]).toContain('(45ms)');
    expect(lines[1]).toContain('table "users" does not exist');
  });

  it("includes verbose args and result in verbose mode", () => {
    const lines: string[] = [];
    const traffic = new Traffic({
      verbose: true,
      onLine: (line) => lines.push(line),
    });

    traffic.recordIncoming({
      protocol: "JSON-RPC",
      method: "tools/call",
      target: "github::create_issue",
      latencyMs: 15,
      status: 200,
      args: { title: "Test issue" },
    });

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("tools/call (github::create_issue)");
    expect(lines[1]).toContain("├─ args:");
    expect(lines[1]).toContain("Test issue");

    traffic.recordCall(
      "github",
      "create_issue",
      120,
      true,
      undefined,
      { title: "Test issue" },
      { id: 42, url: "https://github.com/issue/42" },
    );

    expect(lines).toHaveLength(5);
    expect(lines[2]).toContain("github::create_issue");
    expect(lines[3]).toContain("├─ args:");
    expect(lines[4]).toContain("└─ result:");
    expect(lines[4]).toContain("https://github.com/issue/42");
  });

  it("records untracked errors", () => {
    const lines: string[] = [];
    const traffic = new Traffic({ onLine: (line) => lines.push(line) });

    traffic.recordError("bridge", "Connection timeout");
    expect(traffic.errors).toBe(1);
    expect(lines[0]).toContain("ERROR");
    expect(lines[0]).toContain("bridge");
    expect(lines[0]).toContain("Connection timeout");
  });
});
