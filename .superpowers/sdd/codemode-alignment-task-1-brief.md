# Task 1: Align @mcp-ts/codemode executor API with Cloudflare/TanStack Code Mode patterns

## Context

Repository: `C:\Users\Harish_Mehta\Desktop\my_dirs\workspace\mcp-ts`

Package: `packages/code-mode`

The user wants the Cloudflare executor runtime in `@mcp-ts/codemode` aligned with Cloudflare/TanStack Code Mode patterns:

- Primary ergonomic API: namespaced helper calls like `github.search_issues(args)`.
- Discovery API should also support Cloudflare-like `codemode.search(query, limit?)` and `codemode.describe(target)`.
- Keep existing compatibility helpers: `searchTools(query, limit?)`, `getToolSchema(serverId, toolName)`, `callTool(serverId, toolName, args)`, `callToolRaw(serverId, toolName, args)`.
- Keep current Cloudflare-safe internal provider names like `__mcp_server_0`, not user/server names as executor provider variables.
- Preserve global alias cleanup after execution.

## Required behavior

1. Add `codemode.search(query, limit?)` in executor runtime scripts.
   - It should return the same shape as current `searchTools(query, limit?)`.

2. Add `codemode.describe(target)` in executor runtime scripts.
   - `target` should accept `"serverAlias.toolAlias"` where alias means the sanitized helper name visible in Code Mode.
   - It should return focused tool schema/type info for a matching generated helper.
   - A minimal acceptable result is the same tool object returned by `getToolSchema(serverId, toolName)`, plus enough fields to be useful if already present.
   - For unknown targets, return an error object rather than throwing from host code.

3. Add collision detection for generated helper aliases in the executor runtime.
   - If two tools on the same server sanitize to the same helper name, `runtime.run(...)` should return a `SANDBOX_ERROR` with a clear collision message before executing code.
   - Example collision: `foo-bar` and `foo.bar` both sanitize to `foo_bar`.
   - Do not add broad new dependencies.

4. Keep existing tests passing.

## Test requirements

Add focused tests in `packages/code-mode/test/executor-runtime.test.mjs`:

- `codemode.search(...)` works from inside an executor script.
- `codemode.describe("github.search_issues")` returns the GitHub search tool schema/info.
- A same-server alias collision returns `SANDBOX_ERROR` and does not call the executor.

Run:

```powershell
npm run build
node --test test\executor-runtime.test.mjs
```

If those pass, also run:

```powershell
npm test
```

## Constraints

- Use `apply_patch` for manual edits.
- Do not revert unrelated user changes.
- Do not remove current helper compatibility.
- Do not add QuickJS usage to `mcp-server`; this task is only `mcp-ts/packages/code-mode`.
