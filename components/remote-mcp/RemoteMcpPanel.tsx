"use client";

import { useEffect, useState } from "react";
import { Hammer, KeyRound, Activity, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectedClientsCard, type WorkflowOAuthGrantRow } from "./ConnectedClientsCard";
import { McpUsageOverview } from "@/components/mcp-usage/McpUsageOverview";
import type { McpToolCallEventRow, McpUsageConnectionLike } from "@/lib/mcp-usage";
import { getWorkflowOAuthIssuer } from "@/lib/workflow-oauth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface RemoteMcpPanelProps {
  data: {
    connections: (McpUsageConnectionLike & { active?: boolean })[];
    grants: WorkflowOAuthGrantRow[];
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
  initialTab = "activity",
}: RemoteMcpPanelProps) {
  const [oauthIssuer, setOauthIssuer] = useState<string>("");

  useEffect(() => {
    try {
      setOauthIssuer(getWorkflowOAuthIssuer());
    } catch {
      setOauthIssuer("https://api.mcp-assistant.in/oauth");
    }
  }, []);

  return (
    <div className="h-full flex flex-col bg-background select-none md:select-text">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted">
            <Hammer className="h-4 w-4 text-foreground" />
          </div>
          <h2 className="text-sm font-semibold text-foreground">Remote MCP Access</h2>
        </div>
      </div>

      {/* Tabs Layout */}
      <Tabs defaultValue={initialTab} className="flex-1 flex flex-col min-h-0">
        {/* Tab Selection Row */}
        <div className="flex-shrink-0 border-b border-border bg-background px-4 sm:px-6 py-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="activity" className="flex items-center gap-2 text-xs">
              <Activity className="h-3.5 w-3.5" />
              Activity
            </TabsTrigger>
            <TabsTrigger value="revoke" className="flex items-center gap-2 text-xs">
              <KeyRound className="h-3.5 w-3.5" />
              Revoke Access
            </TabsTrigger>
          </TabsList>
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
              {/* Tabbed Content Pages */}
              <TabsContent value="revoke" className="m-0 border-0 p-0 outline-none">
                <ConnectedClientsCard grants={data.grants} />
              </TabsContent>

              <TabsContent value="activity" className="m-0 border-0 p-0 outline-none">
                <McpUsageOverview
                  events={data.events}
                  connections={data.connections}
                  metricsEvents={data.metricsEvents}
                  totalCount={data.totalCount}
                  currentPage={data.currentPage || 1}
                  onPageChange={onPageChange}
                />
              </TabsContent>
            </div>
          ) : null}
        </div>
      </Tabs>
    </div>
  );
}
