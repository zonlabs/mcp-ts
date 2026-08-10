---
title: "File System"
sidebarTitle: "File System"
description: "Persist MCP sessions to a local JSON file with the file system storage backend, ideal for local development and single-instance deployments without Redis."
---

**Perfect for local development with persistent sessions across restarts.**

File storage persists sessions to a JSON file on disk. Ideal for:
- Local development
- Single-instance deployments
- Testing with persistent state
- Environments without Redis

## Configuration

```bash
# Explicit selection (optional)
MCP_TS_STORAGE_TYPE=file

# File path for session storage (required)
MCP_TS_STORAGE_FILE=./sessions.json
```

## Features

- **Persistent** across application restarts
- **No external dependencies**
- **Human-readable** JSON format
- **Automatic** directory creation

## Usage

### Option 1: Automatic Detection (Recommended)

When `MCP_TS_STORAGE_FILE` is present in your environment, the global `sessions` proxy automatically uses the File System backend.

```typescript
import { sessions } from '@mcp-ts/sdk/server';

// This will use File System automatically if env vars are set
const sessionList = await sessions.list('user-123');
console.log('Stored sessions:', sessionList);
```

### Option 2: Manual Instantiation

If you want to manage the File System backend yourself:

```typescript
import { FileStorageBackend } from '@mcp-ts/sdk/server';

const fileBackend = new FileStorageBackend({ path: './sessions.json' });
await fileBackend.init();

const sessionList = await fileBackend.list('user-123');
```

### File Format

```json
[
  {
    "sessionId": "abc123",
    "userId": "user-123",
    "serverId": "server-1",
    "serverName": "My MCP Server",
    "serverUrl": "https://mcp.example.com",
    "callbackUrl": "https://app.com/callback",
    "serverOptions": { "transport": { "type": "sse" } },
    "active": true,
    "createdAt": 1706234567890
  }
]
```

## Troubleshooting

### File Storage Not Persisting

```bash
# Check file permissions
ls -la ./sessions.json

# Verify path is writable
touch ./sessions.json

# Check environment variable
echo $MCP_TS_STORAGE_FILE
```
