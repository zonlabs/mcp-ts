"use client";

import React from "react";
import { cn } from "@/lib/utils";

type LogoProps = {
  size?: number;
  className?: string;
};

export default function Logo({ size = 32, className }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={size}
      height={size}
      role="img"
      aria-label="MCP Assistant Logo"
      className={cn("rounded-sm shrink-0 shadow-2xs", className)}
    >
      <rect width="256" height="256" rx="28" fill="currentColor" className="text-destructive" />
      <g fill="none" stroke="#ffffff" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round">
        <path d="M58 209 V47 L128 77 L198 47 V129" />
        <path d="M128 77 V157" />
      </g>
    </svg>
  );
}

export function LogoBadge({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-sm border border-destructive/50 bg-transparent text-foreground font-medium text-sm transition-transform active:scale-[0.98] cursor-pointer select-none",
        className
      )}
    >
      <Logo size={22} className="rounded-xs" />
      <span className="font-semibold text-sm tracking-tight text-foreground">
        MCP Assistant
      </span>
    </div>
  );
}
