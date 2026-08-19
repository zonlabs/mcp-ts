"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Copy, Check, Hammer, Star, ArrowRight } from "lucide-react";
import { toast } from "react-hot-toast";
import { McpServer } from "@/types/mcp";
import { UserSession } from "@/components/providers/AuthProvider";
import { ServerIcon } from "@/components/common/ServerIcon";
import { McpUsageOverview } from "@/components/mcp-usage/McpUsageOverview";
import { useMcpUsage } from "@/hooks/useMcpUsage";
import { usePublicServers } from "@/hooks/usePublicServers";
import { cn } from "@/lib/utils";

const MCP_ASSISTANT_URL = "https://api.mcp-assistant.in/mcp";
const MCP_CLIENT_ICONS = [
  {
    name: "VS Code",
    url: "https://code.visualstudio.com",
    fallbackImage: "https://api.iconify.design/logos:visual-studio-code.svg",
  },
  {
    name: "Cursor",
    url: "https://cursor.com",
    fallbackImage: "https://registry.npmmirror.com/@lobehub/icons-static-png/latest/files/light/cursor.png",
  },
  {
    name: "ChatGPT",
    url: "https://chatgpt.com",
    fallbackImage: "https://api.iconify.design/simple-icons:openai.svg",
  },
  {
    name: "Notion",
    url: "https://www.notion.so",
    fallbackImage: "https://api.iconify.design/logos:notion-icon.svg",
  },
] as const;

interface HomeViewProps {
  initialUsageData?: any;
  userSession: UserSession | null;
  onSelectApp: (server: McpServer) => void;
  onNavigateToApps: () => void;
  onAction: (server: McpServer, action: "activate" | "deactivate") => Promise<unknown>;
}

export function HomeView({
  initialUsageData = null,
  userSession,
  onSelectApp,
  onNavigateToApps,
}: HomeViewProps) {
  const [page, setPage] = useState(1);
  const [urlCopied, setUrlCopied] = useState(false);
  const { data: usageData, isFetching } = useMcpUsage(page, initialUsageData);

  const [healthStatus, setHealthStatus] = useState<"loading" | "healthy" | "unhealthy">("loading");
  const [healthData, setHealthData] = useState<{
    version?: string;
    uptime_seconds?: number;
  } | null>(null);

  useEffect(() => {
    let active = true;
    async function checkHealth() {
      try {
        const res = await fetch("https://api.mcp-assistant.in/healthz");
        if (res.ok) {
          const json = await res.json().catch(() => ({}));
          if (active) {
            setHealthStatus("healthy");
            setHealthData(json);
          }
        } else {
          if (active) setHealthStatus("unhealthy");
        }
      } catch {
        if (active) setHealthStatus("unhealthy");
      }
    }
    void checkHealth();
    return () => {
      active = false;
    };
  }, []);

  // Fetch featured servers first, falling back to public servers
  const { servers: featuredServers } = usePublicServers({ pageSize: 8, featured: true });
  const { servers: fallbackServers } = usePublicServers({ pageSize: 8 });

  const userDisplayName =
    userSession?.user?.user_metadata?.full_name ||
    userSession?.user?.email ||
    "Developer";

  // Show featured servers if available, else first 8 public servers
  const popularServers = useMemo(() => {
    if (featuredServers.length > 0) return featuredServers.slice(0, 8);
    return fallbackServers.filter((s) => s.isPublic !== false).slice(0, 8);
  }, [featuredServers, fallbackServers]);

  const totalToolCalls = usageData?.totalCount ?? 0;
  const metricsEvents = usageData?.metricsEvents ?? [];
  const groups = usageData?.groups ?? [];

  const handleCopyAssistantUrl = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(MCP_ASSISTANT_URL);
      setUrlCopied(true);
      toast.success("Copied MCP endpoint");
      window.setTimeout(() => setUrlCopied(false), 1600);
    } catch {
      toast.error("Could not copy MCP endpoint");
    }
  };

  const formatDescription = (description?: string | null) => {
    if (!description) return null;
    return description
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background text-foreground scrollbar-minimal w-full">
      <div className="p-6 sm:p-8 space-y-8 max-w-6xl mx-auto w-full">
        {/* 1. Welcome Header */}
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-foreground font-sans">
            Welcome Back, <span>{userDisplayName}</span>
          </h1>
          <p className="text-xs text-muted-foreground font-mono">
            Track server activity and tool usage
          </p>
        </div>

        {/* API Health & Endpoint */}
        <div className="flex items-center gap-2 rounded-sm border border-hairline bg-card px-3 py-2.5 w-fit">
          <span className={cn(
            "w-1.5 h-1.5 rounded-full",
            healthStatus === "loading" ? "bg-muted-foreground/40 animate-pulse" :
            healthStatus === "healthy" ? "bg-green-500 animate-pulse" :
            "bg-destructive"
          )} />
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground leading-none">
            {healthStatus === "loading" ? "checking..." :
             healthStatus === "healthy" ? "online" :
             "offline"}
          </span>
          {healthStatus === "healthy" && healthData && (
            <>
              <span className="text-[10px] text-muted-foreground/45">•</span>
              <span className="text-xs text-muted-foreground leading-none">
                v{healthData.version || "1.0.0"}
              </span>
              {healthData.uptime_seconds !== undefined && (
                <>
                  <span className="text-[10px] text-muted-foreground/45">•</span>
                  <span className="text-xs text-muted-foreground leading-none">
                    uptime {formatUptime(healthData.uptime_seconds)}
                  </span>
                </>
              )}
            </>
          )}
          <span className="mx-1 h-3.5 w-px bg-hairline" />
          <a
            href={MCP_ASSISTANT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-muted-foreground hover:text-foreground hover:underline transition-colors leading-none"
            title={MCP_ASSISTANT_URL}
          >
            api.mcp-assistant.in/mcp
          </a>
        </div>

      {/* 2. Full Activity Heatmap, Metrics & Recent Activity */}
      <McpUsageOverview
        groups={groups}
        metricsEvents={metricsEvents}
        totalCount={totalToolCalls}
        currentPage={page}
        onPageChange={setPage}
        isFetching={isFetching}
      />

      {/* 3. Standalone MCP Server Card */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Hammer className="size-3.5 text-muted-foreground" />
          <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold">
            Standalone MCP
          </h2>
        </div>

        <div className="bg-card border border-border rounded-md p-5 space-y-4">
          {/* Header Row: Icon, Title, and Compatible Client Icons */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-9 shrink-0 flex items-center justify-center rounded-sm bg-background border border-border p-1">
                <ServerIcon
                  serverName="MCP Assistant"
                  serverUrl={MCP_ASSISTANT_URL}
                  size={32}
                />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">MCP Assistant</h3>
                <p className="text-[11px] font-mono text-muted-foreground">Universal MCP Hub & Sandbox</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {MCP_CLIENT_ICONS.map((client) => (
                <div
                  key={client.name}
                  className="size-7 flex items-center justify-center rounded-sm border border-border/80 bg-background"
                  title={client.name}
                >
                  <img
                    src={client.fallbackImage}
                    alt={`${client.name} icon`}
                    width={15}
                    height={15}
                    className={`rounded-xs ${client.name === "Cursor" || client.name === "ChatGPT" ? "dark:invert" : ""}`}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Description */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            Access 100+ MCP servers (GitHub, Notion, Zapier, Supabase, etc.) via dynamic discovery meta-tools and a secure CodeMode sandbox for programmatic tool calling.
          </p>

          {/* Copyable URL Bar */}
          <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-background px-3 py-2">
            <code className="text-xs font-mono text-muted-foreground truncate">
              {MCP_ASSISTANT_URL}
            </code>
            <button
              type="button"
              onClick={handleCopyAssistantUrl}
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-xs text-muted-foreground hover:text-foreground hover:bg-card transition-colors cursor-pointer"
              title="Copy endpoint"
            >
              {urlCopied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* 4. Popular Connectors & Apps Section */}
      {popularServers.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Star className="size-4 fill-amber-400 text-amber-400" />
                <h2 className="text-base font-semibold text-foreground">
                  Popular Connectors & Apps
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Featured connectors and apps available in MCP Assistant.
              </p>
            </div>

            <button
              onClick={onNavigateToApps}
              className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <span>See All Apps</span>
              <ArrowRight className="size-3" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {popularServers.map((server) => {
              const desc = formatDescription(server.description);
              return (
                <div
                  key={server.id}
                  onClick={() => onSelectApp(server)}
                  className="group bg-card hover:bg-card/90 border border-border hover:border-body-strong/40 rounded-md p-4 flex items-start gap-3.5 cursor-pointer transition-all duration-150"
                >
                  <div className="size-9 shrink-0 flex items-center justify-center rounded-sm bg-background border border-border p-1">
                    <ServerIcon
                      serverName={server.name}
                      serverUrl={server.url}
                      size={28}
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {server.name}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {desc || "Production-ready MCP server integration."}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return `${hours}h ${remainingMinutes}m`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h`;
}
