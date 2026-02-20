/**
 * Simple event emitter pattern for MCP connection events
 * Inspired by Cloudflare's agents pattern but adapted for serverless
 */

export type Disposable = {
  dispose(): void;
};

export type Event<T> = (listener: (event: T) => void) => Disposable;

/**
 * Event emitter class for type-safe event handling
 * Similar to Cloudflare's Emitter but simplified for our use case
 */
export class Emitter<T> {
  private listeners: Set<(event: T) => void> = new Set();

  /**
   * Subscribe to events
   * @param listener - Callback function to handle events
   * @returns Disposable to unsubscribe
   */
  get event(): Event<T> {
    return (listener: (event: T) => void) => {
      this.listeners.add(listener);
      return {
        dispose: () => {
          this.listeners.delete(listener);
        },
      };
    };
  }

  /**
   * Fire an event to all listeners
   * @param event - Event data to emit
   */
  fire(event: T): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[Emitter] Error in event listener:', error);
      }
    }
  }

  /**
   * Clear all listeners
   */
  dispose(): void {
    this.listeners.clear();
  }

  /**
   * Get number of active listeners
   */
  get listenerCount(): number {
    return this.listeners.size;
  }
}

/**
 * Connection state types matching your existing ConnectionStatus
 * Extended with more granular states for better observability
 */
export type McpConnectionState =
  | 'DISCONNECTED'      // Not connected
  | 'CONNECTING'        // Establishing transport connection to MCP server
  | 'AUTHENTICATING'    // OAuth flow in progress
  | 'AUTHENTICATED'     // OAuth complete, pre-connect
  | 'DISCOVERING'       // Discovering server capabilities (tools, resources, prompts)
  | 'CONNECTED'         // Transport connection established
  | 'READY'             // Fully connected and ready to use
  | 'VALIDATING'        // Validating existing session
  | 'RECONNECTING'      // Attempting to reconnect
  | 'INITIALIZING'      // Initializing session or connection
  | 'FAILED';           // Connection error at some point

/**
 * MCP Connection Event Types
 * Discriminated union for type-safe event handling
 */
export type McpConnectionEvent =
  | {
    type: 'state_changed';
    sessionId: string;
    serverId: string;
    serverName: string;
    serverUrl: string;
    createdAt?: number;
    state: McpConnectionState;
    previousState: McpConnectionState;
    timestamp: number;
  }
  | {
    type: 'tools_discovered';
    sessionId: string;
    serverId: string;
    toolCount: number;
    tools: any[];
    timestamp: number;
  }
  | {
    type: 'auth_required';
    sessionId: string;
    serverId: string;
    authUrl: string;
    timestamp: number;
  }
  | {
    type: 'error';
    sessionId: string;
    serverId: string;
    error: string;
    errorType: 'connection' | 'auth' | 'validation' | 'unknown';
    timestamp: number;
  }
  | {
    type: 'disconnected';
    sessionId: string;
    serverId: string;
    reason?: string;
    timestamp: number;
  }
  | {
    type: 'progress';
    sessionId: string;
    serverId: string;
    message: string;
    timestamp: number;
  };

/**
 * Event fired when a tool execution returns a UI resource URI
 */
export interface McpAppsUIEvent {
  type: 'mcp-apps-ui';
  sessionId: string;
  resourceUri: string;
  toolName: string;
  result: unknown;
  timestamp: number;
}

/**
 * Observability event for debugging and monitoring
 */
export interface McpObservabilityEvent {
  type?: string;
  level?: 'debug' | 'info' | 'warn' | 'error';
  message?: string;
  displayMessage?: string;
  sessionId?: string;
  serverId?: string;
  payload?: Record<string, any>;
  metadata?: Record<string, any>; // Kept for backward compatibility
  timestamp: number;
  id?: string;
}

/**
 * DisposableStore for managing multiple disposables
 * Useful for cleanup in React hooks
 */
export class DisposableStore {
  private disposables: Set<Disposable> = new Set();

  add(disposable: Disposable): void {
    this.disposables.add(disposable);
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.clear();
  }
}
