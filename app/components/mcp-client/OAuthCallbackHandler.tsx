"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

interface OAuthCallbackHandlerProps {
  onRefreshServers: () => Promise<void>;
}

export default function OAuthCallbackHandler({ onRefreshServers }: OAuthCallbackHandlerProps) {
  const searchParams = useSearchParams();

  // Handle OAuth callback success
  useEffect(() => {
    const server = searchParams.get('server');
    const step = searchParams.get('step');

    if (step === 'success' && server) {
      // toast.success(`OAuth completed for ${server}! Server will connect automatically.`);
      // Refresh servers to get updated status
      setTimeout(() => {
        onRefreshServers();
      }, 1000);
    }
  }, [searchParams, onRefreshServers]);

  return null;
}
