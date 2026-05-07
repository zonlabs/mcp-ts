"use client";

import { useEffect, useState } from "react";
import { CheckCircle, XCircle, Clock, Calendar, CheckCircle2, Globe, HardDrive, Loader2, RefreshCw, Server, Info } from "lucide-react";
import { ServerIcon } from "@/components/common/ServerIcon";
import { useMcpStore } from "@/lib/stores/mcp-store";
import { useGatewaySelections } from "@/hooks/useGatewaySelections";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { selectionKey } from "@/lib/gateway-access";
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
  const { t, language } = useI18n();
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
    <div className="px-1 sm:px-3 md:px-6">
      <div className="max-w-5xl space-y-6 sm:space-y-8">
        <div className="mb-6">
          <h1 className="text-3xl font-instrument-serif font-medium mb-1">{t("connectors")}</h1>
          <p className="text-[15px] font-instrument-serif tracking-wide text-muted-foreground">
            {t("activeMcpServerConnections")}
          </p>
        </div>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-instrument-serif font-medium uppercase tracking-[0.16em] text-foreground">
                  {t("localMcpServers")}
                </h3>
                <Badge variant="outline">{t("local")}</Badge>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  <Info className="h-3 w-3" />
                  {t("installGateway")}
                  <code className="font-mono text-foreground">uvx mcpassistant-gateway</code>
                </span>
              </div>
              <p className="text-[15px] font-instrument-serif tracking-wide text-muted-foreground mt-1">
                {t("enableLocalMcpServers")}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary" className="gap-1">
              <Server className="w-3 h-3" />
              {detectedSelections.length} {t("detected")}
            </Badge>
            <Badge variant={enabledDetectedCount > 0 ? "default" : "outline"}>
              {enabledDetectedCount} {t("enabled")}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchGatewayServers()}
              disabled={loadingGatewayServers}
              className="h-7 px-2 gap-1.5"
            >
              {loadingGatewayServers ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {t("refresh")}
            </Button>
          </div>

          {gatewayLoadError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{gatewayLoadError}</p>
          ) : null}

          {loadingGatewayServers ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("detectingGatewayServers")}
            </div>
          ) : detectedSelections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("noGatewayServersDetected")}
            </p>
          ) : (
            <div className="grid gap-2 lg:grid-cols-2">
              {detectedSelections.map((selection) => {
                const key = selectionKey(selection);
                const enabled = enabledSelectionKeys.includes(key);
                const info = serverInfoMap[key];
                const toolCount = info?.tools_count ?? 0;

                return (
                  <label
                    key={key}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-xl border border-border/60 px-3 py-3 cursor-pointer transition-colors hover:border-border"
                  >
                    <ServerIcon
                      serverName={info?.title || selection.mcpServer}
                      serverUrl={selection.mcpServer}
                      size={36}
                      className="mt-0.5 rounded-lg shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[15px] font-instrument-serif tracking-wide font-medium break-all">
                          {info?.title || selection.mcpServer}
                        </p>
                        <Badge variant="outline" className="font-mono text-[10px]">{selection.agentId}</Badge>
                      </div>
                      {info?.title && info.title !== selection.mcpServer ? (
                        <p className="mt-1 text-xs text-muted-foreground break-all">
                          {selection.mcpServer}
                        </p>
                      ) : null}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {info?.status === "connected" ? (
                          <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                            <CheckCircle2 className="w-3 h-3" />
                            {t("connected")}
                          </span>
                        ) : info?.status === "error" ? (
                          <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                            <XCircle className="w-3 h-3" />
                            {info.instructions || t("error")}
                          </span>
                        ) : null}
                        <span>{toolCount} {t("tools")}</span>
                      </div>
                    </div>
                    <Checkbox
                      checked={enabled}
                      onCheckedChange={(checked) => {
                        const next = checked
                          ? Array.from(new Set([...enabledSelectionKeys, key]))
                          : enabledSelectionKeys.filter((value) => value !== key);
                        persistSelections(next);
                      }}
                      className="mt-0.5 shrink-0"
                    />
                  </label>
                );
              })}
            </div>
          )}
        </section>

        {loading ? (
          <section className="space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-instrument-serif font-medium uppercase tracking-[0.16em] text-foreground">{t("remoteMcpConnections")}</h3>
                <Badge variant="outline">{t("remote")}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t("authenticatedRemoteConnections")}
              </p>
            </div>
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <Clock className="w-8 h-8 text-muted-foreground animate-spin" />
                <p className="text-sm text-muted-foreground">{t("loadingConnections")}</p>
              </div>
            </div>
          </section>
        ) : connections.length === 0 ? (
          <section className="space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-instrument-serif font-medium uppercase tracking-[0.16em] text-foreground">{t("remoteMcpConnections")}</h3>
                <Badge variant="outline">{t("remote")}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t("authenticatedRemoteConnections")}
              </p>
            </div>
            <div className="text-center py-12">
              <p className="text-muted-foreground">{t("noActiveRemoteConnections")}</p>
            </div>
          </section>
        ) : (
          <section className="space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-instrument-serif font-medium uppercase tracking-[0.16em] text-foreground">{t("remoteMcpConnections")}</h3>
                <Badge variant="outline">{t("remote")}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t("authenticatedRemoteConnections")}
              </p>
            </div>

            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr))]">
              {connections.map((conn) => (
                <div
                  key={conn.sessionId}
                  className="flex h-full flex-col gap-4 rounded-xl border border-border/60 px-3 py-3 sm:rounded-2xl sm:px-4 sm:py-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <ServerIcon
                        serverName={getServerName(conn.serverUrl)}
                        serverUrl={conn.serverUrl}
                        size={40}
                        className="rounded-xl"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium text-sm truncate">
                            {getServerName(conn.serverUrl)}
                          </h3>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 break-words">
                          {getShortenedUrl(conn.serverUrl)}
                        </p>
                      </div>
                    </div>

                    <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start sm:pl-2">
                      {getStatusIcon(conn.connectionStatus)}
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-xs font-medium ${getStatusColor(conn.connectionStatus)}`}>
                          {conn.connectionStatus}
                        </span>
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => handleDisconnect(conn.sessionId)}
                          disabled={disconnecting === conn.sessionId}
                          className="h-7 border-border/70 px-2 text-xs text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                        >
                          {disconnecting === conn.sessionId ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : null}
                          {t("disconnect")}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-start gap-1.5">
                      <span className="text-muted-foreground/70 whitespace-nowrap">{t("sessionId")}:</span>
                      <code className="font-mono text-[11px] break-all">{conn.sessionId}</code>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <Calendar className="w-3 h-3 text-muted-foreground/70 mt-0.5" />
                      <span className="text-muted-foreground/70 whitespace-nowrap">{t("connectedAt")}:</span>
                      <span className="break-words">
                        {new Date(conn.createdAt).toLocaleString(language, {
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
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
