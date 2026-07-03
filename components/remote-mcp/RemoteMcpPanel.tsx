"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConnectedClientsCard } from "./ConnectedClientsCard";
import { McpUsageOverview } from "@/components/mcp-usage/McpUsageOverview";
import ToolPolicyView from "./ToolPolicyView";
import { ServerIcon } from "@/components/common/ServerIcon";
import { cn } from "@/lib/utils";
import { useMcpUsage } from "@/hooks/useMcpUsage";

interface RemoteMcpPanelProps {
  onClose?: () => void;
  initialTab?: string;
}

export default function RemoteMcpPanel({
  initialTab = "mcp-server",
}: RemoteMcpPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [page, setPage] = useState(1);
  const { data, isLoading, error, isFetching } = useMcpUsage(page);
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
          if (active) {
            setHealthStatus("unhealthy");
          }
        }
      } catch {
        if (active) {
          setHealthStatus("unhealthy");
        }
      }
    }
    void checkHealth();
    return () => {
      active = false;
    };
  }, []);

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="h-full flex flex-col bg-background select-none md:select-text">
      {/* Header */}
      <div className="flex-shrink-0 px-4 sm:px-6 py-4 flex items-center justify-between gap-3 border-b border-border/40">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center">
            <ServerIcon
              serverName="MCP Assistant"
              serverUrl="https://api.mcp-assistant.in/mcp"
              size={36}
              className="rounded-lg"
            />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">
              MCP Assistant
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-xs text-muted-foreground font-mono truncate leading-none">
                api.mcp-assistant.in/mcp
              </p>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] text-muted-foreground/45">•</span>
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
                        <span className="text-xs text-muted-foreground leading-none" title={`Uptime: ${healthData.uptime_seconds} seconds`}>
                          uptime {formatUptime(healthData.uptime_seconds)}
                        </span>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Tabs Navigation */}
      <div className="flex-shrink-0 px-4 sm:px-6 py-2 border-b border-border/40 bg-muted/10">
        <Tabs value={initialTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="bg-transparent h-9 p-0 gap-6">
            <TabsTrigger
              value="mcp-server"
              className="border-x-0 border-t-0 border-b-2 border-transparent data-[state=active]:border-red-500 rounded-none h-9 px-0 text-xs font-semibold tracking-wide text-muted-foreground data-[state=active]:text-foreground data-[state=active]:bg-transparent dark:data-[state=active]:bg-transparent data-[state=active]:shadow-none cursor-pointer"
            >
              Activity
            </TabsTrigger>
            <TabsTrigger
              value="tool-policy"
              className="border-x-0 border-t-0 border-b-2 border-transparent data-[state=active]:border-red-500 rounded-none h-9 px-0 text-xs font-semibold tracking-wide text-muted-foreground data-[state=active]:text-foreground data-[state=active]:bg-transparent dark:data-[state=active]:bg-transparent data-[state=active]:shadow-none cursor-pointer"
            >
              Tool Policy
            </TabsTrigger>
            <TabsTrigger
              value="revoke"
              className="border-x-0 border-t-0 border-b-2 border-transparent data-[state=active]:border-red-500 rounded-none h-9 px-0 text-xs font-semibold tracking-wide text-muted-foreground data-[state=active]:text-foreground data-[state=active]:bg-transparent dark:data-[state=active]:bg-transparent data-[state=active]:shadow-none cursor-pointer"
            >
              Authorized Apps
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Scrollable Contents */}
      <div className="flex-1 overflow-y-auto scrollbar-minimal">
        {isLoading ? (
          <div className="px-4 sm:px-6 pt-3 pb-6 sm:pt-4 sm:pb-8 space-y-6 w-full mx-auto animate-pulse">
            <div className="space-y-4">
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-[120px] bg-muted rounded-lg" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="h-16 bg-muted rounded-lg" />
                <div className="h-16 bg-muted rounded-lg" />
                <div className="h-16 bg-muted rounded-lg" />
                <div className="h-16 bg-muted rounded-lg" />
              </div>
            </div>
            <div className="space-y-3 pt-4">
              <div className="h-4 w-32 bg-muted rounded" />
              <div className="space-y-2">
                <div className="h-12 bg-muted rounded-lg" />
                <div className="h-12 bg-muted rounded-lg" />
                <div className="h-12 bg-muted rounded-lg" />
              </div>
            </div>
          </div>
        ) : error ? (
          <div className="p-6 m-4 rounded-xl border border-destructive/20 bg-destructive/5 text-sm text-destructive">
            <h4 className="font-semibold mb-1">Could not load Remote MCP details</h4>
            <p className="text-xs text-muted-foreground mb-4">{error.message}</p>
            <Button variant="outline" size="sm" onClick={() => setPage(1)}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="px-4 sm:px-6 pt-3 pb-6 sm:pt-4 sm:pb-8 space-y-6 w-full mx-auto">
            {initialTab === "tool-policy" ? (
              <ToolPolicyView />
            ) : initialTab === "revoke" ? (
              data && <ConnectedClientsCard grants={data.grants} />
            ) : (
              data && (
                <McpUsageOverview
                  groups={data.groups}
                  metricsEvents={data.metricsEvents}
                  totalCount={data.totalCount}
                  currentPage={data.currentPage || 1}
                  onPageChange={setPage}
                  isFetching={isFetching}
                  healthStatus={healthStatus}
                  healthData={healthData}
                />
              )
            )}
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

