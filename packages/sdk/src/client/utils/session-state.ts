import type { McpConnectionState } from '../../shared/events';
import type { SessionInfo } from '../../shared/types';

export function getInitialConnectionState(status: SessionInfo['status']): McpConnectionState {
    return status === 'active' ? 'VALIDATING' : 'AUTHENTICATING';
}

export function isTransientReconnectState(state: McpConnectionState): boolean {
    return state === 'INITIALIZING' ||
        state === 'VALIDATING' ||
        state === 'RECONNECTING' ||
        state === 'CONNECTING' ||
        state === 'CONNECTED' ||
        state === 'DISCOVERING';
}

export function getVisibleConnectionState(
    incomingState: McpConnectionState,
    existingState?: McpConnectionState,
    previousState?: McpConnectionState
): McpConnectionState {
    // `INITIALIZING` has two meanings in practice:
    // 1. genuine cold start / reconnect work
    // 2. an internal setup step that happens mid-OAuth completion
    //
    // For case (2), showing raw `INITIALIZING` creates a confusing user-facing
    // sequence like AUTHENTICATING -> INITIALIZING -> AUTHENTICATED.
    if (
        incomingState === 'INITIALIZING' &&
        (
            existingState === 'AUTHENTICATING' ||
            existingState === 'AUTHENTICATED' ||
            previousState === 'AUTHENTICATING' ||
            previousState === 'AUTHENTICATED'
        )
    ) {
        return existingState === 'AUTHENTICATED' || previousState === 'AUTHENTICATED'
            ? 'AUTHENTICATED'
            : 'AUTHENTICATING';
    }

    return incomingState;
}
