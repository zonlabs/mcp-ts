# Task + Notification Example Server

This example shows an MCP server that supports:

- Task-augmented tool execution
- `notifications/progress`
- `notifications/tasks/status`
- Task RPC operations (`tasks/get`, `tasks/result`, `tasks/list`, `tasks/cancel`)

## Run server

```bash
npx tsx examples/task-notification-server/server.ts
```

Server endpoint: `http://localhost:3007/mcp`

## Run client (using mcp-ts MCPClient)

```bash
npx tsx examples/task-notification-server/client.ts
```

The client will:

1. connect to the example server
2. call the `long_job` tool
3. print real-time notifications
4. use task helper methods (`listTasks`, `getTask`, `getTaskResult`) to retrieve final result
