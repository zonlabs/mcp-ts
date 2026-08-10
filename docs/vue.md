---
title: "Vue.js"
sidebarTitle: "Vue.js"
description: "Manage MCP connections in Vue 3 applications with the useMcp composable: connect to servers, call tools, handle OAuth flows, and react to connection events."
icon: "vuejs"
---

The `@mcp-ts/sdk/client/vue` package provides a composable for managing MCP connections in Vue 3 applications.

## Basic Usage

```vue
<script setup lang="ts">
import { useMcp } from '@mcp-ts/sdk/client/vue';

const { connections, connect, status } = useMcp({
  url: '/api/mcp',
  userId: 'user-123',
});
</script>

<template>
  <div>
    <p>Status: {{ status }}</p>
    <div v-for="conn in connections" :key="conn.sessionId">
      <h3>{{ conn.serverName }}</h3>
      <p>{{ conn.state }}</p>
    </div>
  </div>
</template>
```

## Composable Options

```typescript
useMcp({
  // Required: SSE endpoint URL
  url: '/api/mcp',

  // Required: User identifier
  userId: 'user-123',

  // Optional: Authentication token
  authToken: 'your-auth-token',

  // Optional: Auto-connect SSE on mount
  autoConnect: true,

  // Optional: Auto-load sessions on mount
  autoInitialize: true,

  // Optional: Events
  onConnectionEvent: (event) => console.log(event),
  onLog: (level, msg) => console.log(level, msg),
})
```

## Return Values

The `useMcp` composable returns reactive references (Refs):

```typescript
const {
  connections,       // Ref<McpConnection[]>
  status,           // Ref<string>
  isInitializing,   // Ref<boolean>
  
  // Methods (not refs)
  connect,
  disconnect,
  callTool,
  // ...
} = useMcp(...);
```

## Example Component

```vue
<script setup lang="ts">
import { useMcp } from '@mcp-ts/sdk/client/vue';
import { ref } from 'vue';

const props = defineProps<{ userId: string }>();

const { 
  connections, 
  status, 
  connect, 
  callTool 
} = useMcp({
  url: `/api/mcp?userId=${props.userId}`,
  userId: props.userId
});

const handleConnect = async () => {
  await connect({
    serverId: 'weather-server',
    serverName: 'Weather Server',
    serverUrl: 'https://weather.example.com',
    callbackUrl: window.location.origin + '/callback'
  });
};

const getWeather = async (sessionId: string) => {
  const result = await callTool(sessionId, 'get_weather', { city: 'London' });
  console.log(result);
};
</script>

<template>
  <div class="mcp-container">
    <h2>MCP Client ({{ status }})</h2>
    
    <button @click="handleConnect">Connect Server</button>

    <div v-for="conn in connections" :key="conn.sessionId" class="connection">
      <h3>{{ conn.serverName }}</h3>
      <div class="status" :class="conn.state.toLowerCase()">
        {{ conn.state }}
      </div>
      
      <div v-if="conn.state === 'CONNECTED'" class="tools">
        <button 
          v-for="tool in conn.tools" 
          :key="tool.name"
          @click="getWeather(conn.sessionId)"
        >
          {{ tool.name }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.status.connected { color: green; }
.status.failed { color: red; }
</style>
```

## Next Steps

- [API Reference](/reference/server) - Complete API reference
- [Examples](https://github.com/zonlabs/mcp-ts/tree/main/examples) - More code examples
