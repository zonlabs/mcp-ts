# MCP CLI Single-Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route normal MCP CLI commands through one automatically available persistent gateway, eliminating slow one-shot discovery, direct authenticated HTTP command routing, duplicated fallbacks, and post-timeout connection failures.

**Architecture:** `serve` and the daemon run the same gateway; they differ only in foreground/background lifecycle. `list`, `search`, `schema`, and `call` use `withGatewayClient`, which reuses a healthy gateway or starts one managed daemon, then executes exactly once through that endpoint. A shared process record makes custom-port foreground and daemon gateways discoverable, and an atomic startup lock prevents concurrent cold commands from spawning duplicate daemons.

**Tech Stack:** TypeScript 5.9, Node.js 20+, MCP SDK 2.x, Vitest 4, tsup, PowerShell live-smoke commands.

## Global Constraints

- Normal `list`, `search`, `schema`, and `call` commands must use one gateway path; no direct authenticated remote HTTP path remains.
- Do not retain deprecated aliases, compatibility wrappers, legacy PID readers, or fallback execution branches.
- Explicit endpoint commands execute only against that endpoint and return its original failure.
- Never kill, adopt, restart, or overwrite an unknown process or gateway record.
- A mutating tool call is executed at most once.
- Cold startup must become healthy within 15 seconds; warm command routing must meet the deterministic 2-second test budget.
- Use conventional names: `GatewayProcessInfo`, `RunningGateway`, `McpEndpointClient`, `connectMcpEndpoint`, `ensureGatewayRunning`, `withGatewayClient`, `fetchGatewayCatalog`, and `serverStartupErrors`.
- Preserve unrelated `AGENTS.md`, `packages/client/package.json`, `docs/cli/2026-08-24-mcp-cli-stability-session.md`, and `scratch/` changes.

---

### Task 1: Rename the endpoint client without compatibility exports

**Files:**
- Modify: `packages/cli/src/client.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/commands/bench.ts`
- Modify: `packages/cli/src/commands/codegen.ts`
- Modify: `packages/cli/src/commands/connect.ts`
- Modify: `packages/cli/src/commands/list.ts`
- Modify: `packages/cli/src/commands/search.ts`
- Modify: `packages/cli/src/commands/schema.ts`
- Modify: `packages/cli/src/commands/call.ts`
- Modify: `packages/cli/src/gateway/command-resolution.ts`
- Test: `packages/cli/tests/client.test.ts`

**Interfaces:**
- Produces: `McpEndpointClientOptions`, `McpEndpointClient`, and `connectMcpEndpoint(endpoint, options?)`.
- Removes: `RemoteToolClientOptions`, `RemoteToolClient`, and `connectRemote` exports entirely.

- [ ] **Step 1: Change the client test to require only the new names**

```ts
import * as clientModule from "../src/client.js";
import { connectMcpEndpoint } from "../src/client.js";

test("connectMcpEndpoint uses the OAuth-capable HTTP connector", async () => {
  const connection = {
    listTools: async () => ({ tools: [] }),
    callTool: vi.fn(),
    close: vi.fn(async () => undefined),
    getServerId: () => "example.test_mcp",
    getServerName: () => "example.test",
    getServerUrl: () => "https://example.test/mcp",
  };
  const connector = vi.fn(async () => connection);
  const client = await connectMcpEndpoint("https://example.test/mcp", connector as never);
  expect(connector).toHaveBeenCalledWith("https://example.test/mcp", expect.objectContaining({
    serverId: "example.test_mcp",
    serverName: "example.test",
  }));
  expect("connectRemote" in clientModule).toBe(false);
  expect("RemoteToolClient" in clientModule).toBe(false);
  await client.close();
});
```

- [ ] **Step 2: Run the focused test and verify the new exports are missing**

Run: `npx vitest run packages/cli/tests/client.test.ts`

Expected: FAIL because `connectMcpEndpoint` is not exported.

- [ ] **Step 3: Perform the strict rename and update existing consumers**

In `packages/cli/src/client.ts`, rename the symbols directly:

```ts
export interface McpEndpointClientOptions { /* existing option fields */ }
export class McpEndpointClient implements ToolClient { /* existing implementation */ }
export async function connectMcpEndpoint(
  endpoint: string,
  optionsOrConnector?: McpEndpointClientOptions | HttpConnector | Record<string, string>,
): Promise<McpEndpointClient> { /* existing validated connection lifecycle */ }
```

Update every internal CLI import and call site to use `McpEndpointClient` and `connectMcpEndpoint`, without changing routing behavior in this task. Export only the new names from `packages/cli/src/index.ts`:

```ts
export { connectMcpEndpoint, McpEndpointClient } from "./client.js";
```

Do not export aliases for the old names.

- [ ] **Step 4: Run the client test and CLI type-check**

Run: `npx vitest run packages/cli/tests/client.test.ts`

Expected: PASS.

Run: `npm run type-check --workspace packages/cli`

Expected: PASS with no old endpoint-client names remaining.

- [ ] **Step 5: Commit the endpoint-client rename**

```bash
git add packages/cli/src/client.ts packages/cli/src/index.ts packages/cli/src/commands packages/cli/src/gateway/command-resolution.ts packages/cli/tests/client.test.ts
git commit -m "refactor(cli): use endpoint client naming"
```

### Task 2: Replace daemon-only PID state with an owned gateway process record

**Files:**
- Modify: `packages/cli/src/gateway/daemon.ts`
- Modify: `packages/cli/src/commands/serve.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/tests/daemon.test.ts`
- Test: `packages/cli/tests/serve-logging.test.ts`

**Interfaces:**
- Produces: `GatewayProcessInfo`, `readGatewayProcess`, `writeGatewayProcess`, `clearGatewayProcess`, `getGatewayProcessPath`, and concurrency-safe `spawnDaemon`.
- Consumes: existing `DaemonStatus`, `getDaemonStatus`, port-owner validation, and 15-second health readiness.
- Removes: `DaemonInfo`, `readDaemonPid`, `writeDaemonPid`, `clearDaemonPid`, and `getDaemonPidPath`.

- [ ] **Step 1: Add failing process ownership and classification tests**

```ts
test("classifies a healthy foreground record as external on its custom port", () => {
  expect(classifyDaemonStatus({
    requestedPort: 8765,
    processRecord: { pid: 4321, port: 9123, startedAt: 1, mode: "foreground" },
    processAlive: true,
    portOwnerPid: 4321,
    gatewayResponsive: true,
    now: 20_000,
  })).toMatchObject({ state: "external", managed: false, port: 9123 });
});

test("refuses daemon stop for a foreground gateway record", () => {
  expect(validateManagedStop(
    { pid: 4321, port: 9123, startedAt: 1, mode: "foreground" },
    true,
    4321,
  )).toEqual({ allowed: false, reason: expect.stringContaining("foreground") });
});

test("clearGatewayProcess removes only the caller-owned record", () => {
  writeGatewayProcess({ pid: 1234, port: 8765, startedAt: 1, mode: "daemon" });
  expect(clearGatewayProcess(9999)).toBe(false);
  expect(readGatewayProcess()?.pid).toBe(1234);
  expect(clearGatewayProcess(1234)).toBe(true);
});
```

- [ ] **Step 2: Run daemon tests and verify signature/export failures**

Run: `npx vitest run packages/cli/tests/daemon.test.ts packages/cli/tests/serve-logging.test.ts`

Expected: FAIL because the gateway process record API does not exist.

- [ ] **Step 3: Implement the strict process-record API**

Use this record and path; do not read `daemon.pid`:

```ts
export interface GatewayProcessInfo {
  pid: number;
  startedAt: number;
  port: number;
  mode: "foreground" | "daemon";
}

export function getGatewayProcessPath(): string {
  return join(getDaemonDir(), "gateway-process.json");
}

export function clearGatewayProcess(expectedPid: number): boolean {
  const current = readGatewayProcess();
  if (!current || current.pid !== expectedPid) return false;
  unlinkSync(getGatewayProcessPath());
  return true;
}
```

Change `classifyDaemonStatus` so `managed` is true only when `mode === "daemon"`, the PID is alive, and the PID owns the port. A healthy `foreground` record is `external`. `validateManagedStop` must reject `foreground` records before checking port ownership.

- [ ] **Step 4: Add atomic cold-start coordination**

Add an exclusive `gateway-start.lock` containing `{ pid, createdAt }`. `spawnDaemon` must acquire it with `openSync(path, "wx")`. If another live owner holds it, poll `getDaemonStatus` until the gateway becomes `running`/`external` or the 15-second deadline expires. Remove a lock only when its owner PID matches; reclaim it only when the owner is dead or the timestamp is older than 15 seconds.

After acquiring the lock, check status again before spawning. Write a `mode: "daemon"` process record immediately after spawn and release the startup lock in `finally`.

- [ ] **Step 5: Register foreground and daemon ownership from `cmdServe`**

After `LocalHttpMcp.start()` returns, write:

```ts
writeGatewayProcess({
  pid: process.pid,
  port,
  startedAt: Date.now(),
  mode: process.env.MCPA_DAEMON === "1" ? "daemon" : "foreground",
});
```

Add `clearGatewayProcess(process.pid)` to the shutdown cleanup after the HTTP listener closes. Also clear it in the local startup error path only when owned by `process.pid`.

- [ ] **Step 6: Test process records, custom ports, concurrency, and safe stop**

Run: `npx vitest run packages/cli/tests/daemon.test.ts packages/cli/tests/serve-logging.test.ts`

Expected: PASS, including two concurrent `spawnDaemon` calls producing one spawn and one reused result.

- [ ] **Step 7: Commit gateway process ownership**

```bash
git add packages/cli/src/gateway/daemon.ts packages/cli/src/commands/serve.ts packages/cli/src/index.ts packages/cli/tests/daemon.test.ts packages/cli/tests/serve-logging.test.ts
git commit -m "fix(cli): coordinate gateway process ownership"
```

### Task 3: Introduce the single gateway command client

**Files:**
- Create: `packages/cli/src/gateway/command-client.ts`
- Delete: `packages/cli/src/gateway/command-resolution.ts`
- Create: `packages/cli/tests/command-client.test.ts`
- Delete: `packages/cli/tests/command-resolution.test.ts`

**Interfaces:**
- Consumes: `getDaemonStatus`, `spawnDaemon`, `loadAuthSession`, `connectMcpEndpoint`.
- Produces: `RunningGateway`, `EnsureGatewayOptions`, `GatewayClientOptions`, `ensureGatewayRunning`, and `withGatewayClient`.
- Removes: authenticated remote-client creation, merged search ranking, Promise-race timeouts, and gateway fallback resolution.

- [ ] **Step 1: Write failing tests for deterministic gateway selection**

```ts
it("starts one daemon when the gateway is stopped", async () => {
  const getStatus = vi.fn(async () => ({ state: "stopped", port: 8765, managed: false }));
  const startDaemon = vi.fn(async () => ({ pid: 42, port: 8765, managed: true, logPath: "daemon.log" }));
  const result = await ensureGatewayRunning({}, { getStatus: getStatus as never, startDaemon: startDaemon as never });
  expect(startDaemon).toHaveBeenCalledOnce();
  expect(result).toEqual({ endpoint: "http://127.0.0.1:8765/mcp", port: 8765, state: "running", managed: true });
});

it("reuses a foreground gateway without starting a daemon", async () => {
  const startDaemon = vi.fn();
  const result = await ensureGatewayRunning({}, {
    getStatus: vi.fn(async () => ({ state: "external", port: 9123, managed: false, gatewayResponsive: true })) as never,
    startDaemon: startDaemon as never,
  });
  expect(result.endpoint).toBe("http://127.0.0.1:9123/mcp");
  expect(startDaemon).not.toHaveBeenCalled();
});

it.each(["occupied", "unhealthy"])("returns the %s error without starting another path", async (state) => {
  const startDaemon = vi.fn();
  await expect(ensureGatewayRunning({}, {
    getStatus: vi.fn(async () => ({ state, port: 8765, portOwnerPid: 99, logPath: "daemon.log" })) as never,
    startDaemon: startDaemon as never,
  })).rejects.toThrow();
  expect(startDaemon).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the new test and verify the module is missing**

Run: `npx vitest run packages/cli/tests/command-client.test.ts`

Expected: FAIL because `command-client.ts` does not exist.

- [ ] **Step 3: Implement the command client with no alternate route**

```ts
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
```

`ensureGatewayRunning` returns healthy `running`/`external` states, calls `spawnDaemon` only for `stopped`/`starting`, and throws state-specific errors for `occupied`/`unhealthy`. `withGatewayClient` uses `options.endpoint` directly when supplied; otherwise it calls `ensureGatewayRunning`. It connects once, invokes `action` once, and closes that client in `finally`. It never catches an action error to retry elsewhere.

When no saved remote session exists, call `onWarning` once with `Remote tools are unavailable. Run mcpa login.` before using the local-only gateway.

- [ ] **Step 4: Remove the obsolete command-resolution module and tests**

Delete `command-resolution.ts` and its test. Confirm no source contains `createAuthenticatedRemoteClient`, `mergeSearchResults`, `withTimeout`, or `resolveGateway`.

- [ ] **Step 5: Run focused tests**

Run: `npx vitest run packages/cli/tests/command-client.test.ts packages/cli/tests/daemon.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the single gateway command client**

```bash
git add packages/cli/src/gateway/command-client.ts packages/cli/src/gateway/command-resolution.ts packages/cli/tests/command-client.test.ts packages/cli/tests/command-resolution.test.ts
git commit -m "refactor(cli): centralize gateway command access"
```

### Task 4: Add strict gateway meta-tool operations

**Files:**
- Create: `packages/cli/src/gateway/meta-tools.ts`
- Modify: `packages/cli/src/core.ts`
- Create: `packages/cli/tests/meta-tools.test.ts`
- Modify: `packages/cli/tests/core.test.ts`

**Interfaces:**
- Consumes: `McpEndpointClient`, `parseToolRef`, and the four gateway meta-tool names.
- Produces: `GatewayServerSummary`, `GatewayToolSummary`, `fetchGatewayServers`, `searchGatewayTools`, `fetchGatewayToolSchemas`, `resolveGatewayToolId`, and `callGatewayTool`.

- [ ] **Step 1: Write strict meta-tool tests**

```ts
it("propagates list_mcp_servers failure without searching tools", async () => {
  const client = { callTool: vi.fn().mockRejectedValue(new Error("catalog offline")) } as never;
  await expect(fetchGatewayServers(client, "")).rejects.toThrow("catalog offline");
  expect(client.callTool).toHaveBeenCalledTimes(1);
});

it("requires a canonical ID when exact names are ambiguous", async () => {
  const client = fakeMetaClient({ search: [
    { tool_id: "github::create_issue", server_id: "github", server_name: "GitHub", tool_name: "create_issue" },
    { tool_id: "gitlab::create_issue", server_id: "gitlab", server_name: "GitLab", tool_name: "create_issue" },
  ] });
  await expect(resolveGatewayToolId(client, "create_issue")).rejects.toThrow("canonical server::tool ID");
});

it("executes a canonical tool exactly once", async () => {
  const client = fakeMetaClient({ callResult: { content: [] } });
  await callGatewayTool(client, "github::create_issue", { title: "x" });
  expect(client.callTool).toHaveBeenCalledWith("call_mcp_tool", {
    toolId: "github::create_issue",
    args: { title: "x" },
  });
  expect(client.callTool).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the tests and verify the module is missing**

Run: `npx vitest run packages/cli/tests/meta-tools.test.ts`

Expected: FAIL because `meta-tools.ts` does not exist.

- [ ] **Step 3: Implement strict JSON/text result parsing and meta-tool calls**

Create one parser that throws on `isError`, missing text content, or invalid JSON. Each exported operation calls exactly one named meta-tool. `resolveGatewayToolId` returns canonical input unchanged; for an unqualified name it calls `searchGatewayTools` once, filters case-insensitive exact tool names, returns one ID, throws not-found for zero, and throws ambiguity for more than one.

`fetchGatewayToolSchemas` accepts canonical IDs only and makes one batch `get_mcp_tool_schemas` call. `callGatewayTool` accepts one canonical ID and makes one `call_mcp_tool` call with `{ toolId, args }`.

- [ ] **Step 4: Make generic endpoint search deterministic rather than error-fallback based**

In `core.ts`, retain capability selection: use the meta search tool when it exists, otherwise use the router index. Remove the `catch` around the meta-tool call so a selected meta search failure propagates instead of falling back to router search.

- [ ] **Step 5: Run meta-tool and core tests**

Run: `npx vitest run packages/cli/tests/meta-tools.test.ts packages/cli/tests/core.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit strict gateway operations**

```bash
git add packages/cli/src/gateway/meta-tools.ts packages/cli/src/core.ts packages/cli/tests/meta-tools.test.ts packages/cli/tests/core.test.ts
git commit -m "refactor(cli): use strict gateway meta tools"
```

### Task 5: Simplify `list` to the authoritative gateway catalog

**Files:**
- Modify: `packages/cli/src/commands/list.ts`
- Test: `packages/cli/tests/list.test.ts`

**Interfaces:**
- Consumes: `withGatewayClient`, `fetchGatewayServers`, and `searchGatewayTools`.
- Produces: `fetchGatewayCatalog(client, configs, options)` and existing compact/detailed rendering.
- Removes: `enableBridge`, standalone registry startup, local/remote Promise merging, deadlines, and fallback discovery.

- [ ] **Step 1: Replace standalone-routing tests with authoritative gateway tests**

```ts
it("starts or reuses one gateway and renders its combined catalog", async () => {
  const withClient = vi.spyOn(commandClient, "withGatewayClient").mockImplementation(async (_options, action) =>
    action(fakeGatewayClient({ servers: [
      { server_id: "filesystem", server_name: "filesystem", tool_count: 14 },
      { server_id: "github", server_name: "Github - Personal", tool_count: 44 },
    ] }) as never),
  );
  await cmdList(undefined, output, {});
  expect(withClient).toHaveBeenCalledOnce();
  expect(rendered).toContain("filesystem");
  expect(rendered).toContain("Github - Personal");
});

it("propagates catalog failure without local or HTTP fallback", async () => {
  vi.spyOn(commandClient, "withGatewayClient").mockRejectedValue(new Error("catalog offline"));
  await expect(cmdList(undefined, output, {})).rejects.toThrow("catalog offline");
  expect(withMcpGateway).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run list tests and confirm old routing expectations fail**

Run: `npx vitest run packages/cli/tests/list.test.ts`

Expected: FAIL because `cmdList` still uses standalone and authenticated HTTP paths.

- [ ] **Step 3: Implement `fetchGatewayCatalog` without deadlines or fallback**

Call `fetchGatewayServers` once. For compact output, use advertised counts without fetching tools. For `--tools` or a selected server, call `searchGatewayTools` once per advertised server concurrently, preserve successful server details, and attach an explicit per-server `error` state for rejected detail calls. Do not synthesize names or run a global search.

Classify local entries by configured server key/name and all remaining entries as remote. Disabled configured servers remain rendering-only entries.

- [ ] **Step 4: Route `cmdList` only through `withGatewayClient`**

```ts
await withGatewayClient(
  {
    onProgress: (message) => writeLine(output, pc.dim(message)),
    onWarning: (message) => writeLine(output, pc.yellow(message)),
  },
  async (client) => {
    const catalog = await fetchGatewayCatalog(client, allConfigs, { showTools, serverName });
    renderListOutput(catalog.localServers, catalog.remoteServers, disabledServers, allConfigs, options, output);
  },
);
```

- [ ] **Step 5: Run list tests and verify no post-completion rejection**

Run: `npx vitest run packages/cli/tests/list.test.ts`

Expected: PASS, including an `unhandledRejection` listener remaining uncalled after a failed catalog request and client close.

- [ ] **Step 6: Commit the list simplification**

```bash
git add packages/cli/src/commands/list.ts packages/cli/tests/list.test.ts
git commit -m "refactor(cli): list through persistent gateway"
```

### Task 6: Route search, schema, and call through the same gateway once

**Files:**
- Modify: `packages/cli/src/commands/search.ts`
- Modify: `packages/cli/src/commands/schema.ts`
- Modify: `packages/cli/src/commands/call.ts`
- Modify: `packages/cli/src/cli.ts`
- Modify: `packages/cli/tests/search.test.ts`
- Create: `packages/cli/tests/schema.test.ts`
- Create: `packages/cli/tests/call.test.ts`

**Interfaces:**
- Consumes: `withGatewayClient`, `searchGatewayTools`, `resolveGatewayToolId`, `fetchGatewayToolSchemas`, and `callGatewayTool`.
- Removes: gateway probing, direct remote authentication, local registry initialization, broad catches, and all operation fallback.

- [ ] **Step 1: Write failing single-path command tests**

```ts
it("returns an empty gateway search without another path", async () => {
  const callTool = vi.fn(async () => textResult([]));
  vi.spyOn(commandClient, "withGatewayClient").mockImplementation(async (_options, action) => action({ callTool } as never));
  await cmdSearch("missing", 5, undefined, output);
  expect(rendered).toContain("No matching tools found.");
  expect(callTool).toHaveBeenCalledTimes(1);
});

it("fetches a canonical schema in one batch request", async () => {
  const callTool = vi.fn(async () => textResult({ tools: [{ toolId: "github::create_issue" }] }));
  vi.spyOn(commandClient, "withGatewayClient").mockImplementation(async (_options, action) => action({ callTool } as never));
  await cmdLocalSchema(["github::create_issue"], undefined, output);
  expect(callTool).toHaveBeenCalledTimes(1);
});

it("does not retry a failed mutating call", async () => {
  const callTool = vi.fn().mockRejectedValue(new Error("downstream rejected"));
  vi.spyOn(commandClient, "withGatewayClient").mockImplementation(async (_options, action) => action({ callTool } as never));
  await expect(cmdCall("github::create_issue", "{}", undefined, output)).rejects.toThrow("downstream rejected");
  expect(callTool).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the focused command tests and verify old paths fail expectations**

Run: `npx vitest run packages/cli/tests/search.test.ts packages/cli/tests/schema.test.ts packages/cli/tests/call.test.ts`

Expected: FAIL because the commands still contain multiple routes.

- [ ] **Step 3: Simplify `search`**

For a supplied endpoint, call `withGatewayClient({ endpoint }, action)`; otherwise omit `endpoint` so the managed gateway is ensured. Call `searchGatewayTools` once, format results, and return. Remove local/remote merge and all catches that change paths.

- [ ] **Step 4: Simplify `schema`**

Resolve every unqualified reference with `resolveGatewayToolId`; preserve canonical references. Make one batch `fetchGatewayToolSchemas` call for the resulting IDs. Propagate not-found, ambiguity, connection, and schema errors unchanged.

- [ ] **Step 5: Simplify `call`**

Resolve the reference once, then call `callGatewayTool` once. Parse arguments before connecting. Remove remote-first and local fallback branches so a failed call cannot be repeated.

- [ ] **Step 6: Run command tests and CLI type-check**

Run: `npx vitest run packages/cli/tests/search.test.ts packages/cli/tests/schema.test.ts packages/cli/tests/call.test.ts`

Expected: PASS.

Run: `npm run type-check --workspace packages/cli`

Expected: PASS with zero references to removed names.

- [ ] **Step 7: Commit unified command routing**

```bash
git add packages/cli/src/commands/search.ts packages/cli/src/commands/schema.ts packages/cli/src/commands/call.ts packages/cli/src/cli.ts packages/cli/tests/search.test.ts packages/cli/tests/schema.test.ts packages/cli/tests/call.test.ts
git commit -m "refactor(cli): route commands through one gateway"
```

### Task 7: Enforce cold/warm lifecycle and performance behavior

**Files:**
- Create: `packages/cli/tests/command-lifecycle.test.ts`
- Modify: `packages/cli/tests/daemon.test.ts`

**Interfaces:**
- Consumes: `ensureGatewayRunning`, `withGatewayClient`, and injectable daemon/client dependencies.
- Produces: deterministic lifecycle and performance regression coverage.

- [ ] **Step 1: Add a failing cold-then-warm lifecycle test**

Use fake clocks and injected dependencies. The first command reports startup and calls `spawnDaemon` once; four subsequent command scopes reuse the running endpoint. Assert each warm scope settles before advancing the fake clock by 2 seconds and that client `close` is called exactly once per scope.

```ts
expect(startDaemon).toHaveBeenCalledTimes(1);
expect(connect).toHaveBeenCalledTimes(5);
expect(clients.every((client) => client.close.mock.calls.length === 1)).toBe(true);
```

- [ ] **Step 2: Add a failing command-exit cleanup test**

Create a deferred gateway request and attach a temporary `process.on("unhandledRejection", listener)`. Assert `withGatewayClient` does not close its client while the action is pending. Reject the deferred request, await the returned command rejection, and then assert `close` was called exactly once while `listener` remained uncalled after timers and microtasks drained.

- [ ] **Step 3: Run lifecycle tests and verify failures before final cleanup changes**

Run: `npx vitest run packages/cli/tests/command-lifecycle.test.ts packages/cli/tests/daemon.test.ts`

Expected: FAIL until all startup ownership and client cleanup paths settle their work.

- [ ] **Step 4: Make the smallest lifecycle corrections required by the tests**

Keep startup polling in `spawnDaemon`, command-client ownership in `withGatewayClient`, and request ownership in the command action. Do not add Promise races, detached work, retry catches, or alternate execution branches.

- [ ] **Step 5: Run lifecycle tests**

Run: `npx vitest run packages/cli/tests/command-lifecycle.test.ts packages/cli/tests/daemon.test.ts`

Expected: PASS with no unhandled rejection and one daemon spawn.

- [ ] **Step 6: Commit lifecycle regression coverage**

```bash
git add packages/cli/tests/command-lifecycle.test.ts packages/cli/tests/daemon.test.ts packages/cli/src/gateway/command-client.ts packages/cli/src/gateway/daemon.ts
git commit -m "test(cli): cover gateway command lifecycle"
```

### Task 8: Update version, documentation, and installed skills

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `package-lock.json`
- Modify: `packages/cli/README.md`
- Modify: `README.md`
- Modify: `skills/mcp-cli/SKILL.md`
- Modify outside repository: `C:/Users/Harish_Mehta/Desktop/my_dirs/workspace/.agents/skills/mcp-cli/SKILL.md`
- Modify outside repository: `C:/Users/Harish_Mehta/.agents/skills/mcp-cli/SKILL.md`
- Modify outside repository: `C:/Users/Harish_Mehta/Desktop/my_dirs/workspace/skills-lock.json`

**Interfaces:**
- Produces: CLI version `0.3.0` and synchronized skill guidance for the single-gateway model.
- Removes: all one-shot authenticated HTTP and `0.2.2+` bridge-safe routing guidance.

- [ ] **Step 1: Bump the CLI package and lock entry to `0.3.0`**

Update only `@mcp-ts/cli` version fields in `packages/cli/package.json` and `package-lock.json`; do not change dependency ranges unrelated to this CLI release.

- [ ] **Step 2: Rewrite CLI documentation around one gateway**

Document these exact behaviors:

```text
mcpa serve          # foreground gateway with live logs
mcpa daemon start   # the same gateway in the background
mcpa list           # reuses either gateway, or starts the managed daemon
```

State that normal commands never create a direct remote HTTP command path, failures do not switch transports, and `daemon stop` cannot stop a foreground or unknown process.

- [ ] **Step 3: Rewrite the `mcp-cli` skill preflight and execution guidance**

Require CLI `0.3.0+`. The skill must check `daemon status`, reuse `running`/`external`, allow normal commands to auto-start from `stopped`, and treat `occupied`/`unhealthy` as hard diagnostic states. Remove one-shot HTTP, `--no-daemon`, direct authenticated client, and fallback guidance. Retain the safe `execFile` batch example.

- [ ] **Step 4: Validate and synchronize all skill copies**

Run the skill validator against the tracked, workspace, and global copies. Copy the finalized tracked skill verbatim to both installed locations, compute the `SKILL.md` SHA-256 lock hash using the existing filename-plus-bytes algorithm, and update only `skills.mcp-cli.computedHash` in `skills-lock.json`.

Expected: all three files have identical hashes and all validators pass.

- [ ] **Step 5: Commit tracked release and documentation changes**

```bash
git add packages/cli/package.json package-lock.json packages/cli/README.md README.md skills/mcp-cli/SKILL.md
git commit -m "docs(cli): document automatic gateway lifecycle"
```

### Task 9: Full verification and live smoke

**Files:**
- Verify only; do not stage unrelated files or the excluded session markdown.

**Interfaces:**
- Verifies every global constraint and the live remote catalog behavior.

- [ ] **Step 1: Prove removed code is absent**

Run:

```bash
rg -n "connectRemote|RemoteToolClient|createAuthenticatedRemoteClient|mergeSearchResults|withTimeout|withDeadline" packages/cli/src packages/cli/tests
rg -n "withMcpGateway|enableBridge|resolveGateway" packages/cli/src/commands/list.ts packages/cli/src/commands/search.ts packages/cli/src/commands/schema.ts packages/cli/src/commands/call.ts
```

Expected: both commands return no matches.

- [ ] **Step 2: Run focused static and unit verification**

Run: `npm run type-check --workspace packages/cli`

Expected: exit 0.

Run: `npm test --workspace packages/cli`

Expected: all CLI tests pass with zero unhandled rejections.

- [ ] **Step 3: Run workspace and packaging verification**

Run: `npm run build`

Expected: exit 0.

Run: `git diff --check main...HEAD`

Expected: no output, exit 0.

Run: `npm pack --workspace packages/cli --dry-run`

Expected: package dry-run includes compiled CLI entrypoints and README, with no source-only or secret files.

- [ ] **Step 4: Live-smoke cold startup and warm commands**

First confirm no managed daemon is running. Then use the pinned local CLI for:

```text
mcpa list
mcpa daemon status
mcpa search "GitHub pull requests" --limit 5
mcpa schema <canonical-read-only-tool-id>
mcpa call <canonical-read-only-tool-id> <validated-json>
mcpa list
```

Expected: the first command starts one managed daemon within 15 seconds; status reports `running`; all later commands reuse the same PID and port; GitHub remains listed; no bridge replacement, `Not connected`, duplicate daemon, or post-output exception occurs. Record cold and warm wall times in the handoff.

- [ ] **Step 5: Verify branch contents and push**

Run `git status --short`, `git diff --cached --name-only`, and `git log --oneline main..HEAD`. Confirm the excluded session markdown and unrelated user changes are not staged or committed. Push `fix/mcp-cli-stability` only to `origin` (`zonlabs/mcp-ts`) and update PR #199.

### Task 10: Close whole-branch review gaps

**Files:**
- Modify the focused CLI gateway, daemon, login, list, output, documentation, skill, and tests required by the findings below.
- Delete obsolete `withMcpGateway` and `serve --detached` compatibility surfaces.

**Interfaces:**
- Produces live local-only-to-authenticated bridge activation without restarting the gateway.
- Extends gateway process ownership with a generation token verified through gateway health before stop or adoption.
- Produces strict port validation and truthful public CLI exit codes.
- Produces a documented machine-readable call mode suitable for `execFile` batching.
- Exposes configured server startup failures in the authoritative list catalog.

- [ ] **Step 1: Add failing end-to-end tests for every final-review finding**

Cover local-only daemon followed by login and remote catalog activation without PID/port change; failed and timed-out configured servers in list output (including reload failures); PID reuse with a mismatched gateway generation; occupied/unhealthy/start-timeout public process exit codes; invalid ports including zero, fractional, NaN, and out-of-range input; and a machine-readable batch call with no session whose stdout parses as JSON.

- [ ] **Step 2: Activate a bridge after login without gateway restart**

Give the running gateway one strict, authenticated activation path triggered after a saved login session changes. It must not create a second gateway or command-owned bridge, must be idempotent, and must preserve single bridge ownership. Add deterministic local-only → login → remote-ready coverage.

- [ ] **Step 3: Propagate configured startup diagnostics**

Include registry startup/reload failures in `list_mcp_servers` and render enabled failed servers with explicit discovery/error state. Never omit them silently and never fabricate tool names.

- [ ] **Step 4: Make process identity and ports strict**

Add a cryptographically random gateway generation token to the process record, expose it through the gateway health response, and require PID, port ownership, mode, and matching generation before managed stop. Validate integer ports in `1..65535` before persisting or binding and record the listener's actual port.

- [ ] **Step 5: Make CLI failure/output contracts truthful**

Ensure daemon/serve errors propagate to a non-zero public process exit code. Add an explicit machine-readable call mode that sends only JSON to stdout and diagnostics to stderr; update the safe batch skill example to use it.

- [ ] **Step 6: Remove obsolete compatibility surfaces**

Delete `withMcpGateway`, its bridge-owning options/export/tests, and `serve --detached`. Background operation is only `daemon start`.

- [ ] **Step 7: Verify, synchronize skills, live-smoke, and push**

Run focused tests, CLI type-check, full CLI suite, workspace build, diff check, and package dry-run. Repeat local-only → login activation and authenticated cold/warm read-only live smokes with stable PID/port. Synchronize and validate all skill copies and lock hash. Push only `fix/mcp-cli-stability` to `origin` and confirm PR #199 head.
