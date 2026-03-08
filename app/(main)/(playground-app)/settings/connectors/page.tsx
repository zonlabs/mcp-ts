"use client";

import { useEffect, useState } from "react";
import { CheckCircle, XCircle, Clock, Trash2, Calendar } from "lucide-react";
import { ServerIcon } from "@/components/common/ServerIcon";
import { toast } from "react-hot-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
      const response = await fetch(`/api/mcp/disconnect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId }),
      });

      if (response.ok) {
        toast.success("Connection disconnected successfully");
        await loadConnections();
      } else {
        toast.error("Failed to disconnect connection");
      }
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
