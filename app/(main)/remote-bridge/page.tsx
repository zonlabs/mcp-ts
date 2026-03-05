"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { Check, ChevronDown, ChevronRight, Copy, KeyRound, Loader2, RefreshCw, ShieldBan, History } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const REMOTE_PROXY_BASE_URL = "https://hub.linkos.in/agent";
const TOKEN_HISTORY_KEY = "remote-bridge-issued-tokens-v1";
const TOKEN_HISTORY_LIMIT = 8;

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

interface TokenHistoryItem {
  token: string;
  subject: string;
  expiryMinutes: number;
  issuedAt: string;
  revoked?: boolean;
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function invokeUrl(agentId: string, mcpServer: string): string {
  return `${normalizeBaseUrl(REMOTE_PROXY_BASE_URL)}/${agentId}/${mcpServer}/mcp`;
}

function loadTokenHistory(): TokenHistoryItem[] {
  try {
    const raw = localStorage.getItem(TOKEN_HISTORY_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TokenHistoryItem[]) : [];
  } catch {
    return [];
  }
}

export default function RemoteBridgePage() {
  const [expiryMinutes, setExpiryMinutes] = useState("60");
  const [issuedToken, setIssuedToken] = useState("");
  const [issuedSubject, setIssuedSubject] = useState("");
  const [revokeToken, setRevokeToken] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const [agents, setAgents] = useState<RemoteAgent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [loadingAllInfo, setLoadingAllInfo] = useState(false);
  const [serverInfoMap, setServerInfoMap] = useState<Record<string, ServerInfo>>({});
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [tokenHistory, setTokenHistory] = useState<TokenHistoryItem[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<"issue" | "revoke" | "recent">("issue");

  const totalCapabilities = useMemo(
    () =>
      agents.reduce((sum, agent) => {
        const caps = Array.isArray(agent.capabilities) ? agent.capabilities.length : 0;
        return sum + caps;
      }, 0),
    [agents]
  );
  const panelCardClass = "p-0";

  useEffect(() => {
    localStorage.setItem(TOKEN_HISTORY_KEY, JSON.stringify(tokenHistory));
  }, [tokenHistory]);

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

  useEffect(() => {
    const history = loadTokenHistory();
    setTokenHistory(history);
    if (history.length > 0) {
      setIssuedToken(history[0].token);
      setIssuedSubject(history[0].subject);
      setRevokeToken(history[0].token);
    }
    void refreshAll();
  }, [refreshAll]);

  const issueToken = async () => {
    setIssuing(true);
    try {
      const response = await fetch("/api/remote-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "issue-token",
          expiryMinutes: Number(expiryMinutes) || 60,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to issue token");
      }

      const token = String(data?.data?.token || "");
      const subject = String(data?.data?.subject || "");
      const expiry = Number(data?.data?.expiry_minutes || Number(expiryMinutes) || 60);

      setIssuedToken(token);
      setIssuedSubject(subject);
      setRevokeToken(token);

      setTokenHistory((prev) =>
        [
          {
            token,
            subject,
            expiryMinutes: expiry,
            issuedAt: new Date().toISOString(),
            revoked: false,
          },
          ...prev.filter((item) => item.token !== token),
        ].slice(0, TOKEN_HISTORY_LIMIT)
      );
      toast.success("Token issued");
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

      setTokenHistory((prev) => prev.map((item) => (item.token === token ? { ...item, revoked: true } : item)));
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
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[320px_1fr]">
        <aside className="border-b border-border/60 bg-transparent p-5 lg:border-b-0 lg:border-r">
          <div className="mb-4">
            <h1 className="text-xl font-semibold tracking-tight">Remote Bridge</h1>
            <p className="mt-1 text-xs text-muted-foreground">Issue/revoke JWTs and inspect active bridge endpoints.</p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="p-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Agents</p>
              <p className="mt-1 text-2xl font-semibold leading-none">{agents.length}</p>
            </div>
            <div className="p-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Servers</p>
              <p className="mt-1 text-2xl font-semibold leading-none">{totalCapabilities}</p>
            </div>
          </div>

          <div className={`mt-6 grid grid-cols-[52px_1fr] gap-3 ${panelCardClass}`}>
            <div className="flex flex-col gap-2">
              <Button
                size="icon"
                variant={activePanel === "issue" ? "secondary" : "ghost"}
                className="h-11 w-11 border border-transparent"
                onClick={() => setActivePanel("issue")}
                title="Issue JWT"
              >
                <KeyRound className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant={activePanel === "revoke" ? "destructive" : "ghost"}
                className="h-11 w-11 border border-transparent"
                onClick={() => setActivePanel("revoke")}
                title="Revoke JWT"
              >
                <ShieldBan className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant={activePanel === "recent" ? "secondary" : "ghost"}
                className="h-11 w-11 border border-transparent"
                onClick={() => setActivePanel("recent")}
                title="Recent"
              >
                <History className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-w-0">
              {activePanel === "issue" ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Issue JWT</p>
                    <Badge variant="secondary" className="text-[10px]">Create</Badge>
                  </div>
                  <Input
                    value={expiryMinutes}
                    onChange={(e) => setExpiryMinutes(e.target.value)}
                    placeholder="Expiry minutes (1-1440)"
                    type="number"
                    min={1}
                    max={1440}
                    className="h-11 border-border/70 bg-background/80"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={issueToken}
                      disabled={issuing}
                      className="h-11 gap-2 bg-emerald-600 text-white hover:bg-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                    >
                      {issuing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Generate
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => copyText(issuedToken, "Token", "token")}
                      disabled={!issuedToken}
                      className="h-11 gap-2 border-border/70"
                    >
                      {copiedKey === "token" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      Copy
                    </Button>
                  </div>
                  <Input
                    value={issuedSubject}
                    readOnly
                    placeholder="Generated agent id"
                    className="h-11 border-border/70 bg-background/80 font-mono text-xs"
                  />
                  <Input
                    value={issuedToken}
                    readOnly
                    placeholder="Issued JWT"
                    className="h-11 border-border/70 bg-background/80 font-mono text-xs"
                  />
                </div>
              ) : null}

              {activePanel === "revoke" ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Revoke JWT</p>
                    <Badge variant="destructive" className="text-[10px]">Danger</Badge>
                  </div>
                  <Input
                    value={revokeToken}
                    onChange={(e) => setRevokeToken(e.target.value)}
                    placeholder="Paste token"
                    className="h-11 border-border/70 bg-background/80 font-mono text-xs"
                  />
                  <Button variant="destructive" onClick={revokeIssuedToken} disabled={revoking} className="h-11 w-full gap-2">
                    {revoking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Revoke
                  </Button>
                </div>
              ) : null}

              {activePanel === "recent" ? (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Recent</p>
                    <Button variant="ghost" size="sm" onClick={() => setTokenHistory([])} className="h-7 px-2 text-xs text-foreground/90">
                      Clear
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {tokenHistory.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No tokens yet.</p>
                    ) : (
                      tokenHistory.slice(0, 4).map((item) => (
                        <button
                          key={item.token}
                          onClick={() => {
                            setIssuedToken(item.token);
                            setIssuedSubject(item.subject);
                            setRevokeToken(item.token);
                            setActivePanel("issue");
                          }}
                          className="flex w-full items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted/40"
                        >
                          <span className="font-mono text-[11px]">{item.subject}</span>
                          <Badge variant={item.revoked ? "destructive" : "secondary"}>{item.revoked ? "revoked" : "active"}</Badge>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <main className="p-5 lg:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Connected Agents</h2>
              <p className="text-xs text-muted-foreground">Invoke URLs and server inspection results.</p>
            </div>
            <Button onClick={refreshAll} disabled={loadingAgents || loadingAllInfo} variant="outline" className="h-9 gap-2">
              {loadingAgents || loadingAllInfo ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
          </div>

          {agents.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center">
              <p className="text-sm text-muted-foreground">No connected agents found.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {agents.map((agent) => {
                const agentId = String(agent.agent_id || "");
                const capabilities = Array.isArray(agent.capabilities) ? agent.capabilities : [];

                return (
                  <section key={agentId} className="rounded-xl border border-border/60 bg-background/70 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-2">
                      <code className="min-w-0 break-all text-sm font-medium">{agentId}</code>
                      <Badge variant="secondary">{capabilities.length} servers</Badge>
                    </div>

                    <div className="px-1">
                      {capabilities.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No capabilities advertised.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {capabilities.map((mcpServer) => {
                            const key = `${agentId}::${mcpServer}`;
                            const info = serverInfoMap[key];
                            const url = invokeUrl(agentId, mcpServer);
                            const toolsOpen = Boolean(expandedTools[key]);

                            return (
                              <div key={key} className="rounded-lg border border-border/50 bg-muted/20 px-2.5 py-2.5">
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
                                <code className="mt-2 block w-full overflow-x-auto whitespace-nowrap rounded-md bg-background/50 px-2 py-1.5 text-xs">
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
                                              {tool.description ? (
                                                <span className="text-muted-foreground"> - {tool.description}</span>
                                              ) : null}
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
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
