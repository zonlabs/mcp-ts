import { useEffect } from 'react';
import { toast } from 'react-hot-toast';

/**
 * Shared hook for handling OAuth callback redirects
 *
 * This hook:
 * 1. Detects OAuth callback success/error in URL params
 * 2. Shows success/error toast
 * 3. Clears URL params after handling
 * 4. Triggers a refresh callback to fetch updated connections
 *
 * Note: Connection is already stored by the callback endpoint,
 * so we just need to trigger a refresh to get the updated state
 */
export function useOAuthCallback(onSuccess?: () => void) {
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const step = searchParams.get('step');
    const serverName = searchParams.get('server');

    if (step === 'success' && serverName) {
      toast.success(`Connected to ${serverName} successfully`);

      // Trigger refresh callback to fetch updated connections from API
      if (onSuccess) {
        onSuccess();
      }

      // Clear URL params while preserving the current path
      const currentPath = window.location.pathname;
      window.history.replaceState({}, '', currentPath);
    } else if (step === 'error') {
      const errorMsg = searchParams.get('error') || 'OAuth authorization failed';
      toast.error(errorMsg);

      // Clear URL params
      const currentPath = window.location.pathname;
      window.history.replaceState({}, '', currentPath);
    }
  }, [onSuccess]);
}
