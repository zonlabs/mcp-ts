# CLI Login Reuse and Bridge Verbose Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reuse valid saved CLI authentication during `mcpa login` and expose the complete remote bridge lifecycle only when `mcpa serve --verbose` is enabled.

**Architecture:** Add a small saved-session preflight at the start of `loginToRemote`, using the existing auth store refresh semantics and falling through to browser login only for missing or invalid credentials. Add an optional verbosity flag to `RemoteBridgeClient`, centralize bridge lifecycle messages through its existing `serverLog` dependency, and pass the flag from `cmdServe`.

**Tech Stack:** TypeScript 5.9, Node.js 20+, Vitest 4, `ws`, existing `@clack/prompts` CLI UX helpers.

## Global Constraints

- Do not change hosted OAuth routes, bridge protocol messages, daemon ownership, or persisted auth format.
- Do not emit access tokens, refresh tokens, or authorization header values in logs.
- Normal `mcpa serve` output must retain only its high-level status, summary, warnings, and remote server overview.
- `RemoteBridgeClientOptions.verbose` is optional and defaults to non-verbose behavior.
- Follow red-green-refactor for every production behavior change.

---

### Task 1: Reuse Saved Authentication During Login

**Files:**
- Create: `packages/cli/tests/oauth.test.ts`
- Modify: `packages/cli/src/gateway/oauth.ts:5-85`

**Interfaces:**
- Consumes: `loadAuthSession(remote): AuthSession | null`, `ensureFreshAuthSession(remote): Promise<AuthSession>`, and `InvalidAuthSessionError` from `auth-store.ts`.
- Produces: `reuseSavedAuthSession(remote, dependencies?): Promise<AuthSession | null>`, used by `loginToRemote` before interactive browser setup.

- [ ] **Step 1: Write failing tests for saved-session decisions**

Create `packages/cli/tests/oauth.test.ts` with dependency-driven tests that avoid the real auth file and network:

```typescript
import { describe, expect, it, vi } from "vitest";
import { InvalidAuthSessionError, type AuthSession } from "../src/gateway/auth-store.js";
import { reuseSavedAuthSession } from "../src/gateway/oauth.js";

const session: AuthSession = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  accessTokenExpiresAt: Date.now() + 120_000,
};

describe("reuseSavedAuthSession", () => {
  it("returns a fresh or successfully refreshed saved session", async () => {
    const ensureFresh = vi.fn(async () => session);
    await expect(reuseSavedAuthSession("https://remote.example/mcp", {
      load: () => session,
      ensureFresh,
    })).resolves.toBe(session);
    expect(ensureFresh).toHaveBeenCalledWith("https://remote.example/mcp");
  });

  it("returns null when no saved session exists", async () => {
    const ensureFresh = vi.fn();
    await expect(reuseSavedAuthSession("https://remote.example", {
      load: () => null,
      ensureFresh,
    })).resolves.toBeNull();
    expect(ensureFresh).not.toHaveBeenCalled();
  });

  it("returns null when saved refresh credentials are invalid", async () => {
    await expect(reuseSavedAuthSession("https://remote.example", {
      load: () => session,
      ensureFresh: async () => { throw new InvalidAuthSessionError(); },
    })).resolves.toBeNull();
  });

  it("preserves transient refresh failures", async () => {
    await expect(reuseSavedAuthSession("https://remote.example", {
      load: () => session,
      ensureFresh: async () => { throw new Error("refresh service unavailable"); },
    })).rejects.toThrow("refresh service unavailable");
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run packages/cli/tests/oauth.test.ts`

Expected: FAIL because `reuseSavedAuthSession` is not exported.

- [ ] **Step 3: Implement the saved-session preflight**

In `oauth.ts`, import `ensureFreshAuthSession` and `InvalidAuthSessionError`, then add:

```typescript
interface SavedSessionDependencies {
  load?: typeof loadAuthSession;
  ensureFresh?: typeof ensureFreshAuthSession;
}

export async function reuseSavedAuthSession(
  remote: string,
  dependencies: SavedSessionDependencies = {},
): Promise<AuthSession | null> {
  const load = dependencies.load ?? loadAuthSession;
  if (!load(remote)) return null;
  try {
    return await (dependencies.ensureFresh ?? ensureFreshAuthSession)(remote);
  } catch (error) {
    if (error instanceof InvalidAuthSessionError) return null;
    throw error;
  }
}
```

At the first line of `loginToRemote`, before callback URL creation, call the helper. If it returns a session, render the same account/origin success message and auth-file note used by interactive completion, then return immediately. Extract a private `reportSignedIn(remote, session)` helper if needed to keep the two success paths identical.

- [ ] **Step 4: Run focused login/auth tests and verify GREEN**

Run: `npx vitest run packages/cli/tests/oauth.test.ts packages/cli/tests/login.test.ts packages/cli/tests/auth-store.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit the login fix**

```bash
git add packages/cli/src/gateway/oauth.ts packages/cli/tests/oauth.test.ts
git commit -m "fix(cli): reuse valid session during login"
```

### Task 2: Add Verbose Remote Bridge Lifecycle Logs

**Files:**
- Modify: `packages/cli/tests/bridge.test.ts:1-479`
- Modify: `packages/cli/src/gateway/bridge-client.ts:49-325`

**Interfaces:**
- Consumes: existing `serverLog(server, line, verbose)` from `ux.ts`.
- Produces: optional `RemoteBridgeClientOptions.verbose?: boolean` and verbose-only lifecycle output.

- [ ] **Step 1: Mock and capture bridge logs in tests**

At the top of `bridge.test.ts`, add a hoisted mock before the bridge behavior assertions:

```typescript
const bridgeMocks = vi.hoisted(() => ({ serverLog: vi.fn() }));
vi.mock("../src/ux.js", () => ({ serverLog: bridgeMocks.serverLog }));
```

Reset `bridgeMocks.serverLog` between tests.

- [ ] **Step 2: Write failing verbose lifecycle tests**

Add tests that construct `setup({ verbose: true, reconnectInitialDelayMs: 100 })`, then assert:

```typescript
expect(bridgeMocks.serverLog).toHaveBeenCalledWith(
  "bridge",
  "connecting to wss://api.mcp-assistant.in/bridge/connect",
  true,
);
```

After `socket.open()` and an initialize response containing two servers and three total tools, assert messages for `websocket opened` and `initialized remote catalog: 2 servers, 3 tools`. Close with code `1006` and reason `network dropped`, advance fake timers, and assert `websocket closed: code 1006 (network dropped)` plus `reconnecting in 100ms`.

Add a separate test using default options that drives the same attempt/open/initialize/close path and asserts every `serverLog` call receives a falsey third argument, proving `serverLog` suppresses detailed output in normal mode.

- [ ] **Step 3: Run bridge tests and verify RED**

Run: `npx vitest run packages/cli/tests/bridge.test.ts`

Expected: FAIL because the verbosity option and lifecycle messages do not exist, close reasons are discarded, and existing failure logs omit verbosity.

- [ ] **Step 4: Implement centralized lifecycle logging**

Add `verbose?: boolean` to `RemoteBridgeClientOptions` and a private helper:

```typescript
private log(message: string): void {
  serverLog("bridge", message, this.options.verbose);
}
```

Use it at these boundaries:

```typescript
const socketUrl = this.socketUrl();
this.log(`connecting to ${socketUrl}`);
const socket = socketFactory(socketUrl, { headers: { Authorization: `Bearer ${accessToken}` } });

socket.on("open", () => {
  this.log("websocket opened");
  // existing initialization behavior
});

const serverCount = initialized.remoteCatalog.servers.length;
const toolCount = initialized.remoteCatalog.servers.reduce(
  (total, server) => total + server.tools.length,
  0,
);
this.log(`initialized remote catalog: ${serverCount} ${serverCount === 1 ? "server" : "servers"}, ${toolCount} ${toolCount === 1 ? "tool" : "tools"}`);
```

Change the close listener to pass its `reason` buffer into `handleClose`. Log the close code and decoded non-empty reason before preserving the existing terminal/reconnect decisions. In `scheduleReconnect`, log `reconnecting in ${delay}ms`. Replace every direct bridge `serverLog` call with `this.log` so initialization, parsing, socket, connection, and catalog-clear errors all respect the same verbosity option.

- [ ] **Step 5: Run bridge tests and verify GREEN**

Run: `npx vitest run packages/cli/tests/bridge.test.ts`

Expected: all bridge tests PASS, including reconnect and readiness tests.

- [ ] **Step 6: Commit bridge logging**

```bash
git add packages/cli/src/gateway/bridge-client.ts packages/cli/tests/bridge.test.ts
git commit -m "fix(cli): log verbose remote bridge lifecycle"
```

### Task 3: Propagate Serve Verbosity and Run Regression Checks

**Files:**
- Modify: `packages/cli/tests/serve-logging.test.ts:71-85,194-218`
- Modify: `packages/cli/src/commands/serve.ts:253-276`

**Interfaces:**
- Consumes: `ServeArgs.verbose?: boolean` and `RemoteBridgeClientOptions.verbose?: boolean`.
- Produces: verbose flag propagation from `mcpa serve --verbose` into the bridge client.

- [ ] **Step 1: Write a failing serve wiring test**

Add a test that provides a saved auth session, starts `cmdServe({ port: 9123, verbose: true })`, waits for bridge construction, and asserts:

```typescript
expect(serveMocks.bridgeOptions[0]).toEqual(
  expect.objectContaining({ verbose: true }),
);
```

Stop the serving promise with the existing `stopServing` helper. Add a companion assertion with `verbose` omitted and expect the captured option to be falsey.

- [ ] **Step 2: Run the serve logging test and verify RED**

Run: `npx vitest run packages/cli/tests/serve-logging.test.ts`

Expected: FAIL because `cmdServe` does not pass `args.verbose` into `RemoteBridgeClient`.

- [ ] **Step 3: Pass verbosity into the bridge**

Add the option alongside `remoteUrl`:

```typescript
bridge = new RemoteBridgeClient(localRegistry, {
  remoteUrl: remote,
  verbose: args.verbose,
  // existing callbacks and token provider
});
```

Keep `describeRemoteCatalogChanges` and its high-level verbose catalog messages unchanged.

- [ ] **Step 4: Run focused CLI tests**

Run: `npx vitest run packages/cli/tests/oauth.test.ts packages/cli/tests/login.test.ts packages/cli/tests/auth-store.test.ts packages/cli/tests/bridge.test.ts packages/cli/tests/serve-logging.test.ts`

Expected: all focused tests PASS with no unhandled rejections.

- [ ] **Step 5: Run package type-check, full tests, and build**

Run: `npm run type-check --prefix packages/cli`

Expected: TypeScript exits with code 0.

Run: `npm test --prefix packages/cli`

Expected: CLI build completes and the full Vitest suite passes.

Run: `npm run build --prefix packages/cli`

Expected: bridge protocol, tool router, and CLI builds complete successfully.

- [ ] **Step 6: Inspect the final diff and commit wiring**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only the plan and intended CLI source/test files appear.

```bash
git add packages/cli/src/commands/serve.ts packages/cli/tests/serve-logging.test.ts docs/superpowers/plans/2026-08-25-cli-login-and-bridge-verbose-logging.md
git commit -m "test(cli): verify bridge verbose propagation"
```
