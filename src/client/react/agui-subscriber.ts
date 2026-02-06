/**
 * AG-UI Subscriber for MCP Apps
 *
 * Provides a standalone subscriber pattern for listening to AG-UI agent events
 * without depending on CopilotKit components. This allows MCP apps to be rendered
 * based on tool call events from any AG-UI agent.
 *
 * @requires @ag-ui/client - Peer dependency for AG-UI types
 */

import type { AgentSubscriber, AbstractAgent } from '@ag-ui/client';

/**
 * MCP App UI event payload emitted from middleware
 */
export interface McpAppEvent {
  /** Tool call ID that triggered this UI */
  toolCallId: string;
  /** Resource URI for the MCP app */
  resourceUri: string;
  /** Session ID for the MCP connection */
  sessionId?: string;
  /** Name of the tool that was called */
  toolName: string;
  /** Tool execution result (if available) */
  result?: any;
  /** Tool input arguments */
  input?: Record<string, unknown>;
  /** Tool execution status */
  status?: 'executing' | 'inProgress' | 'complete';
}

/**
 * Event handler for MCP app events
 */
export type McpAppEventHandler = (event: McpAppEvent) => void;

/**
 * Event handler for tool call events
 */
export interface ToolCallEventData {
  toolCallId: string;
  toolName: string;
  args?: Record<string, unknown>;
  result?: any;
  status: 'start' | 'args' | 'end' | 'result';
}

export type ToolCallEventHandler = (event: ToolCallEventData) => void;

/**
 * Configuration for MCP app subscriber
 */
export interface McpAppSubscriberConfig {
  /** Handler for MCP app UI events */
  onMcpApp?: McpAppEventHandler;
  /** Handler for general tool call events */
  onToolCall?: ToolCallEventHandler;
  /** Custom event name to listen for (default: 'mcp-apps-ui') */
  eventName?: string;
}

/**
 * Creates an AG-UI AgentSubscriber that listens for MCP app events
 *
 * This subscriber can be attached to any AG-UI agent instance using agent.subscribe()
 * and will call the provided handlers when MCP app events are detected.
 *
 * @param config - Configuration with event handlers
 * @returns AgentSubscriber that can be passed to agent.subscribe()
 *
 * @example
 * ```typescript
 * import { createMcpAppSubscriber } from '@mcp-ts/sdk/client/react';
 * import { HttpAgent } from '@ag-ui/client';
 *
 * const agent = new HttpAgent({ url: '/api/agent' });
 *
 * const subscriber = createMcpAppSubscriber({
 *   onMcpApp: (event) => {
 *     console.log('MCP App:', event.resourceUri);
 *     // Render MCP app UI
 *   },
 *   onToolCall: (event) => {
 *     console.log('Tool Call:', event.toolName, event.status);
 *   }
 * });
 *
 * const { unsubscribe } = agent.subscribe(subscriber);
 * ```
 */
export function createMcpAppSubscriber(
  config: McpAppSubscriberConfig
): AgentSubscriber {
  const eventName = config.eventName || 'mcp-apps-ui';

  const subscriber: AgentSubscriber = {
    // Listen for custom MCP app events from middleware
    onCustomEvent: ({ event }) => {
      if (event.name === eventName && config.onMcpApp) {
        const payload = event.value as McpAppEvent;
        config.onMcpApp(payload);
      }
    },

    // Listen for tool call lifecycle events
    onToolCallStartEvent: (params) => {
      if (config.onToolCall && params.event.toolCallName) {
        config.onToolCall({
          toolCallId: params.event.toolCallId || '',
          toolName: params.event.toolCallName,
          status: 'start',
        });
      }
    },

    onToolCallArgsEvent: (params) => {
      if (config.onToolCall) {
        // partialToolCallArgs contains the parsed args
        const args = params.partialToolCallArgs;

        config.onToolCall({
          toolCallId: params.event.toolCallId || '',
          toolName: params.toolCallName || '', // toolCallName is in params, not event
          args,
          status: 'args',
        });
      }
    },

    onToolCallEndEvent: (params) => {
      if (config.onToolCall && params.event.toolCallId) {
        config.onToolCall({
          toolCallId: params.event.toolCallId,
          toolName: params.toolCallName || '', // toolCallName is in params, not event
          status: 'end',
        });
      }
    },

    onToolCallResultEvent: (params) => {
      if (config.onToolCall && params.event.toolCallId) {
        config.onToolCall({
          toolCallId: params.event.toolCallId,
          toolName: '', // Not available in result event
          result: params.event.content, // content contains the result
          status: 'result',
        });
      }
    },
  };

  return subscriber;
}

/**
 * Subscribes to MCP app events from an AG-UI agent
 *
 * Convenience function that creates a subscriber and attaches it to an agent.
 * Returns an unsubscribe function to clean up the subscription.
 *
 * @param agent - AG-UI agent instance
 * @param config - Configuration with event handlers
 * @returns Unsubscribe function
 *
 * @example
 * ```typescript
 * const unsubscribe = subscribeMcpAppEvents(agent, {
 *   onMcpApp: (event) => {
 *     renderMcpApp(event.resourceUri, event.sessionId);
 *   }
 * });
 *
 * // Later, to cleanup:
 * unsubscribe();
 * ```
 */
export function subscribeMcpAppEvents(
  agent: AbstractAgent,
  config: McpAppSubscriberConfig
): () => void {
  const subscriber = createMcpAppSubscriber(config);
  const { unsubscribe } = agent.subscribe(subscriber);
  return unsubscribe;
}

/**
 * Manager for MCP app events with built-in state management
 *
 * Provides a higher-level API for managing MCP app events with automatic
 * state tracking. Useful for React contexts or state management systems.
 */
export class McpAppEventManager {
  private events: Map<string, McpAppEvent> = new Map();
  private toolCalls: Map<string, ToolCallEventData> = new Map();
  private listeners: Set<() => void> = new Set();
  private unsubscribe?: () => void;
  private cachedSnapshot: Record<string, McpAppEvent> = {};

  /**
   * Attach to an AG-UI agent
   */
  attach(agent: AbstractAgent): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }

    this.unsubscribe = subscribeMcpAppEvents(agent, {
      onMcpApp: (event) => {
        this.events.set(event.toolName, event);
        this.cachedSnapshot = Object.fromEntries(this.events);
        this.notify();
      },
      onToolCall: (event) => {
        if (event.toolCallId) {
          this.toolCalls.set(event.toolCallId, event);
          this.notify();
        }
      },
    });
  }

  /**
   * Detach from the current agent
   */
  detach(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }

  /**
   * Get MCP app event for a specific tool
   */
  getEvent(toolName: string): McpAppEvent | undefined {
    return this.events.get(toolName);
  }

  /**
   * Get all MCP app events (cached for useSyncExternalStore)
   */
  getAllEvents(): Record<string, McpAppEvent> {
    return this.cachedSnapshot;
  }

  /**
   * Get tool call event by ID
   */
  getToolCall(toolCallId: string): ToolCallEventData | undefined {
    return this.toolCalls.get(toolCallId);
  }

  /**
   * Subscribe to event changes
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Clear all events
   */
  clear(): void {
    this.events.clear();
    this.toolCalls.clear();
    this.cachedSnapshot = {};
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach(listener => listener());
  }
}
