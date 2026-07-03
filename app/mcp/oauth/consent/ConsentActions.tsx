"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { denyAction } from "./actions";

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

/**
 * Must be rendered inside a <form> — uses useFormStatus to read the parent
 * form's pending state and disable both buttons while a submission is in flight.
 */
export function ConsentActions() {
  const { pending } = useFormStatus();

  return (
    <div className="space-y-3">
      <Button
        type="submit"
        disabled={pending}
        className="h-10 w-full rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-55"
      >
        {pending ? <Spinner /> : "Allow access"}
      </Button>
      <Button
        type="submit"
        formAction={denyAction}
        disabled={pending}
        className="h-10 w-full rounded-md border border-border bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground hover:border-border/80 transition-all duration-200 disabled:opacity-55"
        variant="ghost"
      >
        {pending ? <Spinner /> : "Cancel"}
      </Button>
    </div>
  );
}
