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

export function ConsentActions() {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const isPending = pendingAction !== null;

  return (
    <div className="space-y-3">
      <Button
        aria-disabled={isPending}
        className="h-10 w-full rounded-none bg-foreground text-background hover:bg-foreground/90 aria-disabled:pointer-events-none aria-disabled:opacity-55"
        onClick={() => setPendingAction("allow")}
        type="submit"
      >
        {pendingAction === "allow" ? <Spinner /> : "Allow access"}
      </Button>
      <Button
        aria-disabled={isPending}
        className="h-10 w-full rounded-none border-border bg-transparent aria-disabled:pointer-events-none aria-disabled:opacity-55"
        formAction="/api/workflow-oauth/deny"
        formMethod="post"
        onClick={() => setPendingAction("cancel")}
        type="submit"
        variant="outline"
      >
        {pendingAction === "cancel" ? <Spinner /> : "Cancel"}
      </Button>
    </div>
  );
}
