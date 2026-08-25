# MCP CLI Single-Gateway Command Design

## Context

The CLI currently has two command execution architectures. A command can use a running local gateway, or it can initialize local MCP servers and query the authenticated remote MCP HTTP endpoint directly. The second path avoids WebSocket bridge replacement, but duplicates routing, timeout, discovery, and cleanup logic across `list`, `search`, `schema`, and `call`.

Live testing exposed the cost of that duplication. With no daemon running, individual commands took approximately 16–25 seconds. `list` also printed its local catalog and later crashed with `Error: Not connected`.

The timeout helpers explain both symptoms: racing an already-started Promise rejects the wrapper without cancelling the underlying MCP request or server startup. The abandoned work keeps Node alive, and closing its client can make the still-running request reject after command output has already been rendered.

## Goals

- Give all normal CLI commands one predictable gateway execution path.
- Make `serve` and the daemon two lifecycle modes for the same gateway implementation.
- Automatically start a managed daemon when a command needs a gateway and no healthy gateway exists.
- Reuse a healthy foreground `serve` process without adopting or stopping it.
- Keep one combined local and remote catalog warm for subsequent commands.
- Eliminate detached timeout work, post-output failures, and redundant command routing.
- Use conventional names that describe behavior rather than transport details.
- Preserve explicit custom endpoint behavior.

## Non-goals

- Do not introduce another gateway mode, cache daemon, or local-only daemon.
- Do not add a `--no-daemon` one-shot architecture.
- Do not retain deprecated aliases or other backward-compatibility code for renamed CLI client APIs.
- Do not fall back to another endpoint, transport, source, or execution path after an operation fails.
- Do not change the intentional single-owner WebSocket bridge protocol.
- Do not automatically kill, adopt, or restart an unknown port owner.
- Do not refactor unrelated client, bridge protocol, or tool-router code.

## Architecture

There is one gateway implementation with two ways to run it:

- `mcpa serve` runs the gateway in the foreground, displays live activity, and stops on Ctrl+C.
- `mcpa daemon start` runs the same gateway in the background and records its PID, port, and logs.

The normal `list`, `search`, `schema`, and `call` commands use the following flow:

1. Inspect the recorded daemon port before the default port.
2. Reuse a healthy managed daemon or foreground gateway.
3. If no gateway exists, spawn the managed daemon and wait up to 15 seconds for health.
4. Connect one command client to the selected gateway endpoint.
5. Execute the command against the gateway's authoritative combined catalog.
6. Close only the short-lived command client; leave the gateway running.

Concurrent cold commands coordinate through an atomic startup lock created with exclusive file creation. The lock owner starts the daemon; other commands poll gateway health instead of spawning another process. A lock is stale only when its recorded owner PID is dead or its timestamp exceeds the readiness deadline.

Both foreground and background gateways write one `GatewayProcessInfo` record containing `pid`, `port`, `startedAt`, and `mode: "foreground" | "daemon"`. This replaces the daemon-only PID record. The owning process removes the record during clean shutdown only when the recorded PID still matches its own. Status and command discovery therefore find custom-port foreground gateways, while `daemon stop` remains restricted to records whose mode is `daemon` and whose PID owns the recorded port.

An explicit `--endpoint` continues to connect directly to that endpoint and never starts a daemon.

## Shared Interfaces and Naming

Use a small shared command client module instead of repeating lifecycle logic in each command:

```ts
interface RunningGateway {
  endpoint: string;
  port: number;
  state: "running" | "external";
  managed: boolean;
  portOwnerPid?: number;
}

interface EnsureGatewayOptions {
  port?: number;
  startupTimeoutMs?: number;
}

async function ensureGatewayRunning(options?: EnsureGatewayOptions): Promise<RunningGateway>;
async function withGatewayClient<T>(
  options: EnsureGatewayOptions | undefined,
  action: (client: McpEndpointClient) => Promise<T>,
): Promise<T>;
```

Naming rules:

- Use `get` for read-only status inspection.
- Use `ensure` for an operation that may start the daemon.
- Use `with` only for a scoped resource that is always closed.
- Use `serverStartupErrors` for per-server initialization failures.
- Use `fetchGatewayCatalog` for catalog retrieval through gateway meta-tools.
- Retain established names when they already communicate intent; avoid rename-only churn.

Retain the existing `getDaemonStatus` and `DaemonStatus` names because they accurately describe background-process lifecycle state. Rename the transport-neutral `RemoteToolClient` and `connectRemote` APIs to `McpEndpointClient` and `connectMcpEndpoint`, update every internal consumer, and remove the old exports without compatibility aliases.

Remove these obsolete helpers and paths:

- `createAuthenticatedRemoteClient`
- `mergeSearchResults`
- command-level `withTimeout` and `withDeadline`
- local-plus-remote one-shot initialization branches
- reads of a standalone registry's remote catalog while its bridge is disabled
- duplicated tool-resolution and gateway fallback blocks
- deprecated aliases and compatibility wrappers for the removed client names

Use `connectMcpEndpoint` as the generic MCP HTTP client for the local gateway or an explicit custom endpoint. Authentication refresh remains owned by the gateway's `RemoteBridgeClient`.

## Command Behavior

### `list`

Retrieve the catalog from the gateway. Compact listing uses advertised counts; `list <server>` and `list --tools` request detailed tools for each selected server. Counts and details must never be fabricated. Catalog or per-server failures are rendered as explicit diagnostics.

### `search`

Search the gateway's already combined and indexed catalog. An empty gateway result is authoritative and must not trigger another discovery path.

### `schema`

Resolve canonical IDs through the gateway. Multiple unqualified matches produce an ambiguity error requiring `serverId::toolName`.

### `call`

Resolve and execute through the gateway. Mutating tools are not retried automatically. A completed tool call is never repeated because of a connection fallback.

## Authentication and Bridge Ownership

Daemon startup loads and refreshes the saved CLI session through the existing bridge authentication logic. Without a saved session, local-only operation is the gateway's explicit authenticated state, not an error fallback. Commands display an actionable `mcpa login` warning and do not attempt any alternate remote connection.

A healthy foreground gateway is classified as externally managed and reused. Automatic command startup must not start a daemon when that foreground gateway is healthy. Replacement by a gateway on another machine remains governed by the existing single-owner bridge protocol and is surfaced through the foreground/daemon logs.

## Failure Handling

- `occupied`: report the owning PID and suggest another port; do not start or stop anything.
- `unhealthy`: report the daemon log path; do not blindly restart it.
- readiness timeout: terminate only the child spawned by the current attempt, clear its PID record, and report the log path.
- missing authentication: continue with local tools and print the login guidance once.
- gateway request failure: close the command client and return the original error. Do not silently enter a second execution architecture.
- explicit endpoint failure: return the endpoint error unchanged; do not retry through the managed gateway.
- command completion: no pending MCP request, startup task, timer, subprocess, or unhandled rejection may remain in the command process.

## Performance Expectations

- Cold command: bounded by the existing 15-second daemon readiness deadline, with progress displayed.
- Warm `list`, `search`, and `schema`: complete within 2 seconds in deterministic local integration tests.
- Warm `call`: add no more than 2 seconds of CLI routing overhead beyond downstream tool execution in deterministic tests.
- After rendering a result or error, the command process exits within 500 ms in lifecycle tests.

Live remote timings are recorded as diagnostics rather than asserted in unit tests because network and upstream tool latency are external.

## Test Strategy

- Add failing tests proving each normal command calls `ensureGatewayRunning` and never creates a direct authenticated remote client.
- Verify a stopped state starts one daemon, waits for health, and then executes the original command.
- Verify concurrent command startups converge on one managed daemon rather than spawning duplicates.
- Verify a healthy foreground `serve` gateway is reused and remains externally managed.
- Verify custom recorded ports, occupied ports, unhealthy daemons, stale PID records, and startup failure cleanup.
- Reproduce the `list` post-output `Not connected` failure and assert there are no unhandled rejections or live handles after completion.
- Verify empty searches remain empty, canonical tool IDs resolve correctly, ambiguity errors remain actionable, and mutating calls are never retried.
- Verify the cold and warm performance expectations using controlled fake transports and clocks.
- Run CLI type-check, all CLI tests, the full workspace build, `git diff --check`, and package dry-run.
- Live-smoke `list → search GitHub → schema → read-only call → list` and confirm one stable gateway and remote catalog throughout.

## Documentation and Skill Updates

Update the CLI README and root README to explain that normal commands automatically reuse or start the background gateway. Update the tracked and installed `mcp-cli` skills to require gateway preflight, explain foreground versus daemon lifecycle, and remove direct one-shot HTTP guidance. Synchronize the workspace skill lock hash after the final skill content is validated.
