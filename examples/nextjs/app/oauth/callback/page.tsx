'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useMcp } from '@mcp-assistant/mcp-redis/client';

export default function OAuthCallback() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [error, setError] = useState<string | null>(null);

  const { finishAuth } = useMcp({
    url: '/api/mcp',
    userId: 'demo-user-123',
    authToken: 'demo-auth-token',
    autoConnect: true,
    autoInitialize: false,
  });

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setStatus('error');
      setError(`OAuth error: ${errorParam}`);
      return;
    }

    if (!code) {
      setStatus('error');
      setError('No authorization code received');
      return;
    }

    // Extract sessionId from state parameter
    // The state should be in format: sessionId or userId:sessionId
    const sessionId = state || '';

    if (!sessionId) {
      setStatus('error');
      setError('Invalid state parameter');
      return;
    }

    // Complete OAuth flow
    finishAuth(sessionId, code)
      .then(() => {
        setStatus('success');
        // Redirect back to main page after 2 seconds
        setTimeout(() => {
          router.push('/');
        }, 2000);
      })
      .catch((err) => {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Failed to complete OAuth');
      });
  }, [searchParams, finishAuth, router]);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>OAuth Authorization</h1>

        {status === 'processing' && (
          <div style={styles.content}>
            <div style={styles.spinner}></div>
            <p>Completing authorization...</p>
          </div>
        )}

        {status === 'success' && (
          <div style={styles.content}>
            <div style={styles.successIcon}>✓</div>
            <p style={styles.successText}>Authorization successful!</p>
            <p style={styles.subText}>Redirecting you back...</p>
          </div>
        )}

        {status === 'error' && (
          <div style={styles.content}>
            <div style={styles.errorIcon}>✕</div>
            <p style={styles.errorText}>Authorization failed</p>
            <p style={styles.errorDetail}>{error}</p>
            <button style={styles.button} onClick={() => router.push('/')}>
              Go Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#f3f4f6',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '0.5rem',
    padding: '2rem',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    maxWidth: '400px',
    width: '100%',
    textAlign: 'center' as const,
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold' as const,
    marginBottom: '1.5rem',
    color: '#111827',
  },
  content: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '1rem',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #e5e7eb',
    borderTopColor: '#3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  successIcon: {
    width: '64px',
    height: '64px',
    backgroundColor: '#d1fae5',
    color: '#065f46',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '2rem',
    fontWeight: 'bold' as const,
  },
  successText: {
    fontSize: '1.125rem',
    fontWeight: '600' as const,
    color: '#065f46',
  },
  subText: {
    color: '#6b7280',
    fontSize: '0.875rem',
  },
  errorIcon: {
    width: '64px',
    height: '64px',
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '2rem',
    fontWeight: 'bold' as const,
  },
  errorText: {
    fontSize: '1.125rem',
    fontWeight: '600' as const,
    color: '#991b1b',
  },
  errorDetail: {
    color: '#6b7280',
    fontSize: '0.875rem',
  },
  button: {
    marginTop: '1rem',
    padding: '0.75rem 1.5rem',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontWeight: '600' as const,
    cursor: 'pointer',
  },
};
