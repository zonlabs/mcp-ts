"use client";

import { Suspense } from "react";
import { RegistryBrowser } from "@/components/registry/RegistryBrowser";
import { Skeleton } from "@/components/ui/skeleton";
import { Package } from "lucide-react";
function RegistryPageContent() {
  return <RegistryBrowser />;
}

export default function RegistryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen">
          <div className="border-b border-border/50 bg-gradient-to-b from-background to-muted/20">
            <div className="container mx-auto px-4 py-12 max-w-7xl">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-2">
                  <Package className="h-8 w-8 text-primary" />
                </div>
                <Skeleton className="h-12 w-80" />
                <Skeleton className="h-6 w-96" />
                <Skeleton className="h-14 w-full max-w-2xl mt-8" />
              </div>
            </div>
          </div>
          <div className="container mx-auto px-4 py-8 max-w-7xl">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, idx) => (
                <Skeleton key={idx} className="h-64 w-full rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      }
    >
      <RegistryPageContent />
    </Suspense>
  );
}
