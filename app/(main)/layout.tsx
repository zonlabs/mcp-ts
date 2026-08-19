"use client";

import { AppShell } from "@/components/layout/AppShell";
import type { PropsWithChildren } from "react";

export default function MainLayout({ children }: PropsWithChildren) {
  return <AppShell>{children}</AppShell>;
}
