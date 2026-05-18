---
title: "Client-Side API"
sidebarTitle: "Client-Side"
description: "API reference for mcp-ts client-side primitives, including the useMcp React hook, connection options, tool and resource methods, and lifecycle events."
icon: "desktop"
---

### `useMcp(options)`

React hook for managing MCP connections.

```typescript
import { useMcp } from '@mcp-ts/sdk/client';

const {
  connections,
  status,
  isInitializing,
  connect,
  disconnect,
  refresh,
  connectSSE,
  disconnectSSE,
  finishAuth,
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
} = useMcp({
  url: string,
  userId: string,
  authToken?: string,
  autoConnect?: boolean,
  autoInitialize?: boolean,
  onConnectionEvent?: (event) => void,
  onLog?: (level, message, metadata) => void,
});
```

**Options:**
- `url` - SSE endpoint URL (required)
- `userId` - User/client identifier (required)
- `authToken` - Authentication token (optional)
- `autoConnect` - Auto-connect SSE on mount (default: true)
- `autoInitialize` - Auto-load sessions on mount (default: true)
- `onConnectionEvent` - Connection event handler (optional)
- `onLog` - Debug log handler (optional)

**Returns:** Object with state and methods

---

### `useMcpApps(mcpClient)` *(Deprecated)*

> [!WARNING]  
> `useMcpApps` is officially deprecated. You should now import `<McpAppRenderer>` and `getMcpAppMetadata` directly from `@mcp-ts/sdk/client/react` and use them without wrapping them in this hook.

React hook for rendering **MCP Apps** (interactive tool UIs in a sandboxed iframe via AppBridge).

```typescript
import { useMcpApps } from '@mcp-ts/sdk/client/react';

const { getAppMetadata, McpAppRenderer } = useMcpApps(mcpClient);
```

**Parameters:**

- `mcpClient` — Object shaped like `useMcp()`’s return (at minimum `connections` with tools and optional `sseClient` for forwarding). May be `null` when disconnected.

**Returns:**

- `getAppMetadata(toolName: string)` — Resolves UI metadata for a tool (strips `tool_<id>_` prefixes).
- `McpAppRenderer` — Stable, memoized component; pass per-tool-call props.

#### `getMcpAppMetadata(mcpClient, toolName, input?)`

**Returns:** `McpAppMetadata | undefined`

```typescript
interface McpAppMetadata {
  toolName: string;
  resourceUri: string;
  sessionId: string;
}
```

URI resolution uses `tool.mcpApp.resourceUri`, then `tool._meta?.ui?.resourceUri`, then `tool._meta?.['ui/resourceUri']`. 
When `input` is provided, it automatically unwraps AI agent proxy calls (like `mcp_execute_tool`), resolves the true tool target, and returns the underlying UI metadata.

#### `McpAppRenderer` component

The standalone `<McpAppRenderer>` element is the primary engine for rendering inline MCP interactive apps inside a secure iframe Sandbox using AppBridge.
For `ui://` / `mcp-app://` HTML (and any injected HTML path), you must pass **`sandbox`** with your hosted proxy page (see [MCP Apps](/mcp-apps)).

**Props (`McpAppRendererProps`):**

```typescript
interface McpAppRendererProps {
  client?: McpClient | null;
  name: string;
  input?: Record<string, unknown>;
  result?: unknown;
  status?: 'executing' | 'inProgress' | 'complete' | 'idle';

  toolResourceUri?: string;
  html?: string;

  sandbox?: SandboxConfig;
  hostContext?: Record<string, unknown>;

  toolInputPartial?: unknown;
  toolCancelled?: boolean;

  onCallTool?: (params: { name: string; arguments?: Record<string, unknown> }) => Promise<unknown>;
  onReadResource?: (uri: string) => Promise<{ contents: Array<{ text?: string; blob?: string }> }>;
  onFallbackRequest?: (request: unknown) => Promise<unknown>;
  onMessage?: /* AppBridge */ (params, extra) => Promise<unknown>;
  onOpenLink?: (params, extra) => Promise<unknown>;
  onLoggingMessage?: (params: { level?: string; data?: string }) => void;
  onSizeChanged?: (params: { width?: number; height?: number }) => void;
  onError?: (error: Error) => void;

  className?: string;
  loader?: React.ReactNode;
}

interface SandboxConfig {
  url: URL | string;
  permissions?: string;
  csp?: Record<string, string>;
}
```

**Example (recommended: sandbox + default CSP):**

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
      className="my-custom-class"
    />
  );
}
```

#### `useAppHost(client, iframeRef, options?)`

Lower-level React helper that constructs an **`AppHost`** for a given `HTMLIFrameElement` ref. Accepts the same options as `AppHostOptions` (sandbox, callbacks, `hostContext`, etc.). The hook currently initializes only when **`client`** is non-null; prefer **`McpAppRenderer`** for the usual `useMcp` integration.

```typescript
import { useAppHost } from '@mcp-ts/sdk/client/react';

// sseClient: SSEClient | null from useMcp() / mcpClient.sseClient
const { host, error } = useAppHost(sseClient, iframeRef, { sandbox: { ... } });
```

---

### `AppHost` class

Core MCP App host: AppBridge setup, sandbox proxy launch, resource fetch/cache, and tool I/O. Import from **`@mcp-ts/sdk/client`**.

```typescript
import {
  AppHost,
  DEFAULT_MCP_APP_CSP,
  APP_HOST_DEFAULTS,
} from '@mcp-ts/sdk/client';
import {
  SANDBOX_PROXY_READY_METHOD,
  SANDBOX_RESOURCE_READY_METHOD,
} from '@modelcontextprotocol/ext-apps';
```

#### Constructor

```typescript
new AppHost(client: AppHostClient | null, iframe: HTMLIFrameElement, options?: AppHostOptions);
```

- **`client`** — Usually `SSEClient`. If `null`, you must implement **`onCallTool`** / **`onReadResource`** (and any other paths your app uses) yourself.
- **`options`** — See below.

#### `AppHostOptions` (selected fields)

- `debug?: boolean`
- `sandbox?: SandboxConfig` — **Required** when launching with HTML to inject (fetched `ui://` HTML or `html` string).
- `hostContext?: Record<string, unknown>` — Theme, locale, dimensions, etc.; synced to the guest via AppBridge.
- `onCallTool`, `onReadResource`, `onFallbackRequest`, `onMessage`, `onOpenLink`, `onLoggingMessage`, `onSizeChanged`, `onError`, `onRequestDisplayMode` — Optional; override defaults (forwarding to `client` when provided and connected).

#### Methods

| Method | Description |
|--------|-------------|
| `start(): Promise<void>` | Prepares handlers; bridge connects during `launch()`. |
| `preload(tools: Array<{ _meta?: unknown }>): void` | Warms resource cache for tools with UI metadata. |
| `launch(source: { uri?: string; html?: string }, sessionId?: string): Promise<void>` | Loads UI (fetch `uri` or use `html`), runs sandbox proxy when needed, connects AppBridge. |
| `sendToolInput(args: Record<string, unknown>): void` | Sends tool arguments to the guest. |
| `sendToolResult(result: unknown): void` | Sends final tool result. |
| `sendToolCancelled(reason: string): void` | Notifies cancellation. |
| `sendToolInputPartial(params: unknown): void` | Streaming partial input. |
| `setHostContext(context: Record<string, unknown>): void` | Updates host context on the bridge. |

#### Constants

- **`DEFAULT_MCP_APP_CSP`** — Sensible baseline CSP object for `sandbox.csp` (extend or narrow per app).
- **`APP_HOST_DEFAULTS`** — Default timeout, host info label, URI schemes, theme/platform hints.
- **`SANDBOX_PROXY_READY_METHOD`** / **`SANDBOX_RESOURCE_READY_METHOD`** — Re-exported from **`@modelcontextprotocol/ext-apps`** for custom sandbox pages (same as importing from that package directly).

---

### `SSEClient`

Lower-level SSE client for custom implementations.

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

**`connect(): void`**

Connect to the SSE endpoint.

```typescript
client.connect();
```

---

**`disconnect(): void`**

Disconnect from the SSE endpoint.

```typescript
client.disconnect();
```

---

**`listSessions(): Promise<Session[]>`**

Get all user sessions.

```typescript
const sessions = await client.listSessions();
```

---

**`connectToServer(config): Promise<{ sessionId: string }>`**

Connect to an MCP server.

```typescript
const { sessionId } = await client.connectToServer({
  serverId: 'server-id',
  serverName: 'My Server',
  serverUrl: 'https://mcp.example.com',
  callbackUrl: window.location.origin + '/callback',
});
```

---

**`disconnectFromServer(sessionId: string): Promise<void>`**

Disconnect from an MCP server.

```typescript
await client.disconnectFromServer(sessionId);
```

---

**`callTool(sessionId, name, args): Promise<any>`**

Call a tool on a connected server.

```typescript
const result = await client.callTool(sessionId, 'tool_name', {
  arg1: 'value',
});
```

---

**`listTools(sessionId): Promise<Tool[]>`**

List tools for a session.

```typescript
const tools = await client.listTools(sessionId);
```
