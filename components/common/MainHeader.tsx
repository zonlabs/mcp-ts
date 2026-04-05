"use client";

import Header from "@/components/common/Header";
import { usePathname } from "next/navigation";
import { Toaster } from "react-hot-toast";

export default function MainHeader() {
  const pathname = usePathname();

  if (pathname.startsWith("/chat") || pathname.startsWith("/settings")) {
    return null;
  }

  return (
    <>
      <Header />
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
    </>
  );
}
