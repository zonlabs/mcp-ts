import { useEffect } from 'react';
import { Connection } from './types';

export function useOAuthPopup(
    connections: Connection[],
    finishAuth: (sessionId: string, code: string) => Promise<any>
) {
    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            // Security check: ensure message is from same origin
            if (event.origin !== window.location.origin) {
                console.log('Ignored message from different origin:', event.origin);
                return;
            }

            if (event.data?.type === 'MCP_AUTH_CODE' && event.data.code) {
                console.log('Received auth code message', event.data);

                // Find the authenticating session (should be the one in 'AUTHENTICATING' state)
                // connections is typed from useMcp, needs to match or we cast
                let authenticatingSession = connections.find(c => c.state === 'AUTHENTICATING');

                if (!authenticatingSession) {
                    console.warn('No session found in AUTHENTICATING state. Checking FAILED state...');
                    // Fallback: Check for sessions that failed with OAuth error
                    // Sometimes the error event might arrive after auth_required and overwrite the state
                    authenticatingSession = connections.find(c => c.state === 'FAILED' && (c.error?.toLowerCase().includes('oauth') || c.error?.toLowerCase().includes('auth')));
                }

                if (authenticatingSession) {
                    console.log('Found authenticating session:', authenticatingSession.sessionId);
                    try {
                        await finishAuth(authenticatingSession.sessionId, event.data.code);
                        console.log('Finished auth successfully');
                    } catch (err) {
                        console.error('Failed to finish auth:', err);
                        // We might want to show this error somewhere global or in the specific connection item
                        // For now connection error state handles it if useMcp updates it
                    }
                } else {
                    console.error('Could not find any session to apply auth code to. Available connections:', connections);
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [connections, finishAuth]);
}
