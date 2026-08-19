"use client";

import { useEffect, useState } from "react";
import { CheckCircle, XCircle, Clock, Loader2, RefreshCw } from "lucide-react";
import { useMcpStore } from "@/lib/stores/mcp-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/web-i18n";

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
  const { t } = useI18n();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const disconnect = useMcpStore((state) => state.disconnect);

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
      setConnections((currentConnections) =>
        currentConnections.filter((connection) => connection.sessionId !== sessionId)
      );
    } catch (error) {
      console.error("Failed to disconnect:", error);
    } finally {
      setDisconnecting(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "CONNECTED":
        return <CheckCircle className="size-3.5 text-emerald-400" />;
      case "DISCONNECTED":
        return <XCircle className="size-3.5 text-destructive" />;
      default:
        return <Clock className="size-3.5 text-amber-400" />;
    }
  };

  return (
    <div className="w-full max-w-3xl px-6 py-8 space-y-7 animate-in fade-in duration-200">
      {/* Header */}
      <div className="pb-4 border-b border-border flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">{t("connectors")}</h1>
          <p className="text-xs text-muted-foreground">
            {t("connectorsDescription")}
          </p>
        </div>

        <Button
          onClick={loadConnections}
          variant="outline"
          size="sm"
          disabled={loading}
          className="h-8 px-3 text-xs gap-1.5 border-border bg-card"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>{t("refresh")}</span>
        </Button>
      </div>

      <div className="space-y-6">
        {/* Section 1: Active MCP Sessions */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-foreground">{t("activeSessions")}</h2>
            <Badge variant="outline" className="h-5 text-[10px] border-border bg-card font-mono">
              {connections.length} {t("sessions")}
            </Badge>
          </div>

          {loading ? (
            <div className="bg-card border border-border rounded-md p-5 text-center text-xs text-muted-foreground">
              Loading active connections...
            </div>
          ) : connections.length === 0 ? (
            <div className="bg-card border border-border rounded-md p-5 text-center text-xs text-muted-foreground">
              {t("noActiveSessions")}
            </div>
          ) : (
            <div className="space-y-2">
              {connections.map((conn) => (
                <div
                  key={conn.sessionId}
                  className="bg-card border border-border rounded-md p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(conn.connectionStatus)}
                      <span className="text-xs font-semibold text-foreground truncate font-mono">
                        {conn.serverUrl}
                      </span>
                      <Badge variant="outline" className="h-5 text-[10px] uppercase font-mono">
                        {conn.transport}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">
                      Session ID: {conn.sessionId}
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDisconnect(conn.sessionId)}
                    disabled={disconnecting === conn.sessionId}
                    className="h-7 px-2.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-border self-start sm:self-auto"
                  >
                    {disconnecting === conn.sessionId ? (
                      <Loader2 className="size-3 animate-spin mr-1" />
                    ) : null}
                    Disconnect
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
