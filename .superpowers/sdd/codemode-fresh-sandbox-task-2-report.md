# Task 2 Report: Fresh-Sandbox Cleanup Evaluation

## Code changed

No runtime code changed.

## Reason

`ExecutorLike` is an adapter contract, not a fresh-sandbox guarantee. Its
`execute(code, providers, options)` implementation can evaluate the generated
code in a persistent host realm, as the focused executor-runtime test does.
The generated wrapper exposes friendly aliases such as `github` by assigning
them to `globalThis`, while provider names remain Cloudflare-safe internal
identifiers such as `__mcp_server_0`.

Removing the wrapper's `finally` cleanup would therefore leak aliases into a
local/test executor's `globalThis` after execution and make the generic
`ExecutorLike` contract unsafe for non-Cloudflare implementations. The
existing cleanup restores a prior global value or deletes a newly-created
alias, while preserving all requested helpers during execution:

- `github.search_issues(...)`
- `servers.github.search_issues(...)`
- `callTool(...)`
- `codemode.search(...)`
- `codemode.describe(...)`
- Cloudflare-safe internal provider names

Cloudflare or TanStack integrations may create a fresh sandbox per execution,
but that lifecycle belongs to a particular executor implementation and cannot
be assumed by this shared runtime adapter.

## Files changed

- `.superpowers/sdd/codemode-fresh-sandbox-task-2-report.md` (this report only)

## Tests run

- `npm run build` - passed.
- `node --test test\\executor-runtime.test.mjs` - passed (9 tests, 0 failures),
  including `executor runtime restores global namespace aliases after execution`.
- `git diff --check` - passed.
