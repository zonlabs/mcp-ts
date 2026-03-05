"use client";

import Header from "@/components/common/Header";
import { usePathname } from "next/navigation";

export default function MainHeader() {
  const pathname = usePathname();

  if (pathname === "/playground") {
    return null;
  }

  return <Header />;
}
