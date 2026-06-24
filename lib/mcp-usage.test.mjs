import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildMcpUsageHeatmap,
  filterConnectedMcpUsageEvents,
  getMcpAppDisplayName,
  resolveMcpUsageServerUrl,
  summarizeMcpUsage,
} from "./mcp-usage.ts";

const baseEvent = (overrides = {}) => ({
  id: crypto.randomUUID(),
  user_id: "user-1",
  request_id: "request-1",
  mcp_session_id: null,
  server_id: null,
  server_name: null,
  app_key: null,
  tool_name: "TEST_TOOL",
  tool_namespace: null,
  status: "success",
  error_code: null,
  error_preview: null,
  started_at: "2026-06-16T10:00:00.000Z",
  completed_at: "2026-06-16T10:00:00.120Z",
  duration_ms: 120,
  created_at: "2026-06-16T10:00:00.120Z",
  ...overrides,
});

describe("summarizeMcpUsage", () => {
  it("counts tool calls, success rate, active streak, and most used app", () => {
    const now = new Date("2026-06-16T18:00:00.000Z");
    const events = [
      baseEvent({ app_key: "github", started_at: "2026-06-16T10:00:00.000Z" }),
      baseEvent({ app_key: "github", started_at: "2026-06-15T10:00:00.000Z" }),
      baseEvent({ app_key: "gmail", started_at: "2026-06-14T10:00:00.000Z", status: "error" }),
      baseEvent({ app_key: "gmail", started_at: "2026-06-12T10:00:00.000Z" }),
    ];

    assert.deepEqual(summarizeMcpUsage(events, now), {
      toolCallsTotal: 4,
      orchestrationCallsTotal: 0,
      successRate: 75,
      streakDays: 3,
      mostUsedApp: {
        key: "github",
        name: "GitHub",
        count: 2,
      },
    });
  });

  it("does not rank orchestrator-only activity as a most used app", () => {
    const now = new Date("2026-06-16T18:00:00.000Z");
    const events = [
      baseEvent({
        server_id: "workflow-automation-engine",
        server_name: "Workflow Automation Engine",
        app_key: null,
        started_at: "2026-06-16T10:00:00.000Z",
      }),
    ];

    assert.equal(summarizeMcpUsage(events, now).mostUsedApp, null);
    assert.equal(summarizeMcpUsage(events, now).orchestrationCallsTotal, 1);
  });

  it("returns empty defaults when there are no events", () => {
    assert.deepEqual(summarizeMcpUsage([], new Date("2026-06-16T18:00:00.000Z")), {
      toolCallsTotal: 0,
      orchestrationCallsTotal: 0,
      successRate: 0,
      streakDays: 0,
      mostUsedApp: null,
    });
  });
});

describe("buildMcpUsageHeatmap", () => {
  it("fills missing days and assigns intensity levels", () => {
    const now = new Date("2026-06-16T18:00:00.000Z");
    const events = [
      baseEvent({ started_at: "2026-06-14T10:00:00.000Z" }),
      baseEvent({ started_at: "2026-06-16T10:00:00.000Z" }),
      baseEvent({ started_at: "2026-06-16T11:00:00.000Z" }),
      baseEvent({ started_at: "2026-06-16T12:00:00.000Z" }),
    ];

    assert.deepEqual(buildMcpUsageHeatmap(events, 3, now), [
      { date: "2026-06-14", count: 1, level: 1, apps: [{ key: "mcp_server", name: "MCP Server", count: 1, serverUrl: null }] },
      { date: "2026-06-15", count: 0, level: 0, apps: [] },
      { date: "2026-06-16", count: 3, level: 2, apps: [{ key: "mcp_server", name: "MCP Server", count: 3, serverUrl: null }] },
    ]);
  });

  it("groups connected app calls by day and includes orchestration in the app breakdown", () => {
    const now = new Date("2026-06-16T18:00:00.000Z");
    const events = [
      baseEvent({ server_name: "Workflow Automation Engine", started_at: "2026-06-16T10:00:00.000Z" }),
      baseEvent({ app_key: "github", started_at: "2026-06-16T11:00:00.000Z" }),
      baseEvent({ app_key: "github", started_at: "2026-06-16T12:00:00.000Z" }),
      baseEvent({ app_key: "gmail", started_at: "2026-06-16T13:00:00.000Z" }),
    ];

    assert.deepEqual(buildMcpUsageHeatmap(events, 1, now), [
      {
        date: "2026-06-16",
        count: 4,
        level: 2,
        apps: [
          { key: "github", name: "GitHub", count: 2, serverUrl: null },
          { key: "gmail", name: "Gmail", count: 1, serverUrl: null },
          { key: "workflow_automation_engine", name: "MCP Assistant", count: 1, serverUrl: null },
        ],
      },
    ]);
  });
});

describe("getMcpAppDisplayName", () => {
  it("formats known app keys and falls back to server names", () => {
    assert.equal(getMcpAppDisplayName("github"), "GitHub");
    assert.equal(getMcpAppDisplayName("google_drive"), "Google Drive");
    assert.equal(getMcpAppDisplayName(null, "Custom MCP Server"), "Custom MCP Server");
    assert.equal(getMcpAppDisplayName(null, null), "MCP Server");
    assert.equal(getMcpAppDisplayName(null, "Workflow Automation Engine"), "MCP Assistant");
  });
});

describe("resolveMcpUsageServerUrl", () => {
  it("returns server_url from the event when present", () => {
    assert.equal(
      resolveMcpUsageServerUrl({ server_url: "https://github.com" }),
      "https://github.com"
    );
  });

  it("returns null when server_url is null", () => {
    assert.equal(resolveMcpUsageServerUrl({ server_url: null }), null);
  });

  it("returns null when server_url is undefined", () => {
    assert.equal(resolveMcpUsageServerUrl({}), null);
  });
});

describe("mostUsedApp", () => {
  it("ignores orchestrator events when ranking apps", () => {
    const summary = summarizeMcpUsage([
      baseEvent({ server_name: "Workflow Automation Engine", started_at: "2026-06-16T10:00:00.000Z" }),
      baseEvent({ app_key: "github", started_at: "2026-06-16T11:00:00.000Z" }),
      baseEvent({ app_key: "github", started_at: "2026-06-16T12:00:00.000Z" }),
    ]);

    assert.equal(summary.mostUsedApp?.name, "GitHub");
    assert.equal(summary.mostUsedApp?.count, 2);
  });
});

describe("filterConnectedMcpUsageEvents", () => {
  it("filters out assistant orchestration events but keeps downstream tool calls", () => {
    const events = [
      baseEvent({ server_name: "Workflow Automation Engine", app_key: null }),
      baseEvent({ server_name: "GitHub", app_key: "github" }),
    ];

    const connectedEvents = filterConnectedMcpUsageEvents(events);

    assert.equal(connectedEvents.length, 1);
    assert.equal(connectedEvents[0].app_key, "github");
  });
});
