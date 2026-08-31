"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";
import { CheckCircle2, XCircle } from "lucide-react";

const AUTH_CHANNEL_NAME = "mcp-auth-channel";

function createAuthBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(AUTH_CHANNEL_NAME);
  } catch {
    return null;
  }
}

function LoadingBubbles() {
  return (
    <>
      <style>{`
        @keyframes mcp-pulse {
          0%, 100% { transform: scale(1); opacity: 0.25; }
          50% { transform: scale(1.4); opacity: 0.8; }
        }
        .mcp-pulse { animation: mcp-pulse 1.2s ease-in-out infinite; }
      `}</style>
      <div className="flex items-center gap-2.5" role="status" aria-label="Loading">
        {[0, 200, 400].map((delay, i) => (
          <span
            key={i}
            className="mcp-pulse size-2 rounded-full bg-muted-foreground/60"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </>
  );
}

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

  useEffect(() => {
    if (hasPostedResultRef.current) return;

    const authSessionId = state || sessionId;

    if (code && !authSessionId) {
      hasPostedResultRef.current = true;
      setStatus("error");
      setErrorMessage("Missing OAuth state parameter. Please try connecting again.");
      return;
    }

    if (code && authSessionId) {
      hasPostedResultRef.current = true;
      const payload = {
        type: "MCP_AUTH_CODE",
        code,
        sessionId: authSessionId,
        state: authSessionId,
      };

      const postAuthCode = () => {
        if (window.opener) {
          try {
            window.opener.postMessage(payload, window.location.origin);
          } catch {
            // ignore
          }
        }
      };

      postAuthCode();
      const channel = createAuthBroadcastChannel();
      if (channel) channel.postMessage(payload);

      setStatus("success");
      const retryInterval = window.setInterval(() => {
        postAuthCode();
        channel?.postMessage(payload);
      }, 200);

      setTimeout(() => {
        window.clearInterval(retryInterval);
        channel?.close();
        try {
          window.close();
        } catch {
          // ignore
        }
      }, 800);
      return;
    }

    if (step === "success" && sessionId) {
      hasPostedResultRef.current = true;
      setStatus("success");

      const payload = { type: "mcp-auth-success", sessionId, serverName, serverId, serverUrl };

      if (window.opener) {
        try {
          window.opener.postMessage(payload, window.location.origin);
        } catch {
          // ignore
        }
      }

      const channel = createAuthBroadcastChannel();
      if (channel) {
        channel.postMessage(payload);
        channel.close();
      }

      setTimeout(() => {
        try {
          window.close();
        } catch {
          // ignore
        }
      }, 800);
    } else if (step === "error" || error) {
      hasPostedResultRef.current = true;
      setStatus("error");
      setErrorMessage(error || "Authentication failed");

      const payload = { type: "mcp-auth-error", error: error || "Authentication failed" };

      if (window.opener) {
        try {
          window.opener.postMessage(payload, window.location.origin);
        } catch {
          // ignore
        }
      }

      const channel = createAuthBroadcastChannel();
      if (channel) {
        channel.postMessage(payload);
        channel.close();
      }
    }
  }, [step, sessionId, serverName, serverId, serverUrl, error, code, state]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm border-border/60 shadow-lg rounded-sm overflow-hidden">
        <div className="flex items-center justify-center gap-2.5 px-6 py-3 border-b border-border">
          <Image src="/logo.svg" alt="" width={32} height={32} className="rounded-md" />
          <span className="text-base font-medium text-foreground">MCP Assistant</span>
        </div>
        <CardContent className="flex flex-col items-center px-6 py-5 text-center">
          {status === "loading" && (
            <div className="flex flex-col items-center gap-4">
              <LoadingBubbles />
              <div>
                <p className="text-base font-medium text-foreground">Authorizing</p>
                <p className="mt-1 text-xs text-muted-foreground">Please wait while we complete the authentication...</p>
              </div>
            </div>
          )}

          {status === "success" && (
            <div className="flex flex-col items-center gap-4">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <div>
                <p className="text-base font-semibold text-foreground">Authorization Successful</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {serverName
                    ? `Connected to ${serverName}. This window will close shortly.`
                    : "Connection established. This window will close shortly."}
                </p>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center gap-4">
              <XCircle className="h-10 w-10 text-destructive" />
              <div>
                <p className="text-base font-semibold text-foreground">Authorization Failed</p>
                <p className="mt-1 text-xs text-muted-foreground">{errorMessage}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  try {
                    window.close();
                  } catch {
                    // ignore
                  }
                }}
                className="mt-1 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Close Window
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function CallbackSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-background p-4">
          <Card className="w-full max-w-sm border-border/60 shadow-lg">
            <CardContent className="flex flex-col items-center px-6 py-10 text-center">
              <p className="text-sm font-medium text-foreground">Please wait while we complete the authentication...</p>
            </CardContent>
          </Card>
        </div>
      }
    >
      <CallbackSuccessContent />
    </Suspense>
  );
}
