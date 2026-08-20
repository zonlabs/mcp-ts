"use client";

import React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

type LogoProps = {
  size?: number;
  className?: string;
  alt?: string;
};

export default function Logo({ size = 36, className, alt = "MCP Assistant Logo" }: LogoProps) {
  return (
    <Image
      src="/logo.svg"
      alt={alt}
      width={size}
      height={size}
      priority
      className={cn("shrink-0 object-contain", className)}
    />
  );
}

export function LogoBadge({ className, size = 36 }: { className?: string; size?: number }) {
  return (
    <div className={cn("flex items-center select-none", className)}>
      <Logo size={size} />
    </div>
  );
}
