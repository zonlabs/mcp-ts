---
title: "Client-Side API"
sidebarTitle: "Client-Side"
description: "API reference for mcp-ts client-side primitives, including the React useMcp hook, MCP App helpers, and the lower-level transport client."
icon: "desktop"
---

### `useMcp(options)`

React hook for managing MCP connections.

```typescript
import { useMcp } from '@mcp-ts/sdk/client/react';

const {
  connections,
  status,
  isInitializing,
  connect,
  reconnect,
  disconnect,
  refresh,
  connectSSE,
  disconnectSSE,
  finishAuth,
  resumeAuth,
  callTool,
  listTools,
  listPrompts,
  getPrompt,
  listResources,
  readResource,
  getConnection,
  getConnectionByServerId,
  isServerConnected,
  getTools,
  sseClient,
} = useMcp({
  url: string,
  userId: string,
  authToken?: string,
  autoConnect?: boolean,
  autoInitialize?: boolean,
  onRedirect?: (url) => void,
  onConnectionEvent?: (event) => void,
  onLog?: (level, message, metadata) => void,
  requestTimeout?: number,
  debug?: boolean,
});
```

**Options:**
- `url` - MCP endpoint URL
- `userId` - User identifier
- `authToken` - Authentication token
- `autoConnect` - Auto-connect on mount
- `autoInitialize` - Auto-load sessions on mount
- `onRedirect` - Override the default OAuth redirect behavior
- `onConnectionEvent` - Connection event handler
- `onLog` - Debug log handler
- `requestTimeout` - Reserved for future request-timeout control
- `debug` - Enable client debug logs

---

### `useMcpApps(mcpClient)` *(Deprecated)*

> Prefer the standalone `McpAppRenderer` component and `getMcpAppMetadata()` utility from `@mcp-ts/sdk/client/react` for new code.

React helper for MCP Apps (interactive tool UIs in a sandboxed iframe via AppBridge).

```typescript
import { useMcpApps } from '@mcp-ts/sdk/client/react';

const { getAppMetadata, McpAppRenderer } = useMcpApps(mcpClient);
```

**Parameters:**

- `mcpClient` - Object shaped like `useMcp()`'s return. `null` is allowed when disconnected.

**Returns:**

- `getAppMetadata(toolName: string)` - Resolves UI metadata for a tool.
- `McpAppRenderer` - Stable component for rendering a tool UI.

#### `getMcpAppMetadata(mcpClient, toolName, input?)`

**Returns:** `McpAppMetadata | undefined`

```typescript
interface McpAppMetadata {
  toolName: string;
  resourceUri: string;
  sessionId: string;
}
```

#### `McpAppRenderer` Component

The standalone `<McpAppRenderer>` component renders inline MCP Apps inside a sandboxed iframe. For `ui://` and `mcp-app://` HTML, pass a `sandbox` configuration pointing at your proxy page.

```tsx
import { McpAppRenderer, DEFAULT_MCP_APP_CSP } from '@mcp-ts/sdk/client/react';

function ToolCallRenderer({ name, args, result, status }) {
  const { mcpClient } = useMcpContext();

  return (
    <McpAppRenderer
      client={mcpClient}
      name={name}
      input={args}
      result={result}
      status={status}
      sandbox={{
        url: '/sandbox_proxy.html',
        csp: DEFAULT_MCP_APP_CSP,
      }}
    />
  );
}
```

---

### `useAppHost(client, iframeRef, options?)`

Lower-level React helper that constructs an `AppHost` for a given iframe ref.

```typescript
import { useAppHost } from '@mcp-ts/sdk/client/react';

const { host, error } = useAppHost(sseClient, iframeRef, { sandbox: { url: '/sandbox_proxy.html' } });
```

---

### `AppHost`

Core MCP App host: AppBridge setup, sandbox proxy launch, resource fetch/cache, and tool I/O.

```typescript
import {
  AppHost,
  DEFAULT_MCP_APP_CSP,
  APP_HOST_DEFAULTS,
} from '@mcp-ts/sdk/client';
import {
  SANDBOX_PROXY_READY_METHOD,
  SANDBOX_RESOURCE_READY_METHOD,
} from '@mcp-ts/sdk/client';
```

#### Constructor

```typescript
new AppHost(client, iframe, options?)
```

#### Selected methods

- `start(): Promise<void>`
- `preload(tools): void`
- `launch(source, sessionId?): Promise<void>`
- `sendToolInput(args): void`
- `sendToolResult(result): void`
- `sendToolCancelled(reason): void`
- `sendToolInputPartial(params): void`
- `setHostContext(context): void`

---

### `SSEClient`

Lower-level MCP transport client for custom implementations. It uses streamed `POST` requests and emits connection and observability events from the response stream.

```typescript
import { SSEClient } from '@mcp-ts/sdk/client';

const client = new SSEClient({
  url: string,
  userId: string,
  authToken?: string,
  onConnectionEvent?: (event) => void,
  onStatusChange?: (status) => void,
  onLog?: (level, message, metadata) => void,
});
```

#### Methods

- `connect(): void`
- `disconnect(): void`
- `listSessions(): Promise<SessionListResult>`
- `connectToServer(config): Promise<{ sessionId: string }>`
- `disconnectFromServer(sessionId): Promise<{ success: true }>`
- `getSession(sessionId): Promise<GetSessionResult>`
- `finishAuth(state, code): Promise<FinishAuthResult>`
- `callTool(sessionId, name, args): Promise<unknown>`
- `listTools(sessionId): Promise<ListToolsRpcResult>`
- `listPrompts(sessionId): Promise<ListPromptsResult>`
- `getPrompt(sessionId, name, args?): Promise<unknown>`
- `listResources(sessionId): Promise<ListResourcesResult>`
- `readResource(sessionId, uri): Promise<unknown>`
