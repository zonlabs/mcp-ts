"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Server, Search, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ServerIcon } from "@/components/common/ServerIcon";
import type { McpServer } from "@/types/mcp";

interface ServerPlaceholderProps {
  type: "no-selection" | "no-servers";
  tab?: "public" | "user";
}

export function ServerPlaceholder({ type, tab }: ServerPlaceholderProps) {
  const [featuredServers, setFeaturedServers] = useState<McpServer[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
  };

  useEffect(() => {
    let cancelled = false;

    async function loadFeaturedServers() {
      try {
        setFeaturedLoading(true);
        const params = new URLSearchParams({
          first: "100",
          public: "true",
          featured: "true",
          orderBy: "name",
        });
        const response = await fetch(`/api/mcp?${params.toString()}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to load featured MCPs");
        }

        if (!cancelled) {
          setFeaturedServers(Array.isArray(data.servers) ? data.servers : []);
        }
      } catch {
        if (!cancelled) {
          setFeaturedServers([]);
        }
      } finally {
        if (!cancelled) {
          setFeaturedLoading(false);
        }
      }
    }

    void loadFeaturedServers();

    return () => {
      cancelled = true;
    };
  }, []);

  const formatDescription = (description?: string | null) => {
    if (!description) return null;

    return description
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  if (type === "no-selection") {
    return (
      <div className="flex-1 p-4 sm:p-6 md:p-8 min-h-[calc(100vh-120px)] dark:bg-transparent">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="mx-auto max-w-5xl w-full"
        >
          {(featuredLoading || featuredServers.length > 0) && (
            <motion.div variants={itemVariants} className="p-0">
              <div className="mb-5">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  <h2 className="text-base font-semibold text-foreground">Popular MCPs</h2>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Featured servers available in MCP Assistant.
                </p>
              </div>

              {featuredLoading ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FeaturedServerSkeleton />
                  <FeaturedServerSkeleton />
                  <FeaturedServerSkeleton />
                  <FeaturedServerSkeleton />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {featuredServers.map((server) => (
                    <div
                      key={server.id}
                      className="rounded-xl border border-red-200/70 bg-background/50 p-3 text-left transition-colors hover:bg-red-50/20 dark:border-red-400/20 dark:hover:bg-red-950/10"
                    >
                      <div className="flex items-start gap-2.5">
                        <ServerIcon
                          serverName={server.name}
                          serverUrl={server.url}
                          size={36}
                          className="rounded-lg"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground">{server.name}</p>
                          {formatDescription(server.description) ? (
                            <p className="mt-1 line-clamp-3 text-sm leading-6 text-muted-foreground">
                              {formatDescription(server.description)}
                            </p>
                          ) : (
                            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                              No description available.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </motion.div>
      </div>
    );
  }

  // No Servers - User Tab
  if (type === "no-servers" && tab === "user") {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
        <div className="bg-muted/50 p-4 rounded-full mb-4">
          <Server className="h-8 w-8 text-muted-foreground/70" />
        </div>
        <h3 className="text-base font-semibold mb-2">No Personal Servers</h3>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-6 leading-relaxed">
          You haven't connected any custom servers yet. Add a local or remote server to get started.
        </p>
      </div>
    );
  }

  // No Servers - Public Tab (or generic)
  return (
    <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
      <div className="bg-muted/50 p-4 rounded-full mb-4">
        <Search className="h-8 w-8 text-muted-foreground/70" />
      </div>
      <h3 className="text-base font-semibold mb-2">No Public Servers Found</h3>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
        We couldn't find any public servers matching your criteria. Try adjusting your filters.
      </p>
    </div>
  );
}

function FeaturedServerSkeleton() {
  return (
    <div className="rounded-xl border border-red-200/70 bg-background/50 p-3 dark:border-red-400/20">
      <div className="flex items-start gap-2.5">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    </div>
  );
}


