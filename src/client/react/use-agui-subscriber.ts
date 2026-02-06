/**
 * React Hook for AG-UI Subscriber Pattern
 *
 * Provides React hooks for subscribing to AG-UI agent events without
 * depending on CopilotKit components. Works with any AG-UI agent instance.
 */

import { useEffect, useState, useSyncExternalStore, useMemo } from 'react';
import type { AbstractAgent } from '@ag-ui/client';
import {
  createMcpAppSubscriber,
  McpAppEventManager,
  type McpAppEvent,
  type McpAppSubscriberConfig,
  type ToolCallEventData,
} from './agui-subscriber.js';

/**
 * React hook to subscribe to MCP app events from an AG-UI agent
 *
 * This hook manages the subscription lifecycle and provides event state.
 * It's completely independent of CopilotKit and works with any AG-UI agent.
 *
 * @param agent - AG-UI agent instance (can be from HttpAgent, LangGraphAgent, etc.)
 * @param config - Configuration with event handlers
 *
 * @example
 * ```typescript
 * import { useAguiSubscriber } from '@mcp-ts/sdk/client/react';
 * import { HttpAgent } from '@ag-ui/client';
 *
 * function MyComponent() {
 *   const [agent] = useState(() => new HttpAgent({ url: '/api/agent' }));
 *
 *   useAguiSubscriber(agent, {
 *     onMcpApp: (event) => {
 *       console.log('MCP App:', event.resourceUri);
 *     },
 *     onToolCall: (event) => {
 *       console.log('Tool:', event.toolName, event.status);
 *     }
 *   });
 *
 *   // Your UI code...
 * }
 * ```
 */
export function useAguiSubscriber(
  agent: AbstractAgent | null | undefined,
  config: McpAppSubscriberConfig
): void {
  useEffect(() => {
    if (!agent) return;

    const subscriber = createMcpAppSubscriber(config);
    const { unsubscribe } = agent.subscribe(subscriber);

    return () => unsubscribe();
  }, [agent, config]);
}

/**
 * React hook for managing MCP apps
 *
 * Returns MCP apps that need to be rendered. Automatically combines:
 * 1. Tool metadata (instant, synchronous)
 * 2. AG-UI agent events (async, after tool execution)
 *
 * Prioritizes tool metadata for instant loading.
 *
 * @param agent - AG-UI agent instance (optional)
 * @param mcpClient - MCP client with tool metadata (optional)
 * @returns Object with MCP apps and helper functions
 *
 * @example
 * ```typescript
 * import { useMcpApps } from '@mcp-ts/sdk/client/react';
 *
 * function ToolRenderer() {
 *   const { agent } = useAgent({ agentId: "myAgent" });
 *   const { mcpClient } = useMcpContext();
 *   const { apps } = useMcpApps(agent, mcpClient);
 *
 *   return (
 *     <>
 *       {Object.entries(apps).map(([toolName, app]) => (
 *         <McpAppUI key={toolName} {...app} />
 *       ))}
 *     </>
 *   );
 * }
 * ```
 */
export function useMcpApps(
  agent?: AbstractAgent | null,
  mcpClient?: { connections: Array<{ tools: any[]; sessionId: string }> } | null
): {
  /** All MCP apps indexed by tool name */
  apps: Record<string, McpAppEvent>;
  /** Get app for a specific tool */
  getApp: (toolName: string) => McpAppEvent | undefined;
  /** Clear all apps */
  clear: () => void;
} {
  // Create manager instance once
  const [manager] = useState(() => new McpAppEventManager());

  // Attach/detach manager when agent changes
  useEffect(() => {
    if (!agent) {
      manager.detach();
      return;
    }

    manager.attach(agent);
    return () => manager.detach();
  }, [agent, manager]);

  // Subscribe to manager state changes using useSyncExternalStore
  const agentApps = useSyncExternalStore(
    (callback) => manager.subscribe(callback),
    () => manager.getAllEvents(),
    () => ({}) // Server-side snapshot
  );

  // Combine tool metadata with agent events
  const apps: Record<string, McpAppEvent> = useMemo(() => {
    const combined: Record<string, McpAppEvent> = {};

    // First, add tool metadata (instant, synchronous - prioritized!)
    if (mcpClient) {
      for (const conn of mcpClient.connections) {
        for (const tool of conn.tools) {
          const meta = (tool as any)._meta;
          if (!meta?.ui) continue;

          const ui = meta.ui;
          if (typeof ui !== 'object' || !ui) continue;
          if (ui.visibility && !ui.visibility.includes('app')) continue;

          const resourceUri =
            typeof ui.resourceUri === 'string'
              ? ui.resourceUri
              : typeof ui.uri === 'string'
              ? ui.uri
              : undefined;

          if (resourceUri) {
            combined[tool.name] = {
              toolCallId: '',
              resourceUri,
              sessionId: conn.sessionId,
              toolName: tool.name,
            };
          }
        }
      }
    }

    // Then, merge in agent events (may have additional data like toolCallId, result)
    for (const [toolName, event] of Object.entries(agentApps) as [string, McpAppEvent][]) {
      if (combined[toolName]) {
        // Merge: keep metadata's resourceUri/sessionId, add event's toolCallId/result
        combined[toolName] = {
          ...combined[toolName],
          toolCallId: event.toolCallId || combined[toolName].toolCallId,
          result: event.result,
          input: event.input,
          status: event.status,
        };
      } else {
        // No metadata, just use the event
        combined[toolName] = event;
      }
    }

    // Return a Proxy that handles both base and prefixed tool names transparently
    // This allows users to lookup apps with either format:
    // - apps["get-time"] (base name)
    // - apps["tool_abc123_get-time"] (prefixed name from CopilotKit)
    return new Proxy(combined, {
      get(target, prop: string | symbol) {
        if (typeof prop !== 'string') return undefined;

        // Try exact match first (base name)
        if (prop in target) return target[prop];

        // Extract base name from prefixed format: "tool_xxx_baseName" -> "baseName"
        const match = prop.match(/^tool_[^_]+_(.+)$/);
        if (match && match[1] in target) {
          return target[match[1]];
        }

        return undefined;
      },
      // Support Object.entries, Object.keys, etc. by returning base names
      ownKeys(target) {
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, prop) {
        return Reflect.getOwnPropertyDescriptor(target, prop);
      }
    });
  }, [agentApps, mcpClient]);

  return {
    apps,
    // getApp handles both base and prefixed names transparently via the Proxy
    getApp: (toolName: string) => apps[toolName] as McpAppEvent | undefined,
    clear: () => manager.clear(),
  };
}

/**
 * React hook for tracking tool call lifecycle events
 *
 * Provides access to detailed tool call events (start, args, end, result)
 * for debugging or custom UI rendering.
 *
 * @param agent - AG-UI agent instance
 * @returns Object with tool call events and helper functions
 *
 * @example
 * ```typescript
 * import { useToolCallEvents } from '@mcp-ts/sdk/client/react';
 *
 * function ToolCallDebugger() {
 *   const [agent] = useState(() => new HttpAgent({ url: '/api/agent' }));
 *   const { toolCalls } = useToolCallEvents(agent);
 *
 *   return (
 *     <div>
 *       {Object.entries(toolCalls).map(([id, event]) => (
 *         <div key={id}>
 *           {event.toolName} - {event.status}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useToolCallEvents(agent: AbstractAgent | null | undefined): {
  /** All tool call events indexed by tool call ID */
  toolCalls: Record<string, ToolCallEventData>;
} {
  const [toolCalls, setToolCalls] = useState<Record<string, ToolCallEventData>>({});

  useEffect(() => {
    if (!agent) {
      setToolCalls({});
      return;
    }

    const subscriber = createMcpAppSubscriber({
      onToolCall: (event) => {
        setToolCalls((prev) => ({
          ...prev,
          [event.toolCallId]: event,
        }));
      },
    });

    const { unsubscribe } = agent.subscribe(subscriber);

    return () => unsubscribe();
  }, [agent]);

  return { toolCalls };
}
