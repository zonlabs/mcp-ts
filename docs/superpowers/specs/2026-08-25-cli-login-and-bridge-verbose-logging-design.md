# CLI Login Reuse and Bridge Verbose Logging

## Goal

Make `mcpa login` idempotent for users who already have a usable saved CLI session, and make `mcpa serve --verbose` expose the remote bridge connection lifecycle without adding noise to normal `mcpa serve` output.

## Scope

This change is limited to the CLI package. It does not change the hosted OAuth routes, bridge protocol, daemon ownership rules, or the normal high-level gateway summary.

## Login Behavior

`loginToRemote` will perform a saved-session preflight before creating the loopback callback server or opening a browser:

1. If no saved session exists for the normalized remote origin, continue with the existing interactive browser flow.
2. If a saved session exists, call `ensureFreshAuthSession`.
3. If the session is already fresh or refresh succeeds, return that session immediately and report the existing account as signed in. Do not create a callback listener or open a browser.
4. If refresh fails with `InvalidAuthSessionError`, continue with the existing interactive browser flow. The successful exchange will overwrite the invalid saved session.
5. If refresh fails for a transient or unexpected reason, propagate the error. Do not hide a remote outage or network failure by opening a login page.

The preflight belongs in `loginToRemote`, rather than only in `cmdLogin`, so every caller receives the same idempotent login semantics.

## Bridge Verbose Logging

`RemoteBridgeClientOptions` will gain a `verbose` boolean. `cmdServe` will pass `args.verbose` when constructing the bridge. The bridge will route lifecycle messages through the existing `serverLog("bridge", message, verbose)` function.

Verbose mode will report:

- each connection attempt, without tokens or authorization headers;
- WebSocket open;
- successful initialization, including remote server and tool totals;
- WebSocket errors and connection setup failures;
- socket close code and reason;
- reconnect scheduling and delay;
- existing initialization, message-handling, and catalog-clear failures.

Close reasons are decoded as UTF-8 and omitted when empty. Logs must never include access tokens, refresh tokens, or authorization header values.

Without `--verbose`, lifecycle messages remain suppressed. Users continue to see only the existing high-level spinners, gateway summary, remote server overview, warnings, and terminal replacement notice.

## Data Flow

For login, `cmdLogin` calls `loginToRemote`, which first consults the auth store. A reusable session returns directly; only a missing or conclusively invalid session proceeds to callback server creation, browser authorization, code exchange, and persistence. Gateway activation still runs after either successful path.

For bridge logs, `runCli` parses `--verbose`, `cmdServe` passes it into `RemoteBridgeClient`, and each connection lifecycle boundary calls `serverLog`. The existing output helper is the single suppression point for non-verbose execution.

## Error Handling

- Invalid saved refresh credentials trigger interactive reauthentication.
- Transient refresh failures fail `mcpa login` with the original error.
- Bridge failures retain the current reconnect and terminal-close behavior; logging is observational only.
- Logging failures are not introduced as a new control-flow path.

## Testing

Tests will be added before implementation and observed failing for the intended reason.

- Login tests: fresh saved session skips browser flow; expiring session refreshes and skips browser flow; invalid refresh falls back to interactive login; transient refresh failure is propagated.
- Bridge tests: verbose lifecycle output covers attempt, open, initialization totals, close reason/code, retry delay, and errors.
- Suppression tests: the same bridge lifecycle emits no detailed output when verbose is false or omitted.
- Serve wiring test: `cmdServe({ verbose: true })` passes verbosity to `RemoteBridgeClient`.
- Existing CLI package tests and type/build checks run after the focused tests pass.

## Compatibility

The new bridge option is optional and defaults to non-verbose behavior, preserving existing programmatic callers. CLI command syntax and persisted auth format remain unchanged.
