# Codemode Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a built-in `codemode_run` AI SDK tool in `mcp-client` that executes orchestration code in Vercel Sandbox and allows that code to call the user's connected MCP tools through a signed host bridge.

**Architecture:** The chat agent exposes a local `codemode_run` tool. The tool creates a short-lived Vercel Sandbox, writes a generated Node runner, and passes a signed token plus the app bridge URL to the runner. The runner calls `/api/codemode/bridge` for MCP tool calls; the bridge route verifies the token and executes tools through `MultiSessionClient` as the current user.

**Tech Stack:** Next.js App Router, AI SDK `tool`, Zod, `@mcp-ts/sdk/server`, Vercel Sandbox SDK `@vercel/sandbox`, Node `crypto`, Node test runner.

---

## Files

- Create: `lib/codemode/types.ts` for shared codemode result, limit, tool index, token, and dependency interfaces.
- Create: `lib/codemode/limits.ts` for validation and output-size helpers.
- Create: `lib/codemode/tool-index.ts` for indexing MCP sessions/tools with session IDs as codemode server IDs.
- Create: `lib/codemode/bridge-token.ts` for short-lived HMAC bridge tokens.
- Create: `lib/codemode/mcp-bridge.ts` for verified MCP tool execution used by the API route.
- Create: `lib/codemode/runner.ts` for generated sandbox runner source and result parsing.
- Create: `lib/codemode/vercel-runtime.ts` for Vercel Sandbox creation, file writes, command execution, parsing, and cleanup.
- Create: `tool/codemode-run.ts` for the AI SDK tool wrapper.
- Create: `app/api/codemode/bridge/route.ts` for the sandbox-to-host MCP call endpoint.
- Modify: `agent/chat-agent.ts` to register the local tool and pass request base URL.
- Modify: `app/api/chat/route.ts` to pass the request origin/base URL into `createMcpAgent`.
- Modify: `agent/chat-agent-instructions.ts` only if the current codemode instructions still assume the tool is remote-only.
- Modify: `package.json` and `package-lock.json` by installing `@vercel/sandbox`.
- Test: `lib/codemode/limits.test.mjs`
- Test: `lib/codemode/tool-index.test.mjs`
- Test: `lib/codemode/bridge-token.test.mjs`
- Test: `lib/codemode/mcp-bridge.test.mjs`
- Test: `lib/codemode/runner.test.mjs`
- Test: `lib/codemode/vercel-runtime.test.mjs`
- Test: `tool/codemode-run.test.mjs`
- Test: update `agent/chat-agent-instructions.test.mjs` if instructions change.

## Task 1: Limits And Shared Types

**Files:**
- Create: `lib/codemode/types.ts`
- Create: `lib/codemode/limits.ts`
- Test: `lib/codemode/limits.test.mjs`

- [ ] **Step 1: Write the failing limits tests**

Create `lib/codemode/limits.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  CODEMODE_DEFAULT_LIMITS,
  assertJsonWithinBytes,
  normalizeRunInput,
  resolveCodemodeLimits,
} from "./limits.ts";

test("normalizes empty run input with default input and timeout", () => {
  const normalized = normalizeRunInput({ code: "return input.count + 1;" });

  assert.deepEqual(normalized, {
    code: "return input.count + 1;",
    input: {},
    timeoutMs: CODEMODE_DEFAULT_LIMITS.timeoutMs,
  });
});

test("rejects blank code", () => {
  assert.throws(
    () => normalizeRunInput({ code: "   " }),
    /code must be a non-empty string/
  );
});

test("caps timeout at the configured maximum", () => {
  const limits = resolveCodemodeLimits({ timeoutMs: 999_999 });

  assert.equal(limits.timeoutMs, CODEMODE_DEFAULT_LIMITS.maxTimeoutMs);
});

test("rejects JSON payloads over the byte limit", () => {
  assert.throws(
    () => assertJsonWithinBytes({ value: "x".repeat(20) }, 10, "result"),
    /result exceeds 10 bytes/
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test lib/codemode/limits.test.mjs`

Expected: FAIL with a module-not-found error for `./limits.ts`.

- [ ] **Step 3: Add shared types**

Create `lib/codemode/types.ts`:

```ts
export type CodemodeLogLevel = "log" | "info" | "warn" | "error";

export interface CodemodeLogEntry {
  level: CodemodeLogLevel;
  args: unknown[];
}

export interface CodemodeToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export interface CodemodeIndexedTool {
  serverId: string;
  serverName: string;
  toolName: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export interface CodemodeToolCall {
  id: string;
  serverId: string;
  toolName: string;
  args: unknown;
  startedAt: number;
  durationMs: number;
  ok: boolean;
  error?: string;
}

export type CodemodeErrorCode =
  | "SANDBOX_ERROR"
  | "TIMEOUT"
  | "TOOL_NOT_FOUND"
  | "TOOL_EXECUTION_FAILED"
  | "RESULT_TOO_LARGE";

export interface CodemodeError {
  code: CodemodeErrorCode;
  message: string;
}

export interface CodemodeResult {
  value?: unknown;
  stdout: string;
  stderr: string;
  logs: CodemodeLogEntry[];
  toolCalls: CodemodeToolCall[];
  durationMs: number;
  error?: CodemodeError;
}

export interface CodemodeRunInput {
  code: string;
  input: unknown;
  timeoutMs: number;
}

export interface CodemodeLimitOptions {
  timeoutMs?: number;
  maxTimeoutMs?: number;
  maxCodeBytes?: number;
  maxToolCalls?: number;
  maxConcurrentToolCalls?: number;
  maxResultBytes?: number;
  maxOutputBytes?: number;
}

export interface CodemodeLimits {
  timeoutMs: number;
  maxTimeoutMs: number;
  maxCodeBytes: number;
  maxToolCalls: number;
  maxConcurrentToolCalls: number;
  maxResultBytes: number;
  maxOutputBytes: number;
}

export interface CodemodeBridgePayload {
  userId: string;
  expiresAt: number;
  allowedTools: Array<{ serverId: string; toolName: string }>;
}
```

- [ ] **Step 4: Implement limits**

Create `lib/codemode/limits.ts`:

```ts
import type { CodemodeLimitOptions, CodemodeLimits, CodemodeRunInput } from "./types";

const textEncoder = new TextEncoder();

export const CODEMODE_DEFAULT_LIMITS: CodemodeLimits = {
  timeoutMs: 30_000,
  maxTimeoutMs: 120_000,
  maxCodeBytes: 128_000,
  maxToolCalls: 30,
  maxConcurrentToolCalls: 5,
  maxResultBytes: 512_000,
  maxOutputBytes: 512_000,
};

export function jsonByteLength(value: unknown): number {
  return textEncoder.encode(JSON.stringify(value)).byteLength;
}

export function stringByteLength(value: string): number {
  return textEncoder.encode(value).byteLength;
}

export function resolveCodemodeLimits(options: CodemodeLimitOptions = {}): CodemodeLimits {
  const maxTimeoutMs = options.maxTimeoutMs ?? CODEMODE_DEFAULT_LIMITS.maxTimeoutMs;
  const requestedTimeout = options.timeoutMs ?? CODEMODE_DEFAULT_LIMITS.timeoutMs;

  return {
    timeoutMs: Math.min(Math.max(requestedTimeout, 1_000), maxTimeoutMs),
    maxTimeoutMs,
    maxCodeBytes: options.maxCodeBytes ?? CODEMODE_DEFAULT_LIMITS.maxCodeBytes,
    maxToolCalls: options.maxToolCalls ?? CODEMODE_DEFAULT_LIMITS.maxToolCalls,
    maxConcurrentToolCalls:
      options.maxConcurrentToolCalls ?? CODEMODE_DEFAULT_LIMITS.maxConcurrentToolCalls,
    maxResultBytes: options.maxResultBytes ?? CODEMODE_DEFAULT_LIMITS.maxResultBytes,
    maxOutputBytes: options.maxOutputBytes ?? CODEMODE_DEFAULT_LIMITS.maxOutputBytes,
  };
}

export function normalizeRunInput(raw: unknown): CodemodeRunInput {
  const candidate = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const code = typeof candidate.code === "string" ? candidate.code : "";

  if (!code.trim()) {
    throw new Error("code must be a non-empty string");
  }

  const limits = resolveCodemodeLimits({
    timeoutMs: typeof candidate.timeoutMs === "number" ? candidate.timeoutMs : undefined,
  });

  if (stringByteLength(code) > limits.maxCodeBytes) {
    throw new Error(`code exceeds ${limits.maxCodeBytes} bytes`);
  }

  return {
    code,
    input: Object.prototype.hasOwnProperty.call(candidate, "input") ? candidate.input : {},
    timeoutMs: limits.timeoutMs,
  };
}

export function assertJsonWithinBytes(value: unknown, maxBytes: number, label: string): void {
  const size = jsonByteLength(value);
  if (size > maxBytes) {
    throw new Error(`${label} exceeds ${maxBytes} bytes`);
  }
}

export function truncateToBytes(value: string, maxBytes: number): string {
  if (stringByteLength(value) <= maxBytes) return value;
  let out = value;
  while (out.length > 0 && stringByteLength(out) > maxBytes) {
    out = out.slice(0, Math.floor(out.length * 0.9));
  }
  return out;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test lib/codemode/limits.test.mjs`

Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

Run:

```bash
git add lib/codemode/types.ts lib/codemode/limits.ts lib/codemode/limits.test.mjs
git commit -m "feat: add codemode limits"
```

## Task 2: Tool Index And Bridge Tokens

**Files:**
- Create: `lib/codemode/tool-index.ts`
- Create: `lib/codemode/bridge-token.ts`
- Test: `lib/codemode/tool-index.test.mjs`
- Test: `lib/codemode/bridge-token.test.mjs`

- [ ] **Step 1: Write the failing tool-index tests**

Create `lib/codemode/tool-index.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { indexMcpSessions, searchIndexedTools } from "./tool-index.ts";

test("indexes tools using sessionId as serverId", async () => {
  const sessions = [
    { sessionId: "sess_1", serverName: "Calendar" },
    { sessionId: "sess_2", serverName: "Mail" },
  ];
  const client = {
    async listTools(sessionId) {
      return {
        tools: [
          {
            name: sessionId === "sess_1" ? "list_events" : "send_email",
            description: sessionId === "sess_1" ? "List calendar events" : "Send email",
            inputSchema: { type: "object" },
          },
        ],
      };
    },
  };

  const indexed = await indexMcpSessions(client, sessions);

  assert.deepEqual(indexed.map((tool) => [tool.serverId, tool.serverName, tool.toolName]), [
    ["sess_1", "Calendar", "list_events"],
    ["sess_2", "Mail", "send_email"],
  ]);
});

test("searches indexed tools by name and description", () => {
  const results = searchIndexedTools(
    [
      { serverId: "sess_1", serverName: "Calendar", toolName: "list_events", description: "List calendar events" },
      { serverId: "sess_2", serverName: "Mail", toolName: "send_email", description: "Send email" },
    ],
    "calendar",
    5
  );

  assert.equal(results.length, 1);
  assert.equal(results[0].toolName, "list_events");
});
```

- [ ] **Step 2: Write the failing bridge-token tests**

Create `lib/codemode/bridge-token.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { createBridgeToken, verifyBridgeToken } from "./bridge-token.ts";

test("round-trips a signed bridge token", () => {
  const token = createBridgeToken(
    {
      userId: "user_1",
      expiresAt: Date.now() + 60_000,
      allowedTools: [{ serverId: "sess_1", toolName: "list_events" }],
    },
    "secret"
  );

  assert.deepEqual(verifyBridgeToken(token, "secret").allowedTools, [
    { serverId: "sess_1", toolName: "list_events" },
  ]);
});

test("rejects tampered bridge tokens", () => {
  const token = createBridgeToken(
    { userId: "user_1", expiresAt: Date.now() + 60_000, allowedTools: [] },
    "secret"
  );

  assert.throws(() => verifyBridgeToken(`${token}x`, "secret"), /Invalid bridge token signature/);
});

test("rejects expired bridge tokens", () => {
  const token = createBridgeToken(
    { userId: "user_1", expiresAt: Date.now() - 1, allowedTools: [] },
    "secret"
  );

  assert.throws(() => verifyBridgeToken(token, "secret"), /Bridge token expired/);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test lib/codemode/tool-index.test.mjs lib/codemode/bridge-token.test.mjs`

Expected: FAIL with module-not-found errors for `./tool-index.ts` and `./bridge-token.ts`.

- [ ] **Step 4: Implement tool indexing**

Create `lib/codemode/tool-index.ts`:

```ts
import type { CodemodeIndexedTool } from "./types";

type SessionLike = {
  sessionId: string;
  serverName?: string | null;
};

type ListToolsClient = {
  listTools(sessionId: string): Promise<{ tools?: unknown[] }>;
};

function normalizeTool(raw: unknown): { name: string; description: string; inputSchema?: Record<string, unknown>; annotations?: Record<string, unknown> } | null {
  if (!raw || typeof raw !== "object") return null;
  const tool = raw as Record<string, unknown>;
  if (typeof tool.name !== "string" || !tool.name.trim()) return null;
  return {
    name: tool.name,
    description: typeof tool.description === "string" ? tool.description : "",
    inputSchema:
      tool.inputSchema && typeof tool.inputSchema === "object" && !Array.isArray(tool.inputSchema)
        ? tool.inputSchema as Record<string, unknown>
        : undefined,
    annotations:
      tool.annotations && typeof tool.annotations === "object" && !Array.isArray(tool.annotations)
        ? tool.annotations as Record<string, unknown>
        : undefined,
  };
}

export async function indexMcpSessions(
  client: ListToolsClient,
  sessions: SessionLike[]
): Promise<CodemodeIndexedTool[]> {
  const indexed: CodemodeIndexedTool[] = [];

  for (const session of sessions) {
    const result = await client.listTools(session.sessionId);
    for (const rawTool of result.tools ?? []) {
      const tool = normalizeTool(rawTool);
      if (!tool) continue;
      indexed.push({
        serverId: session.sessionId,
        serverName: session.serverName?.trim() || session.sessionId,
        toolName: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      });
    }
  }

  return indexed;
}

export function findIndexedTool(
  tools: CodemodeIndexedTool[],
  serverId: string,
  toolName: string
): CodemodeIndexedTool | null {
  return tools.find((tool) => tool.serverId === serverId && tool.toolName === toolName) ?? null;
}

export function searchIndexedTools(
  tools: CodemodeIndexedTool[],
  query: string,
  limit = 10
): CodemodeIndexedTool[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return tools.slice(0, limit);

  return tools
    .map((tool) => {
      const haystack = `${tool.serverName} ${tool.toolName} ${tool.description}`.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { tool, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.tool.toolName.localeCompare(b.tool.toolName))
    .slice(0, limit)
    .map((entry) => entry.tool);
}
```

- [ ] **Step 5: Implement bridge tokens**

Create `lib/codemode/bridge-token.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import type { CodemodeBridgePayload } from "./types";

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createBridgeToken(payload: CodemodeBridgePayload, secret: string): string {
  if (!secret) throw new Error("CODEMODE_BRIDGE_SECRET is required");
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyBridgeToken(token: string, secret: string, now = Date.now()): CodemodeBridgePayload {
  if (!secret) throw new Error("CODEMODE_BRIDGE_SECRET is required");
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) throw new Error("Invalid bridge token");

  const expected = sign(encoded, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid bridge token signature");
  }

  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as CodemodeBridgePayload;
  if (payload.expiresAt < now) throw new Error("Bridge token expired");
  return payload;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test lib/codemode/tool-index.test.mjs lib/codemode/bridge-token.test.mjs`

Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

Run:

```bash
git add lib/codemode/tool-index.ts lib/codemode/tool-index.test.mjs lib/codemode/bridge-token.ts lib/codemode/bridge-token.test.mjs
git commit -m "feat: index codemode tools"
```

## Task 3: MCP Bridge API

**Files:**
- Create: `lib/codemode/mcp-bridge.ts`
- Create: `app/api/codemode/bridge/route.ts`
- Test: `lib/codemode/mcp-bridge.test.mjs`

- [ ] **Step 1: Write the failing MCP bridge tests**

Create `lib/codemode/mcp-bridge.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { executeBridgeToolCall } from "./mcp-bridge.ts";

test("executes allowed bridge tool calls through the MCP client", async () => {
  const calls = [];
  const result = await executeBridgeToolCall({
    payload: {
      userId: "user_1",
      expiresAt: Date.now() + 60_000,
      allowedTools: [{ serverId: "sess_1", toolName: "list_events" }],
    },
    request: { serverId: "sess_1", toolName: "list_events", args: { limit: 1 } },
    createClient: () => ({
      async connect() {},
      async callTool(sessionId, toolName, args) {
        calls.push({ sessionId, toolName, args });
        return { events: [] };
      },
      disconnect() {},
    }),
  });

  assert.deepEqual(result, { success: true, result: { events: [] } });
  assert.deepEqual(calls, [{ sessionId: "sess_1", toolName: "list_events", args: { limit: 1 } }]);
});

test("rejects bridge tool calls that are not in the token allowlist", async () => {
  const result = await executeBridgeToolCall({
    payload: {
      userId: "user_1",
      expiresAt: Date.now() + 60_000,
      allowedTools: [{ serverId: "sess_1", toolName: "list_events" }],
    },
    request: { serverId: "sess_2", toolName: "send_email", args: {} },
    createClient: () => {
      throw new Error("client should not be created");
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.error, 'Tool "send_email" was not found on server "sess_2".');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test lib/codemode/mcp-bridge.test.mjs`

Expected: FAIL with a module-not-found error for `./mcp-bridge.ts`.

- [ ] **Step 3: Implement the bridge executor**

Create `lib/codemode/mcp-bridge.ts`:

```ts
import { MultiSessionClient } from "@mcp-ts/sdk/server";
import type { CodemodeBridgePayload } from "./types";

export interface BridgeToolCallRequest {
  serverId: string;
  toolName: string;
  args?: Record<string, unknown>;
}

export type BridgeToolCallResult =
  | { success: true; result: unknown }
  | { success: false; error: string };

type BridgeClient = {
  connect(): Promise<void>;
  callTool(sessionId: string, toolName: string, args: Record<string, unknown>): Promise<unknown>;
  disconnect(reason?: string): void;
};

export async function executeBridgeToolCall(input: {
  payload: CodemodeBridgePayload;
  request: BridgeToolCallRequest;
  createClient?: (userId: string) => BridgeClient;
}): Promise<BridgeToolCallResult> {
  const allowed = input.payload.allowedTools.some(
    (tool) => tool.serverId === input.request.serverId && tool.toolName === input.request.toolName
  );

  if (!allowed) {
    return {
      success: false,
      error: `Tool "${input.request.toolName}" was not found on server "${input.request.serverId}".`,
    };
  }

  const client = input.createClient?.(input.payload.userId) ?? new MultiSessionClient(input.payload.userId);
  try {
    await client.connect();
    const result = await client.callTool(
      input.request.serverId,
      input.request.toolName,
      input.request.args ?? {}
    );
    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    client.disconnect("codemode-bridge");
  }
}
```

- [ ] **Step 4: Add the Next bridge route**

Create `app/api/codemode/bridge/route.ts`:

```ts
import { NextResponse } from "next/server";
import { verifyBridgeToken } from "@/lib/codemode/bridge-token";
import { executeBridgeToolCall } from "@/lib/codemode/mcp-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getBridgeSecret(): string {
  return process.env.CODEMODE_BRIDGE_SECRET || "";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = body && typeof body.token === "string" ? body.token : "";

  if (!token) {
    return NextResponse.json({ success: false, error: "Missing bridge token" }, { status: 401 });
  }

  let payload;
  try {
    payload = verifyBridgeToken(token, getBridgeSecret());
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Invalid bridge token" },
      { status: 401 }
    );
  }

  const request = {
    serverId: typeof body?.serverId === "string" ? body.serverId : "",
    toolName: typeof body?.toolName === "string" ? body.toolName : "",
    args:
      body?.args && typeof body.args === "object" && !Array.isArray(body.args)
        ? body.args as Record<string, unknown>
        : {},
  };

  if (!request.serverId || !request.toolName) {
    return NextResponse.json(
      { success: false, error: "serverId and toolName are required" },
      { status: 400 }
    );
  }

  const result = await executeBridgeToolCall({ payload, request });
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
```

- [ ] **Step 5: Run the MCP bridge test to verify it passes**

Run: `node --test lib/codemode/mcp-bridge.test.mjs`

Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

Run:

```bash
git add lib/codemode/mcp-bridge.ts lib/codemode/mcp-bridge.test.mjs app/api/codemode/bridge/route.ts
git commit -m "feat: add codemode bridge route"
```

## Task 4: Sandbox Runner Source And Parsing

**Files:**
- Create: `lib/codemode/runner.ts`
- Test: `lib/codemode/runner.test.mjs`

- [ ] **Step 1: Write the failing runner tests**

Create `lib/codemode/runner.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { CODEMODE_RESULT_PREFIX, buildSandboxRunnerSource, parseSandboxOutput } from "./runner.ts";

test("builds runner source containing codemode APIs", () => {
  const source = buildSandboxRunnerSource();

  assert.equal(source.includes("async function callTool"), true);
  assert.equal(source.includes("searchTools"), true);
  assert.equal(source.includes(CODEMODE_RESULT_PREFIX), true);
});

test("parses structured result from stdout and leaves user stdout intact", () => {
  const parsed = parseSandboxOutput(
    `hello\n${CODEMODE_RESULT_PREFIX}{"value":42,"logs":[],"toolCalls":[]}\n`,
    "",
    123
  );

  assert.equal(parsed.stdout, "hello\n");
  assert.equal(parsed.value, 42);
  assert.equal(parsed.durationMs, 123);
});

test("returns sandbox error when structured result is missing", () => {
  const parsed = parseSandboxOutput("hello\n", "boom\n", 50);

  assert.equal(parsed.error?.code, "SANDBOX_ERROR");
  assert.match(parsed.error?.message ?? "", /missing structured result/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test lib/codemode/runner.test.mjs`

Expected: FAIL with a module-not-found error for `./runner.ts`.

- [ ] **Step 3: Implement runner source and parser**

Create `lib/codemode/runner.ts`:

```ts
import type { CodemodeIndexedTool, CodemodeResult } from "./types";

export const CODEMODE_RESULT_PREFIX = "__CODEMODE_RESULT__";

export function buildSandboxRunnerSource(): string {
  return `
import { readFile } from "node:fs/promises";

const payload = JSON.parse(await readFile("payload.json", "utf8"));
const logs = [];
const toolCalls = [];

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify(String(value));
  }
}

function capture(level, original) {
  return (...args) => {
    logs.push({ level, args });
    original(...args);
  };
}

console.log = capture("log", console.log.bind(console));
console.info = capture("info", console.info.bind(console));
console.warn = capture("warn", console.warn.bind(console));
console.error = capture("error", console.error.bind(console));

function listServers() {
  const byServer = new Map();
  for (const tool of payload.tools) {
    const current = byServer.get(tool.serverId) || {
      serverId: tool.serverId,
      serverName: tool.serverName,
      toolCount: 0,
    };
    current.toolCount += 1;
    byServer.set(tool.serverId, current);
  }
  return [...byServer.values()];
}

function searchTools(query, limit = 10) {
  const terms = String(query || "").toLowerCase().split(/\\s+/).filter(Boolean);
  const scored = payload.tools.map((tool) => {
    const haystack = [tool.serverName, tool.toolName, tool.description].join(" ").toLowerCase();
    const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
    return { tool, score };
  });
  return scored
    .filter((entry) => terms.length === 0 || entry.score > 0)
    .sort((a, b) => b.score - a.score || a.tool.toolName.localeCompare(b.tool.toolName))
    .slice(0, limit)
    .map((entry) => entry.tool);
}

async function callTool(serverId, toolName, args = {}) {
  const call = {
    id: "call_" + (toolCalls.length + 1),
    serverId,
    toolName,
    args,
    startedAt: Date.now(),
    durationMs: 0,
    ok: false,
  };
  toolCalls.push(call);

  try {
    const response = await fetch(payload.bridgeUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: payload.bridgeToken, serverId, toolName, args }),
    });
    const json = await response.json();
    if (!json.success) {
      throw new Error(json.error || "Tool call failed");
    }
    call.ok = true;
    return json.result;
  } catch (error) {
    call.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    call.durationMs = Date.now() - call.startedAt;
  }
}

try {
  const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
  const fn = new AsyncFunction("input", "callTool", "searchTools", "listServers", payload.code);
  const value = await fn(payload.input, callTool, searchTools, listServers);
  console.log(${JSON.stringify(CODEMODE_RESULT_PREFIX)} + safeJson({ value: value === undefined ? null : value, logs, toolCalls }));
} catch (error) {
  console.log(${JSON.stringify(CODEMODE_RESULT_PREFIX)} + safeJson({
    logs,
    toolCalls,
    error: {
      code: "SANDBOX_ERROR",
      message: error instanceof Error && error.stack ? error.stack : String(error),
    },
  }));
}
`;
}

export interface SandboxPayload {
  code: string;
  input: unknown;
  bridgeUrl: string;
  bridgeToken: string;
  tools: CodemodeIndexedTool[];
}

export function buildSandboxPayload(payload: SandboxPayload): string {
  return JSON.stringify(payload);
}

export function parseSandboxOutput(stdout: string, stderr: string, durationMs: number): CodemodeResult {
  const lines = stdout.split(/(?<=\\n)/);
  const resultLine = lines.find((line) => line.startsWith(CODEMODE_RESULT_PREFIX));
  const userStdout = lines.filter((line) => !line.startsWith(CODEMODE_RESULT_PREFIX)).join("");

  if (!resultLine) {
    return {
      stdout,
      stderr,
      logs: [],
      toolCalls: [],
      durationMs,
      error: { code: "SANDBOX_ERROR", message: "Sandbox output missing structured result." },
    };
  }

  try {
    const parsed = JSON.parse(resultLine.slice(CODEMODE_RESULT_PREFIX.length));
    return {
      value: parsed.value,
      stdout: userStdout,
      stderr,
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      toolCalls: Array.isArray(parsed.toolCalls) ? parsed.toolCalls : [],
      durationMs,
      error: parsed.error,
    };
  } catch (error) {
    return {
      stdout,
      stderr,
      logs: [],
      toolCalls: [],
      durationMs,
      error: {
        code: "SANDBOX_ERROR",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test lib/codemode/runner.test.mjs`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

Run:

```bash
git add lib/codemode/runner.ts lib/codemode/runner.test.mjs
git commit -m "feat: generate codemode sandbox runner"
```

## Task 5: Vercel Sandbox Runtime And AI Tool

**Files:**
- Create: `lib/codemode/vercel-runtime.ts`
- Create: `tool/codemode-run.ts`
- Test: `lib/codemode/vercel-runtime.test.mjs`
- Test: `tool/codemode-run.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install Vercel Sandbox SDK**

Run: `npm install @vercel/sandbox`

Expected: `package.json` includes `@vercel/sandbox` under `dependencies`, and `package-lock.json` changes.

- [ ] **Step 2: Write the failing runtime test**

Create `lib/codemode/vercel-runtime.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { runInVercelSandbox } from "./vercel-runtime.ts";

test("writes runner and payload, runs node, parses output, and stops sandbox", async () => {
  const writes = [];
  const commands = [];
  let stopped = false;

  const result = await runInVercelSandbox({
    code: "return 42;",
    input: {},
    timeoutMs: 30_000,
    bridgeUrl: "https://example.com/api/codemode/bridge",
    bridgeToken: "token",
    tools: [],
    createSandbox: async () => ({
      async writeFiles(files) {
        writes.push(...files.map((file) => file.path));
      },
      async runCommand(cmd, args) {
        commands.push({ cmd, args });
        return {
          exitCode: 0,
          async stdout() {
            return '__CODEMODE_RESULT__{"value":42,"logs":[],"toolCalls":[]}\\n';
          },
          async stderr() {
            return "";
          },
        };
      },
      async stop() {
        stopped = true;
      },
    }),
  });

  assert.deepEqual(writes, ["runner.mjs", "payload.json"]);
  assert.deepEqual(commands, [{ cmd: "node", args: ["runner.mjs"] }]);
  assert.equal(stopped, true);
  assert.equal(result.value, 42);
});
```

- [ ] **Step 3: Write the failing tool wrapper test**

Create `tool/codemode-run.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { createCodemodeRunTool } from "./codemode-run.ts";

test("codemode_run returns an error when bridge configuration is missing", async () => {
  const codemodeRun = createCodemodeRunTool({
    userId: "user_1",
    baseUrl: "",
    tools: [],
    bridgeSecret: "secret",
    runSandbox: async () => {
      throw new Error("sandbox should not run");
    },
  });

  const chunks = [];
  for await (const chunk of codemodeRun.execute({ code: "return 1;" }, { toolCallId: "call_1", messages: [] })) {
    chunks.push(chunk);
  }

  assert.equal(chunks.at(-1).state, "output-error");
  assert.match(chunks.at(-1).error, /base URL is required/);
});

test("codemode_run signs a bridge token and executes sandbox", async () => {
  const codemodeRun = createCodemodeRunTool({
    userId: "user_1",
    baseUrl: "https://app.example.com",
    bridgeSecret: "secret",
    tools: [{ serverId: "sess_1", serverName: "Calendar", toolName: "list_events", description: "" }],
    runSandbox: async (input) => {
      assert.equal(input.bridgeUrl, "https://app.example.com/api/codemode/bridge");
      assert.equal(typeof input.bridgeToken, "string");
      return { value: 2, stdout: "", stderr: "", logs: [], toolCalls: [], durationMs: 10 };
    },
  });

  const chunks = [];
  for await (const chunk of codemodeRun.execute({ code: "return 2;" }, { toolCallId: "call_1", messages: [] })) {
    chunks.push(chunk);
  }

  assert.equal(chunks.at(-1).state, "output-available");
  assert.equal(chunks.at(-1).result.value, 2);
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `node --test lib/codemode/vercel-runtime.test.mjs tool/codemode-run.test.mjs`

Expected: FAIL with module-not-found errors for `./vercel-runtime.ts` and `./codemode-run.ts`.

- [ ] **Step 5: Implement the Vercel runtime**

Create `lib/codemode/vercel-runtime.ts`:

```ts
import { Sandbox } from "@vercel/sandbox";
import { assertJsonWithinBytes, resolveCodemodeLimits, truncateToBytes } from "./limits";
import { buildSandboxPayload, buildSandboxRunnerSource, parseSandboxOutput } from "./runner";
import type { CodemodeIndexedTool, CodemodeResult } from "./types";

type SandboxLike = {
  writeFiles(files: Array<{ path: string; content: Buffer; mode?: number }>): Promise<void>;
  runCommand(cmd: string, args: string[]): Promise<{
    exitCode: number | null;
    stdout(): Promise<string>;
    stderr(): Promise<string>;
  }>;
  stop(opts?: { blocking?: boolean }): Promise<unknown>;
};

export async function runInVercelSandbox(input: {
  code: string;
  input: unknown;
  timeoutMs: number;
  bridgeUrl: string;
  bridgeToken: string;
  tools: CodemodeIndexedTool[];
  createSandbox?: () => Promise<SandboxLike>;
}): Promise<CodemodeResult> {
  const startedAt = Date.now();
  const limits = resolveCodemodeLimits({ timeoutMs: input.timeoutMs });
  let sandbox: SandboxLike | null = null;

  try {
    const payload = {
      code: input.code,
      input: input.input,
      bridgeUrl: input.bridgeUrl,
      bridgeToken: input.bridgeToken,
      tools: input.tools,
    };
    assertJsonWithinBytes(payload, limits.maxResultBytes, "sandbox payload");

    sandbox = input.createSandbox
      ? await input.createSandbox()
      : await Sandbox.create({
          runtime: "node22",
          timeout: limits.timeoutMs + 15_000,
          networkPolicy: { allow: [new URL(input.bridgeUrl).hostname] },
        });

    await sandbox.writeFiles([
      { path: "runner.mjs", content: Buffer.from(buildSandboxRunnerSource(), "utf8") },
      { path: "payload.json", content: Buffer.from(buildSandboxPayload(payload), "utf8") },
    ]);

    const command = await sandbox.runCommand("node", ["runner.mjs"]);
    const stdout = truncateToBytes(await command.stdout(), limits.maxOutputBytes);
    const stderr = truncateToBytes(await command.stderr(), limits.maxOutputBytes);
    const result = parseSandboxOutput(stdout, stderr, Date.now() - startedAt);

    if (command.exitCode !== 0 && !result.error) {
      return {
        ...result,
        error: { code: "SANDBOX_ERROR", message: `Sandbox command exited with ${command.exitCode}` },
      };
    }

    assertJsonWithinBytes(result.value ?? null, limits.maxResultBytes, "result");
    return result;
  } catch (error) {
    return {
      stdout: "",
      stderr: "",
      logs: [],
      toolCalls: [],
      durationMs: Date.now() - startedAt,
      error: {
        code: error instanceof Error && error.message.includes("timeout") ? "TIMEOUT" : "SANDBOX_ERROR",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  } finally {
    if (sandbox) {
      await sandbox.stop({ blocking: true }).catch(() => undefined);
    }
  }
}
```

- [ ] **Step 6: Implement the AI SDK tool wrapper**

Create `tool/codemode-run.ts`:

```ts
import { tool } from "ai";
import { z } from "zod";
import { createBridgeToken } from "@/lib/codemode/bridge-token";
import { normalizeRunInput } from "@/lib/codemode/limits";
import { runInVercelSandbox } from "@/lib/codemode/vercel-runtime";
import type { CodemodeIndexedTool, CodemodeResult } from "@/lib/codemode/types";

function bridgeUrlFromBase(baseUrl: string): string {
  return new URL("/api/codemode/bridge", baseUrl).toString();
}

export function createCodemodeRunTool(options: {
  userId: string;
  baseUrl?: string;
  bridgeSecret?: string;
  tools: CodemodeIndexedTool[];
  runSandbox?: typeof runInVercelSandbox;
}) {
  return tool({
    description:
      "Execute JavaScript orchestration code in Vercel Sandbox with access to connected MCP tools via callTool(serverId, toolName, args), searchTools(query), and listServers(). Use return for the final value.",
    inputSchema: z.object({
      code: z.string().describe("JavaScript code body to execute. Top-level await and return are supported."),
      input: z.any().optional().describe("JSON-serializable input exposed as input inside the sandbox."),
      timeoutMs: z.number().optional().describe("Optional timeout in milliseconds. Defaults to 30000."),
    }),
    async *execute(rawInput) {
      yield { state: "loading" as const };

      try {
        if (!options.baseUrl) throw new Error("codemode_run base URL is required");
        const bridgeSecret = options.bridgeSecret || process.env.CODEMODE_BRIDGE_SECRET || "";
        if (!bridgeSecret) throw new Error("CODEMODE_BRIDGE_SECRET is required");

        const runInput = normalizeRunInput(rawInput);
        const bridgeToken = createBridgeToken(
          {
            userId: options.userId,
            expiresAt: Date.now() + runInput.timeoutMs + 60_000,
            allowedTools: options.tools.map((toolDef) => ({
              serverId: toolDef.serverId,
              toolName: toolDef.toolName,
            })),
          },
          bridgeSecret
        );

        const runSandbox = options.runSandbox ?? runInVercelSandbox;
        const result: CodemodeResult = await runSandbox({
          ...runInput,
          tools: options.tools,
          bridgeUrl: bridgeUrlFromBase(options.baseUrl),
          bridgeToken,
        });

        if (result.error) {
          yield { state: "output-error" as const, success: false, error: result.error.message, result };
          return;
        }

        yield { state: "output-available" as const, success: true, result };
      } catch (error) {
        yield {
          state: "output-error" as const,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test lib/codemode/vercel-runtime.test.mjs tool/codemode-run.test.mjs`

Expected: PASS, 3 tests.

- [ ] **Step 8: Commit**

Run:

```bash
git add package.json package-lock.json lib/codemode/vercel-runtime.ts lib/codemode/vercel-runtime.test.mjs tool/codemode-run.ts tool/codemode-run.test.mjs
git commit -m "feat: run codemode in vercel sandbox"
```

## Task 6: Register `codemode_run` In The Chat Agent

**Files:**
- Modify: `agent/chat-agent.ts`
- Modify: `app/api/chat/route.ts`
- Modify: `agent/chat-agent-instructions.ts`
- Test: `agent/chat-agent-instructions.test.mjs`

- [ ] **Step 1: Update the instruction test first**

Modify `agent/chat-agent-instructions.test.mjs` so the first test expects no remote pin for `codemode_run`:

```js
test("does not pin codemode_run as a remote-only tool", () => {
  assert.deepEqual(PINNED_REMOTE_TOOLS, []);
});
```

Keep the existing instruction text assertions, because they remain useful when `codemode_run` is directly available.

- [ ] **Step 2: Run the instruction test to verify it fails**

Run: `node --test agent/chat-agent-instructions.test.mjs`

Expected: FAIL because `PINNED_REMOTE_TOOLS` is still `["codemode_run"]`.

- [ ] **Step 3: Update chat agent options and local tools**

Modify `agent/chat-agent.ts`:

```ts
import { createCodemodeRunTool } from "@/tool/codemode-run";
import { indexMcpSessions } from "@/lib/codemode/tool-index";
import { sessions } from "@mcp-ts/sdk/server";
```

Extend `CreateMcpAgentOptions`:

```ts
interface CreateMcpAgentOptions {
  userId?: string;
  gatewaySelections?: GatewayServerSelection[];
  agentPreferences?: Partial<AgentPreferences>;
  baseUrl?: string;
}
```

Replace the disabled local tools block in `createMcpAgent` with:

```ts
  const userSessions = await sessions.list(userId);
  const codemodeTools = await indexMcpSessions(manager, userSessions).catch((error) => {
    console.error("[Codemode] Failed to index MCP tools:", error);
    return [];
  });

  const localTools: Record<string, any> = {
    codemode_run: createCodemodeRunTool({
      userId,
      baseUrl: options.baseUrl,
      tools: codemodeTools,
    }),
  };
```

Keep the existing `combinedTools = { ...localTools, ...remoteTools }` merge.

- [ ] **Step 4: Pass base URL from the chat route**

Modify `app/api/chat/route.ts` before `createMcpAgent`:

```ts
  const origin =
    req.headers.get("origin") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
```

Pass it into the agent:

```ts
  const { agent, cleanup } = await createMcpAgent({
    userId: userId,
    gatewaySelections: Array.isArray(body.gatewaySelections) ? body.gatewaySelections : undefined,
    agentPreferences: body.agentPreferences,
    baseUrl: origin,
  });
```

- [ ] **Step 5: Update instructions**

Modify `agent/chat-agent-instructions.ts`:

```ts
export const PINNED_REMOTE_TOOLS: string[] = [];
```

Keep the guidance that says direct `codemode_run` should be preferred for multi-step tool chaining.

- [ ] **Step 6: Run the instruction test to verify it passes**

Run: `node --test agent/chat-agent-instructions.test.mjs`

Expected: PASS.

- [ ] **Step 7: Run TypeScript check**

Run: `npx tsc --noEmit`

Expected: exit 0. If the SDK session type does not match `indexMcpSessions`, adjust the local `SessionLike` type or map `sessions.list(userId)` into `{ sessionId, serverName }[]` in `chat-agent.ts`.

- [ ] **Step 8: Commit**

Run:

```bash
git add agent/chat-agent.ts app/api/chat/route.ts agent/chat-agent-instructions.ts agent/chat-agent-instructions.test.mjs
git commit -m "feat: expose codemode run tool"
```

## Task 7: Verification And Guarded Sandbox Smoke Test

**Files:**
- No new files required.

- [ ] **Step 1: Run all codemode unit tests**

Run:

```bash
node --test lib/codemode/*.test.mjs tool/codemode-run.test.mjs agent/chat-agent-instructions.test.mjs
```

Expected: PASS for all listed tests.

- [ ] **Step 2: Run the project build**

Run: `npm run build`

Expected: exit 0.

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Expected: exit 0 or only pre-existing warnings unrelated to codemode. If new lint errors appear in codemode files, fix them before continuing.

- [ ] **Step 4: Manual smoke test when environment is available**

Prerequisites:

- `CODEMODE_BRIDGE_SECRET` is set.
- Vercel Sandbox credentials/OIDC are available as described by the Vercel Sandbox docs.
- The app is reachable by the sandbox through the base URL passed from `/api/chat`.

Prompt in chat:

```text
Use codemode_run to list your available MCP servers and return the result.
```

Expected tool result:

```json
{
  "success": true,
  "result": {
    "value": [
      { "serverId": "...", "serverName": "...", "toolCount": 1 }
    ],
    "error": null
  }
}
```

Then prompt with a connected read-only MCP tool:

```text
Use codemode_run to search for the relevant MCP tool for calendar events, call it if available with a tiny limit, and summarize the result.
```

Expected: `codemode_run` records at least one `toolCalls` entry with `ok: true` when such a connected tool exists. If no matching MCP tool exists, the run should still finish and return an explanatory `value`.

- [ ] **Step 5: Commit verification fixes if needed**

Run only if verification required code changes:

```bash
git add <changed-files>
git commit -m "fix: polish codemode verification"
```

## Self-Review

- Spec coverage: Tasks cover built-in local tool registration, Vercel Sandbox execution, MCP tool calling through a host bridge, structured result shape, limits, cleanup, error normalization, and guarded integration verification.
- Placeholder scan: The plan has concrete files, tests, commands, and expected results. No empty implementation steps remain.
- Type consistency: `serverId` is consistently the MCP `sessionId`, bridge requests use `serverId` and `toolName`, and `CodemodeResult` matches the approved spec.
