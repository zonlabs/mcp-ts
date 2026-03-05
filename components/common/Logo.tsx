"use client";

import Image from "next/image";

type LogoProps = {
  size?: number;
};

export default function Logo({ size = 40 }: LogoProps) {
  return (
    <Image
      src="/logo.svg"
      alt="MCP Platform"
      width={size}
      height={size}
    />
  );
}
