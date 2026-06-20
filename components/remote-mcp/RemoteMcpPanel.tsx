"use client";

import { useEffect, useState } from "react";
import { Hammer, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectedClientsCard, type McpOAuthGrantRow } from "./ConnectedClientsCard";
import { McpUsageOverview } from "@/components/mcp-usage/McpUsageOverview";
import type { McpToolCallEventRow, McpUsageConnectionLike } from "@/lib/mcp-usage";
import { getMcpOAuthIssuer } from "@/lib/mcp-oauth";
import { ServerIcon } from "@/components/common/ServerIcon";
import { cn } from "@/lib/utils";

interface RemoteMcpPanelProps {
  data: {
    connections: (McpUsageConnectionLike & { active?: boolean })[];
    grants: McpOAuthGrantRow[];
    events: McpToolCallEventRow[];
    metricsEvents: McpToolCallEventRow[];
    totalCount: number;
    currentPage: number;
  } | null;
  loading: boolean;
  error: string | null;
  onPageChange: (page: number) => void;
  onClose: () => void;
  initialTab?: string;
}

export default function RemoteMcpPanel({
  data,
  loading,
  error,
  onPageChange,
  onClose,
  initialTab = "mcp-server",
}: RemoteMcpPanelProps) {
  const [oauthIssuer, setOauthIssuer] = useState<string>("");
  const [healthStatus, setHealthStatus] = useState<"loading" | "healthy" | "unhealthy">("loading");
  const [healthData, setHealthData] = useState<{
    version?: string;
    uptime_seconds?: number;
  } | null>(null);

  useEffect(() => {
    try {
      setOauthIssuer(getMcpOAuthIssuer());
    } catch {
      setOauthIssuer("https://api.mcp-assistant.in/oauth");
    }
  }, []);

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

  return (
    <div className="h-full flex flex-col bg-background select-none md:select-text">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
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
              {initialTab === "revoke" ? "Revoke Client Access" : "Remote MCP Activity"}
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-[10px] text-muted-foreground font-mono truncate leading-none">
                api.mcp-assistant.in/mcp
              </p>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[8px] text-muted-foreground/45">•</span>
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  healthStatus === "loading" ? "bg-muted-foreground/40 animate-pulse" :
                  healthStatus === "healthy" ? "bg-green-500 animate-pulse" :
                  "bg-destructive"
                )} />
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground leading-none">
                  {healthStatus === "loading" ? "checking..." :
                   healthStatus === "healthy" ? "online" :
                   "offline"}
                </span>
                {healthStatus === "healthy" && healthData && (
                  <>
                    <span className="text-[8px] text-muted-foreground/45">•</span>
                    <span className="text-[9px] text-muted-foreground leading-none">
                      v{healthData.version || "1.0.0"}
                    </span>
                    {healthData.uptime_seconds !== undefined && (
                      <>
                        <span className="text-[8px] text-muted-foreground/45">•</span>
                        <span className="text-[9px] text-muted-foreground leading-none" title={`Uptime: ${healthData.uptime_seconds} seconds`}>
                          up {formatUptime(healthData.uptime_seconds)}
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

      {/* Scrollable Contents */}
      <div className="flex-1 overflow-y-auto scrollbar-minimal">
        {loading && !data ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Loading details...</p>
          </div>
        ) : error ? (
          <div className="p-6 m-4 rounded-xl border border-destructive/20 bg-destructive/5 text-sm text-destructive">
            <h4 className="font-semibold mb-1">Could not load Remote MCP details</h4>
            <p className="text-xs text-muted-foreground mb-4">{error}</p>
            <Button variant="outline" size="sm" onClick={() => onPageChange(1)}>
              Retry
            </Button>
          </div>
        ) : data ? (
          <div className="px-4 sm:px-6 py-4 sm:py-6 space-y-6 w-full mx-auto">
            {initialTab === "revoke" ? (
              <ConnectedClientsCard grants={data.grants} />
            ) : (
              <McpUsageOverview
                events={data.events}
                connections={data.connections}
                metricsEvents={data.metricsEvents}
                totalCount={data.totalCount}
                currentPage={data.currentPage || 1}
                onPageChange={onPageChange}
                healthStatus={healthStatus}
                healthData={healthData}
              />
            )}
          </div>
        ) : null}
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

