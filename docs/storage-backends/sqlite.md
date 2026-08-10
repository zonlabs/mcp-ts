---
title: "SQLite"
sidebarTitle: "SQLite"
description: "Use SQLite via better-sqlite3 for zero-configuration, single-file persistent MCP session storage with ACID transactions and no external service required."
---

**Zero-configuration persistent storage, faster than file-based JSON storage.**

SQLite provides a single-file relational database that is robust and requires no external server process. It is ideal for:

- Single-instance production apps
- Persistent development state
- Applications that need ACID transactions without a full database server
- Local deployments where Redis or Supabase would be unnecessary

## Installation

SQLite support uses the optional `better-sqlite3` peer dependency:

```bash
npm install better-sqlite3
npm install -D @types/better-sqlite3
```

## Configuration

```bash
# Explicit selection
MCP_TS_STORAGE_TYPE=sqlite

# SQLite DB path (optional, defaults to ./sessions.db)
MCP_TS_STORAGE_SQLITE_PATH=./data/mcp.db
```

If `MCP_TS_STORAGE_TYPE` is not set, the storage layer also auto-detects SQLite when `MCP_TS_STORAGE_SQLITE_PATH` is present.

## Features

- **Persistent** single-file database
- **Fast** local reads and writes
- **ACID compliant** transactions
- **No external service** required
- **Automatic** database and table setup

## Usage

### Option 1: Automatic Detection (Recommended)

When `MCP_TS_STORAGE_TYPE=sqlite` or `MCP_TS_STORAGE_SQLITE_PATH` are present in your environment, the global `sessions` proxy automatically uses the SQLite backend.

```typescript
import { sessions } from '@mcp-ts/sdk/server';

// This will use SQLite automatically if env vars are set
const sessionList = await sessions.list('user-123');
console.log('Stored sessions:', sessionList);
```

### Option 2: Manual Instantiation

If you want to manage the SQLite backend yourself:

```typescript
import { SqliteStorage } from '@mcp-ts/sdk/server';

const sqliteBackend = new SqliteStorage({ path: './data/mcp.db' });
await sqliteBackend.init(); // Sets up table if missing

const sessionList = await sqliteBackend.list('user-123');
```

## Troubleshooting

### `better-sqlite3` is not installed

Install the optional dependency in the application that uses SQLite storage:

```bash
npm install better-sqlite3
```

### Database Path Is Not Writable

Make sure the parent directory exists and is writable by the process:

```bash
mkdir -p ./data
touch ./data/mcp.db
```
