# Contributing to @mcp-ts/sdk

Thank you for your interest in contributing to @mcp-ts/sdk! This guide will help you understand how to make meaningful contributions to the project.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Common Contribution Types](#common-contribution-types)

## Getting Started

### Prerequisites

- **Node.js**: >= 18.0.0
- **npm**: >= 9.0.0
- **Git**: Latest stable version

### Fork and Clone

```bash
# Fork the repository on GitHub, then:
git clone https://github.com/YOUR_USERNAME/mcp-ts.git
cd mcp-ts

# Add upstream remote
git remote add upstream https://github.com/zonlabs/mcp-ts.git
```

## Development Setup

### Install Dependencies

```bash
npm install
```

### Available Commands

```bash
npm run build         # Build all entry points
npm run dev           # Watch mode for development
npm run type-check    # TypeScript validation
npm test              # Run tests
npm run test:ui       # Run tests in UI mode
npm run test:debug    # Debug tests
npm run clean         # Clean build artifacts
```

## Project Structure

```
src/
├── server/           # Server-side implementations
│   ├── mcp/          # Core MCP client & OAuth
│   ├── storage/      # Storage backends (Redis, SQLite, File, Memory)
│   └── handlers/     # SSE & Next.js handlers
├── client/           # Client-side implementations
│   ├── core/         # SSE client & core logic
│   ├── react/        # React hooks
│   └── vue/          # Vue composables
├── adapters/         # Framework integrations (Vercel AI, LangChain, Mastra, AG-UI)
└── shared/           # Shared types & utilities

tests/                # Playwright integration tests
examples/             # Working examples
docs/                 # Docusaurus documentation
```

## Making Changes

### Before You Start

1. Check existing [issues](https://github.com/zonlabs/mcp-ts/issues) and [PRs](https://github.com/zonlabs/mcp-ts/pulls)
2. For large features, open an issue first to discuss the approach
3. Sync with upstream: `git fetch upstream && git rebase upstream/main`

### Code Style

- **TypeScript**: Strict mode, fully typed
- **Imports**: Use explicit `.js` extensions for ESM:
  ```typescript
  import { example } from './module.js';  // ✅ Good
  ```
- **Optional Dependencies**: Use dynamic imports for peer dependencies

## Testing

```bash
npm test                           # Run all tests
npm test -- tests/storage/     # Run specific test
npm run test:ui                    # Interactive mode
```

### Testing Checklist

- [ ] Unit tests for new logic
- [ ] Integration tests for features
- [ ] All tests pass: `npm test`
- [ ] Type check passes: `npm run type-check`

## Commit Messages

Use conventional commit format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`

**Scopes**: `server`, `client`, `adapters`, `storage`, `types`, `docs`, `ci`

Examples:
```
feat(storage): add MongoDB backend
fix(client): resolve SSE connection timeout
docs: update installation guide
```

## Pull Request Process

### Create Your PR

1. Create a feature branch: `git checkout -b feat/your-feature`
2. Make your changes
3. Run checks:
   ```bash
   npm run type-check
   npm run build
   npm test
   ```
4. Commit and push:
   ```bash
   git commit -m "feat(scope): description"
   git push origin feat/your-feature
   ```

### PR Template

Use this template when creating a pull request:

```markdown
## What is the type of this PR?

- [ ] Bugfix
- [ ] Feature
- [ ] Refactoring
- [ ] Documentation
- [ ] Other

## Which area of the project does this PR affect?

- [ ] `server` (MCP client, handlers)
- [ ] `client` (React, Vue, SSE client)
- [ ] `adapters` (Vercel AI, LangChain, Mastra, AG-UI)
- [ ] `storage` (Redis, SQLite, File, Memory backends)
- [ ] `docs` (Docusaurus documentation)
- [ ] `examples` (Example applications)
- [ ] `ci` (GitHub workflows)
- [ ] Other

## Description of the change

<!-- Please provide a clear and concise description of what this PR does. -->

## Is this a breaking change?

- [ ] Yes
- [ ] No

## Checklist

- [ ] Code follows TypeScript strict mode guidelines
- [ ] Tests added/updated
- [ ] Documentation updated (if user-facing change)
- [ ] Build succeeds (`npm run build`)
- [ ] Type check passes (`npm run type-check`)
- [ ] All tests pass (`npm test`)
- [ ] Commit messages follow conventional format

## Related Issue

<!-- If your PR fixes an open issue, link it here. -->

Closes #
```

## Common Contribution Types

### Adding a Storage Backend

1. Implement `StorageBackend` interface in `src/server/storage/your-storage.ts`
2. Add dynamic import in `src/server/storage/index.ts`
3. Add peer dependency to `package.json`
4. Add tests in `tests/storage/your-storage.test.ts`
5. Document in `docs/docs/storage-backends.md`

### Adding a Framework Adapter

1. Create `src/adapters/your-framework-adapter.ts`
2. Implement conversion from `MultiSessionClient` to framework format
3. Add peer dependency to `package.json`
4. Add export to `package.json` and `tsup.config.ts`
5. Add tests in `tests/adapters/your-framework.test.ts`
6. Document in `docs/docs/adapters.md`

### Fixing a Bug

1. Create a test that reproduces the bug first
2. Fix with minimal changes
3. Ensure tests pass
4. Use commit type `fix` with clear description

### Documentation Updates

Update docs in `docs/docs/`:
- `installation.md` - Setup changes
- `api-reference.md` - API changes
- `storage-backends.md` - Storage backend docs
- Framework guides: `react.md`, `nextjs.md`, `vue.md`, etc.

## Build & Exports

When adding new exports:

1. Create the module in `src/`
2. Update `package.json` exports field
3. Update `tsup.config.ts` entry points
4. Run `npm run build`
5. Test: `import { item } from '@mcp-ts/sdk/your-module'`

## Getting Help

- **Questions?** [Open a discussion](https://github.com/zonlabs/mcp-ts/discussions)
- **Found a bug?** [Open an issue](https://github.com/zonlabs/mcp-ts/issues)
- **Want to suggest a feature?** [Open an issue](https://github.com/zonlabs/mcp-ts/issues)

## Review Process

- At least one maintainer review required
- All CI checks must pass
- Address feedback promptly
- Squash and merge to main

---

**Thank you for contributing to @mcp-ts/sdk! 🚀**
