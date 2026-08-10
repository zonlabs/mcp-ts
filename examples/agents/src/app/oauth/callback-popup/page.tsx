'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  McpOAuthCallbackContent,
  McpOAuthCallbackFallback,
} from '@mcp-ts/sdk/client/react';

function OAuthCallbackContent() {
  const searchParams = useSearchParams();

  return (
    <McpOAuthCallbackContent
      code={searchParams.get('code')}
      sessionId={searchParams.get('state')}
    />
  );
}

export default function OAuthCallbackPopup() {
  return (
    <div
      style={{
        minHeight: '100vh',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fafafa',
      }}
    >
      <Suspense
        fallback={
          <McpOAuthCallbackFallback>
            <div style={{ color: '#71717a' }}>Loading authentication...</div>
          </McpOAuthCallbackFallback>
        }
      >
        <OAuthCallbackContent />
      </Suspense>
    </div>
  );
}
