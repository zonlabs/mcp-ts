"use client";

import Header from "@/components/common/Header";
import { usePathname } from "next/navigation";

export default function MainHeader() {
  const pathname = usePathname();

  if (pathname === "/playground" || pathname.startsWith("/settings")) {
    return null;
  }

  return <Header />;
}
