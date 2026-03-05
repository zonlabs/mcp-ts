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

  useEffect(() => {
    if (hasPostedResultRef.current) return;

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
  }, [step, sessionId, serverName, serverId, serverUrl, error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full space-y-8 text-center">
        {/* MCP Assistant Logo */}
        <div className="flex justify-center">
          <Image
            src="/logo.svg"
            alt="MCP Assistant"
            width={120}
            height={120}
            className="object-contain"
            priority
          />
        </div>

        {status === "loading" && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <Loader2 className="w-16 h-16 text-primary animate-spin" />
            </div>
            <h1 className="text-2xl font-semibold text-foreground">
              Processing...
            </h1>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Success Icon */}
            <div className="flex justify-center">
              <CheckCircle className="w-20 h-20 text-green-500" />
            </div>

            <h1 className="text-3xl font-bold text-foreground">
              Connected Successfully!
            </h1>

            {/* Server Info */}
            {serverName && (
              <div className="flex items-center justify-center gap-3 p-4 bg-muted/50 rounded-lg">
                <ServerIcon
                  serverName={serverName}
                  serverUrl={serverUrl || ""}
                  size={40}
                  className="rounded-lg"
                />
                <span className="text-lg font-medium text-foreground">
                  {serverName}
                </span>
              </div>
            )}

            <p className="text-muted-foreground">
              Your account has been connected successfully. This window will close automatically.
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Error Icon */}
            <div className="flex justify-center">
              <XCircle className="w-20 h-20 text-red-500" />
            </div>

            <h1 className="text-3xl font-bold text-foreground">
              Connection Failed
            </h1>

            {serverName && (
              <div className="flex items-center justify-center gap-3 p-4 bg-muted/50 rounded-lg">
                <ServerIcon
                  serverName={serverName}
                  serverUrl={serverUrl || ""}
                  size={40}
                  className="rounded-lg"
                />
                <span className="text-lg font-medium text-foreground">
                  {serverName}
                </span>
              </div>
            )}

            <p className="text-red-500 font-medium">{errorMessage}</p>

            <button
              onClick={() => window.close()}
              className="inline-flex items-center justify-center px-6 py-3 text-base font-medium rounded-lg text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
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
