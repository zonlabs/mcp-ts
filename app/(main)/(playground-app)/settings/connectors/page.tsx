"use client";

import { useEffect, useState } from "react";
import { CheckCircle, XCircle, Clock, Trash2, Calendar, CheckCircle2, Loader2, RefreshCw, Server } from "lucide-react";
import { ServerIcon } from "@/components/common/ServerIcon";
import { toast } from "react-hot-toast";
import { useMcpStore } from "@/lib/stores/mcp-store";
import { useGatewaySelections } from "@/hooks/useGatewaySelections";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { selectionKey } from "@/lib/gateway-access";

interface Connection {
  sessionId: string;
  serverUrl: string;
  callbackUrl?: string;
  transport: string;
  active: boolean;
  connectionStatus: string;
  createdAt: string;
  tokenExpiresAt?: string | null;
  clientInformation?: any;
}

export default function ConnectorsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const disconnect = useMcpStore((state) => state.disconnect);
  const {
    detectedSelections,
    enabledSelectionKeys,
    enabledDetectedCount,
    loadingGatewayServers,
    serverInfoMap,
    gatewayLoadError,
    persistSelections,
    fetchGatewayServers,
  } = useGatewaySelections();

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/mcp/connections");

      if (response.ok) {
        const data = await response.json();
        setConnections(data.connections || []);
      } else {
        console.error("Failed to load connections");
        setConnections([]);
      }
    } catch (error) {
      console.error("Failed to load connections:", error);
      setConnections([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async (sessionId: string) => {
    setDisconnecting(sessionId);
    try {
      await disconnect(sessionId);
      toast.success("Connection disconnected successfully");
      await loadConnections();
    } catch (error) {
      console.error("Failed to disconnect:", error);
      toast.error("Failed to disconnect connection");
    } finally {
      setDisconnecting(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "CONNECTED":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "DISCONNECTED":
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "CONNECTED":
        return "text-green-600 dark:text-green-400";
      case "DISCONNECTED":
        return "text-red-600 dark:text-red-400";
      default:
        return "text-yellow-600 dark:text-yellow-400";
    }
  };

  const getServerName = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return url;
    }
  };

  const getShortenedUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      if (path.length > 30) {
        return `${urlObj.hostname}${path.slice(0, 27)}...`;
      }
      return `${urlObj.hostname}${path}`;
    } catch {
      return url.length > 40 ? `${url.slice(0, 37)}...` : url;
    }
  };

  return (
    <div className="px-1 md:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-1">Connectors</h1>
        <p className="text-sm text-muted-foreground">
          Active MCP server connections
        </p>
      </div>

      <section className="space-y-4 mb-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">
              Local MCP Access For Playground
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Enable local gateway servers to let the agent execute their MCP tools.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchGatewayServers()}
            disabled={loadingGatewayServers}
            className="h-8 gap-2"
          >
            {loadingGatewayServers ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary" className="gap-1">
            <Server className="w-3 h-3" />
            {detectedSelections.length} detected
          </Badge>
          <Badge variant={enabledDetectedCount > 0 ? "default" : "outline"}>
            {enabledDetectedCount} enabled
          </Badge>
        </div>

        {gatewayLoadError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{gatewayLoadError}</p>
        ) : null}

        {loadingGatewayServers ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Detecting gateway MCP servers...
          </div>
        ) : detectedSelections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No gateway MCP servers detected. Start your local gateway and refresh.
          </p>
        ) : (
          <div className="space-y-2">
            {detectedSelections.map((selection) => {
              const key = selectionKey(selection);
              const enabled = enabledSelectionKeys.includes(key);
              const info = serverInfoMap[key];
              const toolCount = info?.tools_count ?? 0;

              return (
                <label
                  key={key}
                  className="flex items-start gap-3 rounded-md border border-border/60 px-3 py-2.5 cursor-pointer hover:bg-accent/20"
                >
                  <Checkbox
                    checked={enabled}
                    onCheckedChange={(checked) => {
                      const next = checked
                        ? Array.from(new Set([...enabledSelectionKeys, key]))
                        : enabledSelectionKeys.filter((value) => value !== key);
                      persistSelections(next);
                    }}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium break-all">{selection.mcpServer}</p>
                      <Badge variant="outline" className="font-mono text-[10px]">{selection.agentId}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {info?.status === "connected" ? (
                        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                          <CheckCircle2 className="w-3 h-3" />
                          Connected
                        </span>
                      ) : info?.status === "error" ? (
                        <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                          <XCircle className="w-3 h-3" />
                          {info.instructions || "Error"}
                        </span>
                      ) : null}
                      <span>{toolCount} tools</span>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </section>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <Clock className="w-8 h-8 text-muted-foreground animate-spin" />
            <p className="text-sm text-muted-foreground">Loading connections...</p>
          </div>
        </div>
      ) : connections.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No active connections found</p>
        </div>
      ) : (
        <TooltipProvider>
          <div className="space-y-2">
            {connections.map((conn) => (
              <div
                key={conn.sessionId}
                className="flex flex-col sm:flex-row sm:items-start gap-3 p-3 rounded-md border border-border/50 bg-card/40 w-full"
              >
                {/* Server Icon */}
                <div className="flex-shrink-0">
                  <ServerIcon
                    serverName={getServerName(conn.serverUrl)}
                    serverUrl={conn.serverUrl}
                    size={36}
                    className="rounded-lg"
                  />
                </div>

                {/* Server Details */}
                <div className="min-w-0">
                  <h3 className="font-medium text-sm truncate">
                    {getServerName(conn.serverUrl)}
                  </h3>
                  <p className="text-xs text-muted-foreground mb-1.5">
                    {getShortenedUrl(conn.serverUrl)}
                  </p>
                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground/70">Session ID:</span>
                      <code className="font-mono text-[11px]">{conn.sessionId}</code>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 text-muted-foreground/70" />
                      <span className="text-muted-foreground/70">Connected At:</span>
                      <span>
                        {new Date(conn.createdAt).toLocaleString('en-IN', {
                          timeZone: 'Asia/Kolkata',
                          year: 'numeric',
                          month: 'short',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: false,
                        })}
                      </span>

                    </div>
                  </div>
                </div>

                {/* Status and Actions */}
                <div className="flex items-center gap-2 flex-shrink-0 sm:ml-auto">
                  {getStatusIcon(conn.connectionStatus)}
                  <span className={`text-xs font-medium ${getStatusColor(conn.connectionStatus)}`}>
                    {conn.connectionStatus}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleDisconnect(conn.sessionId)}
                        disabled={disconnecting === conn.sessionId}
                        className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {disconnecting === conn.sessionId ? (
                          <Clock className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Disconnect</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}
