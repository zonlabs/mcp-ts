"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ServerIcon } from "@/components/common/ServerIcon";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, XCircle } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

/** Dash + gap must sum to this for a seamless looping stroke-dashoffset animation. */
const FLOW_DASH_PERIOD = 24;
/** Short–long rhythm: reads as small packets on the wire (sum = FLOW_DASH_PERIOD). */
const FLOW_DASH_PATTERN = "4 3 4 13";

/**
 * Flow accent colors are set on the page root via CSS variables so SVG strokes and
 * bubble backgrounds track light/dark together: `--callback-flow-blue`, `--callback-flow-orange`.
 */

function LoadingBubbles() {
  const bubbles = [
    { delayMs: 0, tone: "blue" as const },
    { delayMs: 120, tone: "orange" as const },
    { delayMs: 240, tone: "blue" as const },
  ] as const;

  return (
    <>
      <style>
        {`
          @keyframes mcp-callback-bubble {
            0%, 100% {
              transform: translate3d(0, 0, 0) scale(1);
              opacity: 0.38;
            }
            50% {
              transform: translate3d(0, -9px, 0) scale(1.07);
              opacity: 1;
            }
          }
          .mcp-callback-bubble-dot {
            animation: mcp-callback-bubble 0.9s cubic-bezier(0.45, 0.05, 0.25, 1) infinite;
            will-change: transform, opacity;
          }
          @media (prefers-reduced-motion: reduce) {
            .mcp-callback-bubble-dot {
              animation: none;
              opacity: 0.75;
              transform: none;
            }
          }
        `}
      </style>
      <div
        className="flex justify-center gap-2.5 h-11 items-end pb-0.5"
        role="status"
        aria-live="polite"
        aria-label="Connecting"
      >
        {bubbles.map(({ delayMs, tone }, i) => (
          <span
            key={i}
            className={cn(
              "mcp-callback-bubble-dot size-3 rounded-full shadow-[0_1px_2px_rgb(0_0_0/0.06)] dark:shadow-[0_1px_3px_rgb(0_0_0/0.45)]",
              tone === "orange"
                ? "bg-[color:var(--callback-flow-orange)]"
                : "bg-[color:var(--callback-flow-blue)]"
            )}
            style={{
              animationDelay: `${delayMs}ms`,
            }}
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
    <div
      className={cn(
        "flex min-h-dvh items-center justify-center bg-neutral-100 p-4 sm:p-6 dark:bg-zinc-900",
        "[--callback-flow-blue:#60a5fa] [--callback-flow-orange:#fb923c]",
        "dark:[--callback-flow-blue:#93c5fd] dark:[--callback-flow-orange:#fdba74]"
      )}
    >
      <Card className="flex h-[26rem] w-full max-w-md flex-col overflow-hidden border-stone-200/80 bg-white py-0 gap-0 shadow-md dark:border-zinc-700 dark:bg-zinc-800 dark:shadow-lg dark:shadow-black/25 sm:h-[27rem]">
        <CardContent className="flex h-full min-h-0 flex-1 flex-col p-0 text-center">
        <div className="shrink-0 bg-white dark:bg-zinc-800">
          {/* Icons + labels share one horizontal wash; body matches card below. */}
          <div
            className={cn(
              "px-6 pt-8 sm:px-8 sm:pt-9",
              status === "loading" ? "pb-8 sm:pb-10" : "pb-4 sm:pb-5",
              "bg-white",
              "[background-image:linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0)_40%,rgba(255,255,255,0.5)_72%,rgba(255,255,255,0.92)_90%,rgb(255_255_255)_100%),linear-gradient(90deg,rgb(245_243_255)_0%,rgb(255_255_255)_46%,rgb(255_247_237)_100%)]",
              "dark:bg-zinc-800",
              "dark:[background-image:linear-gradient(180deg,rgba(39,39,42,0)_0%,rgba(39,39,42,0)_40%,rgba(39,39,42,0.45)_72%,rgba(39,39,42,0.9)_90%,rgb(39_39_42)_100%),linear-gradient(90deg,rgba(99,102,241,0.14)_0%,rgb(39_39_42)_46%,rgba(234,88,12,0.1)_100%)]"
            )}
          >
            <div className="mx-auto grid w-max max-w-full grid-cols-[auto_auto_auto] items-center justify-items-center gap-x-1.5 gap-y-2 sm:gap-x-2">
              <div className="flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-stone-50 dark:shadow-md dark:shadow-black/20 dark:ring-1 dark:ring-zinc-600/25">
                  <Image
                    src="/logo.svg"
                    alt="MCP Assistant"
                    width={32}
                    height={32}
                    className="object-contain"
                    priority
                  />
                </div>
              </div>
              <div
                className="flex h-16 w-12 shrink-0 items-center justify-center sm:w-[3.25rem]"
                aria-hidden
              >
                <svg
                  className="h-9 w-full translate-y-0.5 text-neutral-300/80 sm:h-10 dark:text-zinc-600"
                  viewBox="0 0 56 22"
                  fill="none"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <defs>
                    <style>
                      {`
                    @keyframes mcp-flow-to-server {
                      from { stroke-dashoffset: 0; }
                      to { stroke-dashoffset: -${FLOW_DASH_PERIOD}; }
                    }
                    @keyframes mcp-flow-to-assistant {
                      from { stroke-dashoffset: 0; }
                      to { stroke-dashoffset: ${FLOW_DASH_PERIOD}; }
                    }
                    @media (prefers-reduced-motion: reduce) {
                      .mcp-flow-line-anim {
                        animation: none !important;
                      }
                    }
                  `}
                    </style>
                  </defs>
                  {/* Hairline rails */}
                  <g
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinecap="square"
                    opacity={0.4}
                  >
                    <line x1="2" y1="7" x2="54" y2="7" />
                    <line x1="2" y1="15" x2="54" y2="15" />
                  </g>
                  <line
                    className="mcp-flow-line-anim"
                    x1="2"
                    y1="7"
                    x2="54"
                    y2="7"
                    stroke="var(--callback-flow-blue)"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeDasharray={FLOW_DASH_PATTERN}
                    style={{
                      animation: `mcp-flow-to-server 1.35s linear infinite`,
                      willChange: "stroke-dashoffset",
                    }}
                  />
                  <line
                    className="mcp-flow-line-anim"
                    x1="2"
                    y1="15"
                    x2="54"
                    y2="15"
                    stroke="var(--callback-flow-orange)"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeDasharray={FLOW_DASH_PATTERN}
                    style={{
                      animation: `mcp-flow-to-assistant 1.35s linear infinite`,
                      animationDelay: "0.18s",
                      willChange: "stroke-dashoffset",
                    }}
                  />
                </svg>
              </div>
              <div className="flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-stone-50 dark:shadow-md dark:shadow-black/20 dark:ring-1 dark:ring-zinc-600/25">
                  <ServerIcon
                    serverName={effectiveServerName || "MCP Server"}
                    serverUrl={effectiveServerUrl || ""}
                    size={26}
                    className="rounded-lg"
                    neutralTile
                  />
                </div>
              </div>
              <span className="text-center text-xs font-medium leading-tight text-neutral-600 dark:text-zinc-300">
                MCP Assistant
              </span>
              <div className="min-h-[1.25rem]" aria-hidden />
              <span className="text-center text-xs font-medium leading-tight text-neutral-600 dark:text-zinc-300">
                {effectiveServerName || "MCP Server"}
              </span>
            </div>
          </div>
        </div>

        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col justify-start bg-white px-6 pb-7 dark:bg-zinc-800 sm:px-8 sm:pb-8",
            status === "loading" && "pt-4",
            (status === "success" || status === "error") &&
              "pt-1 sm:pt-1.5",
            status === "error" && "pb-5 sm:pb-6"
          )}
        >
        {status === "loading" && (
          <div className="flex flex-col items-center gap-5">
            <h1 className="flex items-start justify-center gap-2 text-pretty text-center text-[13px] font-normal leading-snug tracking-normal text-neutral-600 dark:text-zinc-300 sm:text-sm">
              <Shield
                className="mt-0.5 size-3.5 shrink-0 text-neutral-400 dark:text-zinc-500 sm:size-4"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="max-w-[18rem]">Authorizing your request</span>
            </h1>
            <p className="mx-auto max-w-[17.5rem] text-pretty text-sm leading-relaxed text-neutral-600 dark:text-zinc-400">
              When it&apos;s done, we&apos;ll close this window and you can keep working
              in <span className="font-semibold text-neutral-800 dark:text-zinc-100">MCP Assistant</span>.
            </p>
            <LoadingBubbles />
            <p className="text-[11px] text-neutral-400 dark:text-zinc-500">
              This usually takes only a moment.
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="flex min-h-0 flex-1 flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col items-center space-y-2 sm:space-y-2.5">
              <div className="flex justify-center">
                <svg
                  className="h-10 w-10 text-green-500 dark:text-green-400"
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

              <h1 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-zinc-50 sm:text-xl">
                You&apos;re connected
              </h1>

              <p className="mx-auto max-w-[17rem] text-pretty text-sm text-neutral-600 dark:text-zinc-400">
                MCP Assistant can use{" "}
                <span className="font-medium text-neutral-800 dark:text-zinc-200">
                  {effectiveServerName || "this server"}
                </span>
                . This window will close on its own.
              </p>
            </div>

            <p className="mx-auto mt-auto max-w-[18rem] pt-8 text-pretty text-center text-[11px] leading-snug text-neutral-400 dark:text-zinc-500">
              You can continue in MCP Assistant—this server is ready for tools and
              requests until you disconnect it.
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col items-center gap-2">
              <div className="flex shrink-0 justify-center">
                <XCircle className="h-9 w-9 text-red-500 dark:text-red-400 sm:h-10 sm:w-10" />
              </div>

              <h1 className="shrink-0 text-lg font-semibold tracking-tight text-neutral-900 dark:text-zinc-50 sm:text-xl">
                Connection failed
              </h1>

              <p className="mx-auto max-h-24 min-h-0 w-full max-w-[17rem] overflow-y-auto overscroll-contain text-pretty text-center text-xs font-medium leading-snug text-red-600 dark:text-red-400">
                {errorMessage}
              </p>

              <button
                type="button"
                onClick={() => window.close()}
                className="mt-0.5 inline-flex shrink-0 items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-white dark:bg-red-600 dark:hover:bg-red-500 dark:focus:ring-offset-zinc-800"
              >
                Close Window
              </button>
            </div>

            <p className="mx-auto mt-auto max-w-[18rem] shrink-0 pt-4 text-pretty text-center text-[11px] leading-snug text-neutral-400 dark:text-zinc-500">
              Try again from MCP Assistant, or confirm the server URL and that you
              finished sign-in in your browser.
            </p>
          </div>
        )}
        </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CallbackSuccessPage() {
  return (
    <Suspense
      fallback={
        <div
          className={cn(
            "flex min-h-dvh items-center justify-center bg-neutral-100 p-4 sm:p-6 dark:bg-zinc-900",
            "[--callback-flow-blue:#60a5fa] [--callback-flow-orange:#fb923c]",
            "dark:[--callback-flow-blue:#93c5fd] dark:[--callback-flow-orange:#fdba74]"
          )}
        >
          <Card className="flex h-[26rem] w-full max-w-md flex-col overflow-hidden border-stone-200/80 bg-white py-0 gap-0 shadow-md dark:border-zinc-700 dark:bg-zinc-800 dark:shadow-lg dark:shadow-black/25 sm:h-[27rem]">
            <CardContent className="flex h-full min-h-0 flex-1 flex-col justify-start bg-white px-6 py-7 text-center dark:bg-zinc-800 sm:px-8 sm:py-8">
              <div className="flex w-full flex-col items-center gap-5 pt-4">
                <h1 className="flex items-start justify-center gap-2 text-pretty text-center text-[13px] font-normal leading-snug tracking-normal text-neutral-600 dark:text-zinc-300 sm:text-sm">
                  <Shield
                    className="mt-0.5 size-3.5 shrink-0 text-neutral-400 dark:text-zinc-500 sm:size-4"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <span className="max-w-[18rem]">Authorizing your request</span>
                </h1>
                <p className="mx-auto max-w-[17.5rem] text-pretty text-sm leading-relaxed text-neutral-600 dark:text-zinc-400">
                  When it&apos;s done, we&apos;ll close this window and you can keep
                  working in{" "}
                  <span className="font-semibold text-neutral-800 dark:text-zinc-100">
                    MCP Assistant
                  </span>
                  .
                </p>
                <LoadingBubbles />
                <p className="text-[11px] text-neutral-400 dark:text-zinc-500">
                  This usually takes only a moment.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
      <CallbackSuccessContent />
    </Suspense>
  );
}
