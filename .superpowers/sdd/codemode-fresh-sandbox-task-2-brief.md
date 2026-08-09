# Task 2: Evaluate fresh-sandbox cleanup simplification for executor runtime

## Context

Repository: `C:\Users\Harish_Mehta\Desktop\my_dirs\workspace\mcp-ts`

Package: `packages/code-mode`

The user asked whether we can avoid temporary global alias issues the same way Cloudflare/TanStack do: by creating/destroying a sandbox per execution.

Current executor runtime:

- Uses internal provider names like `__mcp_server_0`.
- Exposes normal helper aliases like `github.search_issues(...)` by assigning `globalThis[alias] = provider`.
- Restores/deletes those aliases in a `finally` block after execution.

## Goal

Evaluate whether there is a safe code change that better aligns with fresh-sandbox lifecycle while preserving:

- `github.search_issues(...)`
- `servers.github.search_issues(...)`
- `callTool(...)`
- `codemode.search(...)`
- `codemode.describe(...)`
- Cloudflare-safe internal provider names

## Important decision rule

If removing the `finally` cleanup would leak aliases in the local/test `ExecutorLike` contract, or would make `ExecutorLike` unsafe for non-Cloudflare implementations, do not remove it. In that case, make no runtime code change and update the report with the reasoning.

If you find a safe simplification with no helper/API regression and no new broad dependency, implement it with tests.

## Required output

Write a report to `.superpowers/sdd/codemode-fresh-sandbox-task-2-report.md` containing:

- Whether code changed.
- If no code changed, the exact reason.
- If code changed, files changed and tests run.

## Verification if code changes

Run:

```powershell
npm run build
node --test test\executor-runtime.test.mjs
npm test
git diff --check
```
