# Built-In Codemode Run Design

## Summary

`mcp-client` should no longer require a separate MCP server that exposes a code-mode tool. The chat agent will expose a built-in local AI SDK tool named `codemode_run` that runs user-provided JavaScript/TypeScript-style orchestration code inside Vercel Sandbox and allows that code to call the user's connected MCP tools through a constrained host bridge.

The design follows the shape of `mcp-ts/packages/code-mode`: a structured run API, indexed MCP tool metadata, console/log capture, tool-call tracking, limits, and a JSON result envelope. The runtime backend will be Vercel Sandbox instead of `isolated-vm`.

## Goals

- Add a first-party `codemode_run` tool to `mcp-client` so the agent can chain scripts and MCP tool calls without depending on an external code-mode MCP server.
- Execute untrusted or model-generated orchestration code in Vercel Sandbox, not in the Next.js server process.
- Allow sandboxed code to call the current user's connected MCP tools through `mcp-client`'s existing authenticated MCP client path.
- Return structured output that includes the final value, logs, tool calls, duration, and errors.
- Keep the feature testable without requiring Vercel Sandbox credentials in local unit tests.

## Non-Goals

- Do not build a standalone MCP server inside `mcp-client`.
- Do not persist Vercel Sandbox instances between chat turns in the first version.
- Do not expose MCP credentials, session objects, or raw app environment variables to sandboxed code.
- Do not add UI for editing or inspecting code-mode runs beyond the existing tool-call rendering.
- Do not support long-running preview servers or exposed ports in the first version.

## Current Context

`mcp-client/agent/chat-agent.ts` builds a `ToolLoopAgent`, loads remote MCP tools through `MultiSessionClient`, `ToolRouter`, and `AIAdapter`, and currently leaves `localTools` empty except for remote/built-in server search tools returned by `getRemoteMcpTools`.

`mcp-ts/packages/code-mode` already defines useful concepts:

- `CodeModeRuntime.run(code, input, options)`
- `ToolServer`, `ToolDefinition`, `IndexedTool`
- `CodeModeResult` with logs, tool calls, duration, and errors
- tool indexing and helper APIs like search/list/interface lookup
- a `call_tool_chain` MCP tool implemented on top of that runtime

The Vercel Sandbox SDK docs, last checked on May 23, 2026, define the needed APIs:

- `Sandbox.create({ runtime, networkPolicy, env, timeout })`
- `sandbox.writeFiles([{ path, content }])`
- `sandbox.runCommand("node", ["runner.mjs"])`
- `command.stdout()`, `command.stderr()`, `command.exitCode`
- `sandbox.stop({ blocking: true })`
- `sandbox.updateNetworkPolicy(...)`

## Architecture

The first version will add a local tool implementation under `mcp-client`, likely in `tool/codemode-run.ts` plus small supporting modules in `lib/codemode/`.

`createMcpAgent` will add `codemode_run` to the local tool set. The tool will receive the current `MultiSessionClient` manager and call options so it can execute MCP calls as the current user.

The run flow:

1. Validate `code`, `input`, and `timeoutMs`.
2. Build an MCP tool index from the connected remote MCP tools available to the agent.
3. Create a short-lived Vercel Sandbox.
4. Write a generated runner file and payload file into the sandbox.
5. Run `node runner.mjs`.
6. The runner executes the submitted code and emits structured bridge requests/results.
7. The host executes requested MCP calls through the current `MultiSessionClient`.
8. Collect stdout, stderr, parsed JSON result, tool-call records, and duration.
9. Stop the sandbox in `finally`.

## Sandbox Bridge

Sandboxed code will receive a small API:

```ts
const result = await callTool(serverId, toolName, args);
const tools = searchTools("calendar events");
const servers = listServers();
console.log("progress");
return result;
```

The bridge must not expose direct network credentials or MCP client instances. The sandbox runner will communicate with the host using structured JSON messages. The host will be the only process allowed to execute MCP tools.

The exact transport can be chosen during implementation, but it should preserve these constraints:

- Every tool call includes `serverId`, `toolName`, and JSON-serializable `args`.
- Every response includes either `{ success: true, result }` or `{ success: false, error }`.
- Calls are recorded with ID, start time, duration, args, success, and error.
- Limits are enforced host-side, not only in sandbox code.

The preferred implementation is a host-run loop using a generated runner protocol that can process sequential and parallel calls safely. If the Vercel Sandbox command API makes true interactive stdin awkward, the first version may run the sandboxed user code as an async function that records intended bridge calls and re-enters execution through a deterministic message protocol. The implementation plan should resolve this detail with a small spike before broad edits.

## Tool Input

`codemode_run` will expose:

```ts
{
  code: string;
  input?: unknown;
  timeoutMs?: number;
}
```

Defaults:

- `timeoutMs`: 30 seconds, capped by a server-side maximum.
- `input`: `{}`.

Future fields such as `allowedServers`, `networkPolicy`, or `files` can be added later, but they are intentionally out of scope for the first version.

## Tool Result

The returned structured result should resemble:

```ts
{
  value?: unknown;
  stdout: string;
  stderr: string;
  logs: Array<{ level: "log" | "info" | "warn" | "error"; args: unknown[] }>;
  toolCalls: Array<{
    id: string;
    serverId: string;
    toolName: string;
    args: unknown;
    startedAt: number;
    durationMs: number;
    ok: boolean;
    error?: string;
  }>;
  durationMs: number;
  error?: {
    code: "SANDBOX_ERROR" | "TIMEOUT" | "TOOL_NOT_FOUND" | "TOOL_EXECUTION_FAILED" | "RESULT_TOO_LARGE";
    message: string;
  };
}
```

The AI SDK tool result can return this object directly. Text rendering can use JSON until a richer renderer is needed.

## Limits And Safety

The host implementation will enforce:

- maximum code length
- maximum timeout
- maximum tool calls per run
- maximum concurrent tool calls
- maximum result size
- maximum captured stdout/stderr/log bytes

Vercel Sandbox should use `runtime: "node22"` initially because `mcp-client` currently declares Node `>=22 <23`. The sandbox must always be stopped in `finally` with `sandbox.stop({ blocking: true })` after results are collected.

The first version should use the narrowest network access practical. If the runner can operate without outbound internet after startup, use `networkPolicy: "deny-all"` for execution. If package installation or remote fetches are required later, that should be a separate opt-in design.

## Errors

Errors should be normalized into stable codes:

- `TIMEOUT`: command timeout or host abort signal.
- `TOOL_NOT_FOUND`: bridge call references a tool that is not in the current index.
- `TOOL_EXECUTION_FAILED`: MCP call reaches the tool but fails.
- `RESULT_TOO_LARGE`: returned value or captured output exceeds limits.
- `SANDBOX_ERROR`: sandbox creation, file write, command execution, parse, or cleanup failure.

Partial results should include logs and tool-call history where available.

## Testing

Unit tests should cover:

- input validation and default limit resolution
- result parsing from sandbox stdout/stderr
- tool-call record creation and limit enforcement
- MCP tool adapter behavior using fake `listTools`/`callTool` implementations
- error normalization

The real Vercel Sandbox integration should be behind an environment check. If credentials are unavailable, integration tests should skip with a clear message rather than fail.

## Rollout

1. Add the `@vercel/sandbox` dependency.
2. Implement pure code-mode types, limits, tool indexing, and result parsing.
3. Implement the Vercel Sandbox runtime.
4. Register `codemode_run` as a local tool in `createMcpAgent`.
5. Add tests for the pure pieces and a guarded integration check.
6. Run type-check/build and a smoke test when Vercel Sandbox credentials are available.

## Open Implementation Detail

The only implementation detail intentionally deferred to the plan is the exact bidirectional bridge transport between the host and a running sandbox command. The design requires host-mediated MCP calls and host-side limits; the implementation plan should verify the simplest Vercel Sandbox-compatible mechanism before the rest of the feature is built.
