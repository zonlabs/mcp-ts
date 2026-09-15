"use client";

import React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

type LogoProps = {
  size?: number;
  className?: string;
  alt?: string;
};

export default function Logo({ size = 36, className, alt = "LinkOS Logo" }: LogoProps) {
  return (
    <Image
      src="/logo-light.svg"
      alt={alt}
      width={Math.round(size * 3.5)}
      height={size}
      priority
      className={cn("shrink-0 object-contain dark:invert", className)}
    />
  );
}

export function LogoBadge({ className, size = 36 }: { className?: string; size?: number }) {
  return (
    <Logo size={size} className={cn("select-none", className)} alt="LinkOS" />
  );
}
