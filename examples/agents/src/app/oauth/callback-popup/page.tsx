'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

function OAuthCallbackContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState('Processing...');

  useEffect(() => {
    const code = searchParams.get('code');

    if (code && window.opener) {
      window.opener.postMessage(
        { type: 'MCP_AUTH_CODE', code },
        window.location.origin
      );
      setStatus('Authentication successful! Closing...');
      setTimeout(() => window.close(), 1000);
    } else if (!window.opener) {
      setStatus('Error: No opener window found');
    } else {
      setStatus('Error: No authorization code received');
    }
  }, [searchParams]);

  return (
    <div className="text-center text-zinc-100">
      <p className="text-lg">{status}</p>
    </div>
  );
}

export default function OAuthCallbackPopup() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-900">
      <Suspense fallback={<div className="text-zinc-100">Loading...</div>}>
        <OAuthCallbackContent />
      </Suspense>
    </div>
  );
}
