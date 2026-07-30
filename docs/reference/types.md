---
title: "Types & Errors"
sidebarTitle: "Types"
description: "Reference for core mcp-ts TypeScript types and error classes, including McpConnectionState, McpConnectionEvent, ToolInfo, and shared error subclasses."
icon: "code"
---

### Connection Types

```typescript
import type {
  McpConnectionState,
  McpConnectionEvent,
} from '@mcp-ts/client/shared';

type McpConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'AUTHENTICATING'
  | 'AUTHENTICATED'
  | 'DISCOVERING'
  | 'CONNECTED'
  | 'VALIDATING'
  | 'RECONNECTING'
  | 'FAILED';

type McpConnectionEvent =
  | { type: 'state_changed'; sessionId: string; state: McpConnectionState; /* ... */ }
  | { type: 'capabilities_discovered'; sessionId: string; serverId: string; tools: ToolInfo[]; allTools: ToolInfo[]; prompts: Prompt[]; resources: Resource[]; resourceTemplates: ResourceTemplate[]; timestamp: number; }
  | { type: 'auth_required'; sessionId: string; authUrl: string; /* ... */ }
  | { type: 'error'; sessionId: string; error: string; /* ... */ }
  | { type: 'disconnected'; sessionId: string; reason?: string; /* ... */ }
  | { type: 'progress'; sessionId: string; message: string; /* ... */ };
```

### Tool Types

```typescript
import type { ToolInfo } from '@mcp-ts/client/shared';

interface ToolInfo {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
  };
}
```

### Session Types

```typescript
interface Session {
  sessionId: string;
  userId: string;
  serverId?: string;
  serverName?: string;
  serverUrl: string;
  callbackUrl: string;
  transportType: 'sse' | 'streamable-http';
  status: 'pending' | 'active';
  createdAt: number;
  updatedAt?: number;
  expiresAt?: number | null;
  headers?: Record<string, string>;
  authUrl?: string | null;
  toolPolicy?: ToolPolicy;
  clientInformation?: OAuthClientInformationMixed | null;
  tokens?: OAuthTokens | null;
  codeVerifier?: string | null;
  clientId?: string | null;
  oauthState?: OAuthState | null;
}

### Tool Policy Types

```typescript
import { createToolId, isToolAllowed, filterToolsByPolicy } from '@mcp-ts/client/server';

interface ToolPolicy {
  mode: 'all' | 'allowlist' | 'denylist';
  toolIds: string[];
  updatedAt: number;
}
```

**Utility functions:**

| Function | Description |
|----------|-------------|
| `createToolId(serverId, toolName)` | Creates composite `{serverId}::{toolName}` ID |
| `normalizeToolPolicy(input, now?)` | Normalizes raw input into `ToolPolicy \| undefined` |
| `normalizeToolPolicyForUpdate(input, now?)` | Like above but falls back to `{ mode: 'all', toolIds: [], updatedAt }` |
| `isToolAllowed(policy, toolName, serverId?)` | Checks if a tool is permitted under the policy |
| `assertToolAllowed(policy, toolName, serverId?)` | Throws if tool is not allowed |
| `filterToolsByPolicy(tools, policy, serverId?)` | Filters tool array to only allowed tools |
| `validateToolPolicyAgainstTools(policy, tools, serverId?)` | Validates all tool IDs correspond to actual tools |
```

## Error Handling

### UnauthorizedError

Thrown when OAuth authorization is required.

```typescript
import { UnauthorizedError } from '@mcp-ts/client/server';

try {
  await client.connect();
} catch (error) {
  if (error instanceof UnauthorizedError) {
    console.log('Redirect to:', error.authUrl);
  }
}
```
