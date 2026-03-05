"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { Check, ChevronDown, ChevronRight, Copy, KeyRound, Loader2, RefreshCw, Settings2, ShieldBan } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const REMOTE_PROXY_BASE_URL = "https://hub.linkos.in/agent";

interface RemoteAgent {
  agent_id?: string;
  capabilities?: string[];
}

interface ServerInfo {
  status: "connected" | "error";
  agent_id: string;
  mcp_server: string;
  title: string;
  version: string;
  instructions: string;
  tools_count: number;
  tools: Array<{ name?: string; description?: string }>;
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function invokeUrl(agentId: string, mcpServer: string): string {
  return `${normalizeBaseUrl(REMOTE_PROXY_BASE_URL)}/${agentId}/${mcpServer}/mcp`;
}

export default function GatewayPage() {
  const [expiryMinutes, setExpiryMinutes] = useState("60");
  const [issuedToken, setIssuedToken] = useState("");
  const [issuedSubject, setIssuedSubject] = useState("");
  const [revokeToken, setRevokeToken] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [remoteProxyStatus, setRemoteProxyStatus] = useState<"checking" | "ok" | "down">("checking");

  const [agents, setAgents] = useState<RemoteAgent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [loadingAllInfo, setLoadingAllInfo] = useState(false);
  const [serverInfoMap, setServerInfoMap] = useState<Record<string, ServerInfo>>({});
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const lastAgentsSignatureRef = useRef<string>("");

  const totalCapabilities = useMemo(
    () =>
      agents.reduce((sum, agent) => {
        const caps = Array.isArray(agent.capabilities) ? agent.capabilities.length : 0;
        return sum + caps;
      }, 0),
    [agents]
  );
  const localAgentConnected = agents.length > 0;

  const copyText = async (value: string, label: string, key?: string) => {
    try {
      await navigator.clipboard.writeText(value);
      if (key) {
        setCopiedKey(key);
        setTimeout(() => {
          setCopiedKey((prev) => (prev === key ? null : prev));
        }, 1200);
      }
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  };

  const inspectAllServers = useCallback(async (agentsData: RemoteAgent[]) => {
    const pairs: Array<{ agentId: string; mcpServer: string; key: string }> = [];
    for (const agent of agentsData) {
      const agentId = String(agent.agent_id || "");
      const capabilities = Array.isArray(agent.capabilities) ? agent.capabilities : [];
      for (const mcpServer of capabilities) {
        pairs.push({ agentId, mcpServer, key: `${agentId}::${mcpServer}` });
      }
    }

    if (pairs.length === 0) {
      setServerInfoMap({});
      return;
    }

    setLoadingAllInfo(true);
    try {
      const results = await Promise.all(
        pairs.map(async ({ agentId, mcpServer, key }) => {
          try {
            const response = await fetch("/api/remote-bridge", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "server-info",
                agentId,
                mcpServer,
              }),
            });
            const data = await response.json();
            if (!response.ok) {
              throw new Error(data?.error || "Failed to inspect server");
            }
            return [key, data.data as ServerInfo] as const;
          } catch (error) {
            return [
              key,
              {
                status: "error",
                agent_id: agentId,
                mcp_server: mcpServer,
                title: "",
                version: "",
                instructions: error instanceof Error ? error.message : "Failed to inspect server",
                tools_count: 0,
                tools: [],
              } as ServerInfo,
            ] as const;
          }
        })
      );

      const nextMap: Record<string, ServerInfo> = {};
      for (const [key, value] of results) {
        nextMap[key] = value;
      }
      setServerInfoMap(nextMap);
      setExpandedTools({});
    } finally {
      setLoadingAllInfo(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoadingAgents(true);
    try {
      const response = await fetch("/api/remote-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "agents" }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to fetch agents");
      }

      const agentsData = Array.isArray(data?.agents) ? (data.agents as RemoteAgent[]) : [];
      setAgents(agentsData);
      await inspectAllServers(agentsData);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to refresh");
      setAgents([]);
      setServerInfoMap({});
    } finally {
      setLoadingAgents(false);
    }
  }, [inspectAllServers]);

  const applyAgentsUpdate = useCallback(
    (agentsData: RemoteAgent[]) => {
      const signature = JSON.stringify(
        (agentsData || []).map((agent) => ({
          agent_id: String(agent.agent_id || ""),
          capabilities: Array.isArray(agent.capabilities) ? [...agent.capabilities].sort() : [],
        }))
      );
      if (signature === lastAgentsSignatureRef.current) {
        return;
      }
      lastAgentsSignatureRef.current = signature;
      setAgents(agentsData);
      void inspectAllServers(agentsData);
    },
    [inspectAllServers]
  );

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const eventSource = new EventSource("/api/remote-bridge/stream");
    setRemoteProxyStatus("checking");

    eventSource.onopen = () => {
      setRemoteProxyStatus("ok");
    };

    eventSource.onerror = () => {
      setRemoteProxyStatus("down");
    };

    const handleAgentsEvent = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as { agents?: RemoteAgent[] };
        const nextAgents = Array.isArray(payload?.agents) ? payload.agents : [];
        applyAgentsUpdate(nextAgents);
      } catch {
        // Ignore malformed events and keep stream alive.
      }
    };

    eventSource.addEventListener("agents_snapshot", handleAgentsEvent as EventListener);
    eventSource.addEventListener("agents_updated", handleAgentsEvent as EventListener);

    return () => {
      eventSource.onopen = null;
      eventSource.onerror = null;
      eventSource.removeEventListener("agents_snapshot", handleAgentsEvent as EventListener);
      eventSource.removeEventListener("agents_updated", handleAgentsEvent as EventListener);
      eventSource.close();
    };
  }, [applyAgentsUpdate]);

  const issueToken = async () => {
    setIssuing(true);
    try {
      const response = await fetch("/api/remote-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "issue-token", expiryMinutes: Number(expiryMinutes) || 60 }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to issue token");
      }

      const token = String(data?.data?.token || "");
      const subject = String(data?.data?.subject || "");

      setIssuedToken(token);
      setIssuedSubject(subject);
      setRevokeToken(token);
      toast.success("JWT generated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to issue token");
    } finally {
      setIssuing(false);
    }
  };

  const revokeIssuedToken = async () => {
    const token = revokeToken.trim();
    if (!token) {
      toast.error("Token is required for revoke");
      return;
    }
    setRevoking(true);
    try {
      const response = await fetch("/api/remote-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "revoke-token",
          token,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to revoke token");
      }
      if (issuedToken === token) {
        setIssuedToken("");
      }
      setRevokeToken("");
      toast.success("Token revoked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to revoke token");
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      <main className="mx-auto max-w-6xl p-5 lg:p-6">
        <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">Gateway</h1>
            <p className="mt-1 text-xs text-muted-foreground">Generate JWT and inspect connected agents.</p>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{agents.length} agents</span>
              <span>|</span>
              <span>{totalCapabilities} servers</span>
              <span>|</span>
              <span className="inline-flex items-center gap-1">
                <span
                  className={
                    remoteProxyStatus === "ok"
                      ? "h-1.5 w-1.5 rounded-full bg-emerald-500"
                      : remoteProxyStatus === "down"
                        ? "h-1.5 w-1.5 rounded-full bg-red-500"
                        : "h-1.5 w-1.5 rounded-full bg-amber-500"
                  }
                />
                Remote Proxy: {remoteProxyStatus === "ok" ? "ok" : remoteProxyStatus === "down" ? "down" : "checking"}
              </span>
              <span>|</span>
              <span className="inline-flex items-center gap-1">
                <span className={localAgentConnected ? "h-1.5 w-1.5 rounded-full bg-emerald-500" : "h-1.5 w-1.5 rounded-full bg-red-500"} />
                Local Agent: {localAgentConnected ? "connected" : "disconnected"}
              </span>
            </div>
          </div>

          <div className="w-full lg:w-[420px] lg:max-w-[420px]">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button onClick={issueToken} disabled={issuing} className="h-9 gap-2 bg-emerald-600 text-white hover:bg-emerald-500">
                {issuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Generate JWT
              </Button>
              <Button variant="outline" onClick={() => setSettingsOpen((v) => !v)} className="h-9 gap-2">
                <Settings2 className="h-4 w-4" />
                Settings
              </Button>
              <Button onClick={refreshAll} disabled={loadingAgents || loadingAllInfo} variant="outline" className="h-9 gap-2">
                {loadingAgents || loadingAllInfo ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </Button>
            </div>

            {settingsOpen ? (
              <div className="mt-3 rounded-xl bg-muted/30 p-4">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Expiry (minutes)</p>
                    <Input
                      value={expiryMinutes}
                      onChange={(e) => setExpiryMinutes(e.target.value)}
                      placeholder="Expiry minutes (1-1440)"
                      type="number"
                      min={1}
                      max={1440}
                      className="h-10 bg-background/70"
                    />
                    <p className="text-xs text-muted-foreground">Used for next generated token.</p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Revoke token</p>
                    <Input
                      value={revokeToken}
                      onChange={(e) => setRevokeToken(e.target.value)}
                      placeholder="Paste token"
                      className="h-10 bg-background/70 font-mono text-xs"
                    />
                    <Button variant="destructive" onClick={revokeIssuedToken} disabled={revoking} className="h-10 w-full gap-2">
                      {revoking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldBan className="h-4 w-4" />}
                      Revoke token
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {issuedToken ? (
              <div className="mt-3 rounded-xl bg-muted/20 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Latest token</p>
                  <Button variant="ghost" size="sm" onClick={() => copyText(issuedToken, "Token", "token")} className="h-7 gap-1 px-2">
                    {copiedKey === "token" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    Copy
                  </Button>
                </div>
                <p className="mb-1 text-xs text-muted-foreground">Agent: <span className="font-mono">{issuedSubject || "-"}</span></p>
                <code className="block overflow-x-auto whitespace-nowrap rounded bg-background/60 px-2 py-1.5 text-xs">{issuedToken}</code>
              </div>
            ) : null}
          </div>
        </div>

        <section>
          <div className="mb-3">
            <h2 className="text-lg font-semibold tracking-tight">Connected Agents</h2>
            <p className="text-xs text-muted-foreground">Live updates from the remote bridge stream.</p>
          </div>

          {agents.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-muted-foreground">No connected agents found.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {agents.map((agent) => {
                const agentId = String(agent.agent_id || "");
                const capabilities = Array.isArray(agent.capabilities) ? agent.capabilities : [];

                return (
                  <section key={agentId} className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <code className="min-w-0 break-all text-sm font-medium">{agentId}</code>
                      <Badge variant="secondary">{capabilities.length} servers</Badge>
                    </div>

                    {capabilities.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No capabilities advertised.</p>
                    ) : (
                      <div className="space-y-2">
                        {capabilities.map((mcpServer) => {
                          const key = `${agentId}::${mcpServer}`;
                          const info = serverInfoMap[key];
                          const url = invokeUrl(agentId, mcpServer);
                          const toolsOpen = Boolean(expandedTools[key]);

                          return (
                            <div key={key} className="rounded-lg bg-muted/20 px-3 py-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <Badge variant="outline" className="max-w-[60vw] truncate sm:max-w-none">{mcpServer}</Badge>
                                <div className="flex items-center gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => copyText(url, "Invoke URL", `url:${key}`)} className="h-7 px-2">
                                    {copiedKey === `url:${key}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      setExpandedTools((prev) => ({
                                        ...prev,
                                        [key]: !prev[key],
                                      }))
                                    }
                                    className="h-7 px-2 font-mono text-xs"
                                    title="Toggle tools info"
                                  >
                                    {toolsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                  </Button>
                                </div>
                              </div>
                              <code className="mt-2 block w-full overflow-x-auto whitespace-nowrap rounded bg-background/60 px-2 py-1.5 text-xs">
                                {url}
                              </code>
                              {info ? (
                                <div className="mt-2 text-xs text-muted-foreground">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant={info.status === "connected" ? "secondary" : "destructive"}>{info.status}</Badge>
                                    <span>{info.title || "-"}</span>
                                    <span>v{info.version || "-"}</span>
                                    <span>{info.tools_count} tools</span>
                                  </div>
                                  {toolsOpen ? (
                                    <div className="mt-2 space-y-1">
                                      {info.tools_count === 0 || !Array.isArray(info.tools) || info.tools.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">No tools available.</p>
                                      ) : (
                                        info.tools.map((tool, idx) => (
                                          <div key={`${key}-tool-${idx}`} className="text-xs">
                                            <span className="font-medium text-foreground">{tool.name || `tool-${idx + 1}`}</span>
                                            {tool.description ? <span className="text-muted-foreground"> - {tool.description}</span> : null}
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

