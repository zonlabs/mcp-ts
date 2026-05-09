"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useMcp } from "@mcp-ts/sdk/client/react";

const AUTH_CODE_MESSAGE = "MCP_AUTH_CODE";
const AUTH_RESULT_MESSAGE = "MCP_AUTH_RESULT";

function PopupCallbackContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const sessionId = searchParams.get("state");

  const { connections, finishAuth } = useMcp({
    url: "/api/mcp",
    identity: process.env.NEXT_PUBLIC_MCP_IDENTITY!,
    autoConnect: true,
  });

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const resolvedSessionId = sessionId || searchParams.get("sessionId");

  // 1. Success Monitor: If the main window succeeds, this popup should just close.
  useEffect(() => {
    if (!resolvedSessionId) return;
    const conn = connections.find(c => c.sessionId === resolvedSessionId);
    if (conn?.state === 'CONNECTED' || conn?.state === 'READY') {
      setStatus("success");
      window.setTimeout(() => window.close(), 1200);
    }
  }, [connections, resolvedSessionId]);

  useEffect(() => {
    if (!code || !resolvedSessionId || status !== "loading") {
      if (!code || !resolvedSessionId) {
        setStatus("error");
        setErrorMessage("Missing required OAuth parameters.");
      }
      return;
    }

    let closed = false;

    const handleResult = (event: MessageEvent) => {
      if (event.origin && event.origin !== window.location.origin) return;
      if (event.data?.type !== AUTH_RESULT_MESSAGE) return;
      if (event.data.sessionId !== resolvedSessionId) return;

      if (event.data.success) {
        setStatus("success");
        closed = true;
        window.setTimeout(() => window.close(), 1200);
      } else if (!closed) {
        setStatus("error");
        setErrorMessage(event.data.error || "Authentication failed");
      }
    };

    const channel = new BroadcastChannel("mcp-auth-channel");
    channel.addEventListener("message", handleResult);
    window.addEventListener("message", handleResult);

    const payload = { type: AUTH_CODE_MESSAGE, code, sessionId: resolvedSessionId, state: resolvedSessionId };

    // Send via all available paths
    if (window.opener) {
      try {
        window.opener.postMessage(payload, window.location.origin);
      } catch (err) {
        console.warn('[PopupCallback] postMessage failed:', err);
      }
    }
    channel.postMessage(payload);

    // Fallback if the main window is gone or unresponsive
    const fallbackTimeout = window.setTimeout(() => {
      if (!closed && status === "loading") {
        console.log('[PopupCallback] No response from main window, attempting direct fallback...');
        void completeAuthInPopup();
      }
    }, 30000);

    async function completeAuthInPopup() {
      if (closed) return;
      try {
        await finishAuth(resolvedSessionId as string, code as string);
        setStatus("success");
        closed = true;
        window.setTimeout(() => window.close(), 1200);
      } catch (error) {
        if (closed) return;
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "Failed to complete authorization.");
      }
    }

    return () => {
      window.clearTimeout(fallbackTimeout);
      window.removeEventListener("message", handleResult);
      channel.close();
    };
  }, [code, resolvedSessionId, finishAuth]);


  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50/50 text-gray-900 font-sans p-4">
      <div className="p-8 bg-white shadow-xl shadow-black/5 rounded-2xl flex flex-col items-center justify-center max-w-sm w-full border border-gray-100 text-center transition-all duration-300">
        <div className="mb-6 flex items-center justify-center h-16">
          {status === "loading" && (
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
          )}
          {status === "success" && (
            <CheckCircle2 className="w-14 h-14 text-emerald-500" />
          )}
          {status === "error" && (
            <XCircle className="w-14 h-14 text-red-500" />
          )}
        </div>
        
        <h2 className="text-xl font-semibold text-gray-800 mb-2">
          {status === "loading" && "Authenticating..."}
          {status === "success" && "Successfully Connected!"}
          {status === "error" && "Authentication Failed"}
        </h2>
        
        <p className="text-sm text-gray-500 max-w-[260px] leading-relaxed">
          {status === "loading" && "Please wait while we securely connect your workspace."}
          {status === "success" && "Your workspace is now connected in the main window. This window will close automatically."}
          {status === "error" && errorMessage}
        </p>

        {status === "error" && (
          <button 
            onClick={() => window.close()}
            className="mt-8 px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-sm font-medium transition-colors"
          >
            Close Window
          </button>
        )}
      </div>
    </div>
  );
}

export default function PopupCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-gray-50/50">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      }
    >
      <PopupCallbackContent />
    </Suspense>
  );
}
