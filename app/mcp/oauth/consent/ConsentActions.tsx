"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type PendingAction = "allow" | "cancel" | null;

function Spinner() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 animate-spin"
      fill="none"
      viewBox="0 0 24 24"
    >
      {Array.from({ length: 12 }, (_, index) => (
        <line
          key={index}
          opacity={(index + 1) / 12}
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
          transform={`rotate(${index * 30} 12 12)`}
          x1="12"
          x2="12"
          y1="2.5"
          y2="5.5"
        />
      ))}
    </svg>
  );
}

export function ConsentActions({ authorizationId }: { authorizationId: string }) {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const isPending = pendingAction !== null;

  const handleAction = async (action: "allow" | "cancel") => {
    setPendingAction(action);
    try {
      const endpoint = action === "allow" ? "/api/mcp-oauth/approve" : "/api/mcp-oauth/deny";
      const formData = new FormData();
      formData.append("authorization_id", authorizationId);

      const res = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        let errMsg = "Request failed";
        try {
          const errData = await res.json() as { error?: string };
          errMsg = errData.error || errMsg;
        } catch {
          const text = await res.text();
          errMsg = text || errMsg;
        }
        window.location.href = `/mcp/oauth/consent?authorization_id=${authorizationId}&error=${encodeURIComponent(errMsg)}`;
        return;
      }

      const data = await res.json() as { redirect_url?: string; error?: string };
      if (data.error) {
        window.location.href = `/mcp/oauth/consent?authorization_id=${authorizationId}&error=${encodeURIComponent(data.error)}`;
      } else if (data.redirect_url) {
        window.location.href = data.redirect_url;
      } else {
        throw new Error("No redirect URL returned by server");
      }
    } catch (err: unknown) {
      console.error("[ConsentActions] Action failed:", err);
      const msg = err instanceof Error ? err.message : "Network error";
      window.location.href = `/mcp/oauth/consent?authorization_id=${authorizationId}&error=${encodeURIComponent(msg)}`;
    }
  };

  return (
    <div className="space-y-3">
      <Button
        disabled={isPending}
        className="h-10 w-full rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-55"
        onClick={() => handleAction("allow")}
        type="button"
      >
        {pendingAction === "allow" ? <Spinner /> : "Allow access"}
      </Button>
      <Button
        disabled={isPending}
        className="h-10 w-full rounded-md border border-border bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground hover:border-border/80 transition-all duration-200 disabled:opacity-55"
        onClick={() => handleAction("cancel")}
        type="button"
        variant="ghost"
      >
        {pendingAction === "cancel" ? <Spinner /> : "Cancel"}
      </Button>
    </div>
  );
}
