import type { McpConnectionEvent, McpObservabilityEvent } from './events.js';
import type { McpRpcResponse } from './types.js';

export function isRpcResponseEvent(
  event: McpConnectionEvent | McpObservabilityEvent | McpRpcResponse
): event is McpRpcResponse {
  return 'id' in event && ('result' in event || 'error' in event);
}

export function isConnectionEvent(
  event: McpConnectionEvent | McpObservabilityEvent | McpRpcResponse
): event is McpConnectionEvent {
  if (!('type' in event)) {
    return false;
  }

  switch (event.type) {
    case 'state_changed':
    case 'capabilities_discovered':
    case 'auth_required':
    case 'error':
    case 'disconnected':
    case 'progress':
      return true;
    default:
      return false;
  }
}
