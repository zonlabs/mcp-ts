"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Check, Copy, Star } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { McpServer } from "@/types/mcp";
import { ServerIcon } from "@/components/common/ServerIcon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function ServerItemSkeleton() {
  return (
    <div className="flex flex-col gap-3 border-b border-red-200/70 p-3 sm:rounded-xl sm:border sm:border-red-200/80 sm:border-b sm:bg-card/40 sm:p-4 dark:border-red-400/25">
      <Skeleton className="h-10 w-10 rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-28" />
      </div>
    </div>
  );
}

function ServerCard({ server }: { server: McpServer }) {
  const [copied, setCopied] = useState(false);

  const handleCopyUrl = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (server.url) {
      navigator.clipboard.writeText(server.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="group flex h-full flex-col gap-3 border-b border-red-200/70 p-3 transition-all duration-300 sm:rounded-xl sm:border-b-0 sm:p-2 sm:hover:bg-card/20 dark:border-red-400/25">
      <div className="flex items-center justify-between">
        <ServerIcon
          serverName={server.name}
          serverUrl={server.url}
          size={40}
        />
        <Badge variant="secondary" className="text-xs px-2 py-0.5 rounded-md font-normal">
          {server.transport}
        </Badge>
      </div>

      <div className="space-y-2">
        <h3 className="font-medium text-sm text-foreground/90 group-hover:text-primary transition-colors">
          {server.name}
        </h3>

        {server.description && (
          <div className="text-xs text-muted-foreground line-clamp-2 prose prose-sm dark:prose-invert max-w-none prose-p:m-0 prose-p:inline prose-strong:text-foreground prose-em:text-muted-foreground">
            <ReactMarkdown>
              {server.description}
            </ReactMarkdown>
          </div>
        )}

        {server.url && (
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
              <button
                onClick={handleCopyUrl}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors group/url cursor-pointer w-full min-w-0"
              >
                <span className="truncate min-w-0">{server.url}</span>
                {copied ? (
                  <Check className="h-3.5 w-3.5 flex-shrink-0 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5 flex-shrink-0 opacity-0 group-hover/url:opacity-100 transition-opacity" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs break-all">
              {server.url}
            </TooltipContent>
          </Tooltip>
        )}

        {server.createdAt && (
          <p className="text-xs text-muted-foreground">
            {new Date(server.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        )}
      </div>
    </div>
  );
}

export default function McpServersSection() {
  const [localLoading, setLocalLoading] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localServers, setLocalServers] = useState<McpServer[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLocalLoading(true);
      setLocalError(null);
      try {
        const params = new URLSearchParams();
        params.set("first", "16");
        params.set("public", "true");
        params.set("featured", "true");
        params.set("orderBy", "-createdAt");
        const res = await fetch(`/api/mcp?${params}`);
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Failed to load featured servers");
        if (!cancelled) {
          setLocalServers(Array.isArray(j.servers) ? j.servers : []);
        }
      } catch (e) {
        if (!cancelled) {
          setLocalError(e instanceof Error ? e.message : "Failed to load");
          setLocalServers([]);
        }
      } finally {
        if (!cancelled) setLocalLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      {!localError && (localLoading || localServers.length > 0) && (
        <section className="relative overflow-hidden p-0 sm:rounded-3xl sm:border sm:border-red-200/75 sm:bg-card/25 sm:p-8 dark:sm:border-red-400/25">
          <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <h2 className="flex items-center gap-2 text-2xl md:text-3xl font-bold tracking-tight">
                <Star className="h-5 w-5 text-yellow-500" />
                Featured on MCP Assistant
              </h2>
              <p className="text-sm md:text-base text-muted-foreground">
              Discover a curated selection of MCP servers you can access and test in Playground.
              </p>
            </div>
            <Link href="/mcp" className="group inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
              Open MCP
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          {localLoading && localServers.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 sm:gap-4">
              <ServerItemSkeleton />
              <ServerItemSkeleton />
              <ServerItemSkeleton />
              <ServerItemSkeleton />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 sm:gap-4">
              {localServers.map((server) => (
                <ServerCard key={server.id} server={server} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
