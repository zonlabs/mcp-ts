# Foreground Serve Sign-In Consent

## Goal

When `mcpa serve` starts without an authenticated remote session, ask the user for consent before opening a browser.

## Behavior

- In an interactive foreground terminal, display `Sign in now?` as a Yes/No confirmation with Yes selected by default.
- On Yes, run the existing `loginToRemote` flow used by `mcpa login`, then activate the remote bridge.
- On No or prompt cancellation, continue with local MCP servers only and do not open a browser.
- In daemon mode or a non-interactive terminal, do not prompt or open a browser; continue locally.
- When a valid session already exists, connect the remote bridge without prompting.
- Do not display `No saved remote session.` in the foreground consent flow.

## Implementation

Add a small prompt helper using the existing Clack confirmation control. Keep consent handling separate from OAuth so `loginToRemote` remains unchanged. The foreground serve flow calls OAuth only after affirmative consent and settles initial catalog readiness as local-only after a decline.

## Tests

Cover affirmative consent, declined consent, and existing daemon behavior. Verify that affirmative consent invokes `loginToRemote`, while decline does not invoke it and settles the initial catalog as local-only.
