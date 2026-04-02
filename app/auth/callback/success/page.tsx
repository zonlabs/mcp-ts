"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ServerIcon } from "@/components/common/ServerIcon";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import Image from "next/image";

function CallbackSuccessContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const hasPostedResultRef = useRef(false);

  const step = searchParams.get("step");
  const sessionId = searchParams.get("sessionId");
  const serverName = searchParams.get("server");
  const serverId = searchParams.get("serverId");
  const serverUrl = searchParams.get("serverUrl");
  const error = searchParams.get("error");
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const effectiveServerUrl = serverUrl || "";
  const effectiveServerName = serverName || "";

  useEffect(() => {
    if (hasPostedResultRef.current) return;

    if (code && state && window.opener) {
      hasPostedResultRef.current = true;
      window.opener.postMessage(
        { type: "MCP_AUTH_CODE", code, state },
        window.location.origin
      );
      setStatus("success");
      setTimeout(() => {
        window.close();
      }, 1000);
      return;
    }

    // Check if we have a step parameter
    if (step === "success" && sessionId) {
      hasPostedResultRef.current = true;
      setStatus("success");

      // Send message to parent window to resolve the promise
      if (window.opener) {
        window.opener.postMessage(
          {
            type: "mcp-auth-success",
            sessionId,
            serverName,
            serverId,
            serverUrl,
          },
          window.location.origin
        );

        // Auto-close window after 2 seconds
        setTimeout(() => {
          window.close();
        }, 2000);
      }
    } else if (step === "error" || error) {
      hasPostedResultRef.current = true;
      setStatus("error");
      setErrorMessage(error || "Authentication failed");

      // Send error message to parent window
      if (window.opener) {
        window.opener.postMessage(
          {
            type: "mcp-auth-error",
            error: error || "Authentication failed",
          },
          window.location.origin
        );
      }
    }
  }, [step, sessionId, serverName, serverId, serverUrl, error, code, state]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-sm w-full space-y-6 text-center">
        {/* Logos */}
        <div className="grid grid-cols-[auto_auto_auto] gap-3 items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="h-16 w-16 rounded-2xl border-2 border-border/80 bg-white flex items-center justify-center shadow-sm">
              <Image
                src="/logo.svg"
                alt="MCP Assistant"
                width={32}
                height={32}
                className="object-contain"
                priority
              />
            </div>
            <span className="text-xs text-muted-foreground">MCP Assistant</span>
          </div>
          <div className="flex flex-col items-center text-green-400">
            <svg
              className="h-4.5 w-12"
              viewBox="0 0 40 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="2" y1="8" x2="34" y2="8" />
              <polyline points="30,4 34,8 30,12" />
            </svg>
            <svg
              className="h-4.5 w-12 -mt-1.5"
              viewBox="0 0 40 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="6" y1="8" x2="38" y2="8" />
              <polyline points="10,4 6,8 10,12" />
            </svg>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="h-16 w-16 rounded-2xl border-2 border-border/80 bg-white flex items-center justify-center shadow-sm">
              <ServerIcon
                serverName={effectiveServerName || "MCP Server"}
                serverUrl={effectiveServerUrl || ""}
                size={26}
                className="rounded-lg"
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {effectiveServerName || "MCP Server"}
            </span>
          </div>
        </div>

        {status === "loading" && (
          <div className="space-y-3">
            <div className="flex justify-center">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
            <h1 className="text-lg font-semibold text-foreground">
              Processing...
            </h1>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-center">
              <svg
                className="h-10 w-10 text-green-500"
                viewBox="0 0 40 40"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="20" cy="20" r="16" />
                <path d="M14 20.5l4 4 8-9" />
              </svg>
            </div>

            <h1 className="text-xl font-semibold text-foreground">
              Connection established successfully
            </h1>

            <p className="text-xs text-muted-foreground">
              This window will close automatically.
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-center">
              <XCircle className="w-10 h-10 text-red-500" />
            </div>

            <h1 className="text-xl font-semibold text-foreground">
              Connection failed
            </h1>

            <p className="text-sm text-muted-foreground">
              Unable to complete connection
            </p>

            <p className="text-xs text-red-500 font-medium">{errorMessage}</p>

            <button
              onClick={() => window.close()}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
            >
              Close Window
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CallbackSuccessPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CallbackSuccessContent />
    </Suspense>
  );
}
