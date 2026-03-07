"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { Check, ChevronDown, ChevronRight, Copy, Loader2, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

const REMOTE_PROXY_BASE_URL = "https://hub.linkos.in/agent";
const GATEWAY_INSTALL_COMMAND = "uvx mcpassistant-gateway";

interface RemoteAgent {
  subject?: string;
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
  tools: Array<{ name?: string; description?: string; [key: string]: unknown }>;
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function invokeUrl(agentId: string, mcpServer: string): string {
  return `${normalizeBaseUrl(REMOTE_PROXY_BASE_URL)}/${agentId}/${mcpServer}/mcp`;
}

function normalizeAgentId(agent: RemoteAgent): string {
  return String(agent.subject || "").trim();
}

function normalizeCapabilities(agent: RemoteAgent): string[] {
  const raw = Array.isArray(agent.capabilities) ? agent.capabilities : [];
  return raw.map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizeServerInfo(raw: unknown, agentId: string, mcpServer: string): ServerInfo {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const nestedTools = data.tools;
  const toolsArray = Array.isArray(nestedTools)
    ? nestedTools
    : (nestedTools && typeof nestedTools === "object" && Array.isArray((nestedTools as Record<string, unknown>).tools))
      ? ((nestedTools as Record<string, unknown>).tools as unknown[])
      : [];
  const tools = toolsArray
    .map((tool) => (tool && typeof tool === "object" ? (tool as Record<string, unknown>) : null))
    .filter(Boolean) as Array<{ name?: string; description?: string; [key: string]: unknown }>;
  return {
    status: data.status === "error" ? "error" : "connected",
    agent_id: String(data.agent_id || agentId || ""),
    mcp_server: String(data.mcp_server || mcpServer || ""),
    title: String(data.title || ""),
    version: String(data.version || ""),
    instructions: String(data.instructions || ""),
    tools_count: Number.isFinite(Number(data.tools_count)) ? Number(data.tools_count) : tools.length,
    tools,
  };
}

function generatePayloadFromSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return null;
  const s = schema as Record<string, unknown>;

  if (s.default !== undefined) {
    return s.default;
  }

  if (Array.isArray(s.enum) && s.enum.length > 0) {
    return s.enum[0];
  }

  const oneOf = Array.isArray(s.oneOf) ? s.oneOf : [];
  if (oneOf.length > 0) {
    return generatePayloadFromSchema(oneOf[0]);
  }
  const anyOf = Array.isArray(s.anyOf) ? s.anyOf : [];
  if (anyOf.length > 0) {
    return generatePayloadFromSchema(anyOf[0]);
  }
  const allOf = Array.isArray(s.allOf) ? s.allOf : [];
  if (allOf.length > 0) {
    return generatePayloadFromSchema(allOf[0]);
  }

  const type = typeof s.type === "string" ? s.type : "";
  if (type === "object") {
    const properties = s.properties && typeof s.properties === "object" ? (s.properties as Record<string, unknown>) : {};
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) {
      result[key] = generatePayloadFromSchema(value);
    }
    return result;
  }

  if (type === "array") {
    if (s.items && typeof s.items === "object") {
      return [generatePayloadFromSchema(s.items)];
    }
    return [];
  }

  if (type === "string") return "";
  if (type === "integer" || type === "number") return 0;
  if (type === "boolean") return false;

  return null;
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
  const toolPairs = useMemo(() => {
    const pairs: Array<{ key: string; agentId: string; mcpServer: string }> = [];
    for (const agent of agents) {
      const agentId = normalizeAgentId(agent);
      if (!agentId) continue;
      for (const mcpServer of normalizeCapabilities(agent)) {
        if (!mcpServer) continue;
        pairs.push({ key: `${agentId}::${mcpServer}`, agentId, mcpServer });
      }
    }
    return pairs;
  }, [agents]);
  const [selectedPairKey, setSelectedPairKey] = useState("");
  const [selectedToolName, setSelectedToolName] = useState("");
  const [testerPayload, setTesterPayload] = useState("{}");
  const [testerLoading, setTesterLoading] = useState(false);
  const [testerResponse, setTesterResponse] = useState<string>("");

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
      const agentId = normalizeAgentId(agent);
      const capabilities = normalizeCapabilities(agent);
      if (!agentId) {
        continue;
      }
      for (const mcpServer of capabilities) {
        if (!mcpServer) {
          continue;
        }
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
            return [key, normalizeServerInfo(data.data, agentId, mcpServer)] as const;
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
          agent_id: normalizeAgentId(agent),
          capabilities: normalizeCapabilities(agent).sort(),
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
    if (!toolPairs.length) {
      setSelectedPairKey("");
      return;
    }
    if (!selectedPairKey || !toolPairs.some((p) => p.key === selectedPairKey)) {
      setSelectedPairKey(toolPairs[0].key);
    }
  }, [toolPairs, selectedPairKey]);

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

  const selectedServerInfo = useMemo(() => {
    if (!selectedPairKey) return null;
    return serverInfoMap[selectedPairKey] || null;
  }, [selectedPairKey, serverInfoMap]);

  const selectedServerTools = useMemo(() => {
    if (!selectedServerInfo?.tools || !Array.isArray(selectedServerInfo.tools)) return [];
    return selectedServerInfo.tools;
  }, [selectedServerInfo]);

  const selectedTool = useMemo(() => {
    if (!selectedToolName) return null;
    return selectedServerTools.find((tool) => String(tool.name || "") === selectedToolName) || null;
  }, [selectedServerTools, selectedToolName]);

  const selectedToolSchema = useMemo(() => {
    if (!selectedTool) return {};
    return (selectedTool.inputSchema ?? selectedTool.parameters ?? {}) as Record<string, unknown>;
  }, [selectedTool]);

  const selectedToolSchemaText = useMemo(() => JSON.stringify(selectedToolSchema, null, 2), [selectedToolSchema]);

  useEffect(() => {
    if (!selectedServerTools.length) {
      setSelectedToolName("");
      setTesterPayload("{}");
      return;
    }
    const firstToolName = String(selectedServerTools[0]?.name || "");
    if (!selectedToolName || !selectedServerTools.some((tool) => String(tool.name || "") === selectedToolName)) {
      setSelectedToolName(firstToolName);
    }
  }, [selectedServerTools, selectedToolName]);

  useEffect(() => {
    if (!selectedToolName) {
      setTesterPayload("{}");
      return;
    }
    const schemaPayload = generatePayloadFromSchema(selectedToolSchema);
    const payloadStarter =
      schemaPayload && typeof schemaPayload === "object" && !Array.isArray(schemaPayload) ? schemaPayload : {};
    setTesterPayload(JSON.stringify(payloadStarter, null, 2));
  }, [selectedToolName, selectedToolSchemaText]);

  const runTester = async () => {
    const pair = toolPairs.find((p) => p.key === selectedPairKey);
    if (!pair) {
      toast.error("Select an agent/server first");
      return;
    }
    if (!selectedToolName) {
      toast.error("Select a tool first");
      return;
    }
    let args: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(testerPayload || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      } else {
        throw new Error("Payload must be a JSON object");
      }
    } catch {
      toast.error("Payload must be valid JSON");
      return;
    }
    const payload: Record<string, unknown> = {
      jsonrpc: "2.0",
      id: "call-1",
      method: "tools/call",
      params: {
        name: selectedToolName,
        arguments: args,
      },
    };
    setTesterLoading(true);
    try {
      const response = await fetch("/api/remote-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "invoke",
          agentId: pair.agentId,
          mcpServer: pair.mcpServer,
          payload,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Tester request failed");
      }
      setTesterResponse(JSON.stringify(data?.data ?? {}, null, 2));
      toast.success("Tool call completed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool call failed";
      setTesterResponse(JSON.stringify({ error: message }, null, 2));
      toast.error(message);
    } finally {
      setTesterLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      <main className="mx-auto max-w-6xl p-5 lg:p-6">
        <div className="mb-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
          <div className="min-w-0 space-y-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Gateway</h1>
              <p className="mt-1 text-xs text-muted-foreground">Generate JWT and inspect connected agents.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
                Gateway: {localAgentConnected ? "connected" : "disconnected"}
              </span>
            </div>

            <section className="w-full max-w-md">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Install Gateway</p>
              <div className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-muted/40 px-2 py-1.5">
                <code className="overflow-x-auto whitespace-nowrap text-xs font-mono text-foreground">
                  {GATEWAY_INSTALL_COMMAND}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyText(GATEWAY_INSTALL_COMMAND, "Install command", "gateway-install")}
                  className="h-7 gap-1 px-2 text-muted-foreground hover:text-foreground hover:bg-accent"
                >
                  {copiedKey === "gateway-install" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>

              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <p>1. Start the gateway on your machine.</p>
                <p>2. Login from CLI using <code>/login</code>.</p>
                <p>3. Start bridge from CLI using <code>/start</code>.</p>
                <p>4. Copy the server URL below and connect it in your preferred client.</p>
              </div>
            </section>
          </div>

          <div className="w-full lg:w-[420px] lg:max-w-[420px]">
            <div className="flex flex-wrap items-center justify-end gap-2">
              {/* JWT generation and settings are now handled from CLI.
                  Keep this block commented for fallback/reference only.
              <Button onClick={issueToken} disabled={issuing} className="h-9 gap-2 bg-emerald-600 text-white hover:bg-emerald-500">
                {issuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Generate JWT (CLI)
              </Button>
              <Button variant="outline" onClick={() => setSettingsOpen((v) => !v)} className="h-9 gap-2">
                <Settings2 className="h-4 w-4" />
                Settings
              </Button>
              */}
              <Button
                onClick={refreshAll}
                disabled={loadingAgents || loadingAllInfo}
                variant="outline"
                className="group h-9 gap-2 rounded-full border-border/70 bg-background/70 px-4 hover:bg-background"
              >
                {loadingAgents || loadingAllInfo ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 transition-transform duration-300 group-hover:rotate-180" />
                )}
                {loadingAgents || loadingAllInfo ? "Refreshing..." : "Refresh"}
              </Button>
            </div>

            {/* {settingsOpen ? (
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
                      Revoke token (CLI)
                    </Button>
                  </div>
                </div>
              </div>
            ) : null} */}

            {/* {issuedToken ? (
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
            ) : null} */}
          </div>
        </div>

        <section className="grid gap-5 xl:grid-cols-2 xl:items-start">
          <article className="rounded-xl border border-border/70 bg-muted/15 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-tight">Tool Call Tester</h2>
                <p className="text-xs text-muted-foreground">Select server, pick tool, edit payload, run.</p>
              </div>
              <Button onClick={runTester} disabled={testerLoading || !selectedPairKey} className="h-9 gap-2">
                {testerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Run
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Server</label>
                <select
                  value={selectedPairKey}
                  onChange={(e) => setSelectedPairKey(e.target.value)}
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                >
                  {toolPairs.length === 0 ? <option value="">No connected servers</option> : null}
                  {toolPairs.map((pair) => (
                    <option key={pair.key} value={pair.key}>
                      {pair.agentId} / {pair.mcpServer}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Tool</label>
                <select
                  value={selectedToolName}
                  onChange={(e) => setSelectedToolName(e.target.value)}
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                >
                  {selectedServerTools.length === 0 ? <option value="">No tools available</option> : null}
                  {selectedServerTools.map((tool, idx) => {
                    const name = String(tool.name || `tool-${idx + 1}`);
                    return (
                      <option key={`${name}-${idx}`} value={name}>
                        {name}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Tool Schema</label>
              <pre className="max-h-40 overflow-auto rounded-md border border-border bg-background/50 p-3 text-xs text-muted-foreground">
                {selectedToolSchemaText}
              </pre>
            </div>
            <div className="mt-3 space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Payload (arguments)</label>
              <Textarea
                value={testerPayload}
                onChange={(e) => setTesterPayload(e.target.value)}
                placeholder="{}"
                className="min-h-[140px] bg-background/70 font-mono text-xs"
              />
            </div>
            <Textarea
              value={testerResponse}
              onChange={(e) => setTesterResponse(e.target.value)}
              placeholder="Response JSON will appear here..."
              className="mt-3 min-h-[180px] bg-background/40 font-mono text-xs"
            />
          </article>

          <article className="rounded-xl border border-border/70 bg-muted/15 p-4">
            <div className="mb-3">
              <h2 className="text-base font-semibold tracking-tight">Connected Servers</h2>
              <p className="text-xs text-muted-foreground">Live servers, URLs, and tool metadata.</p>
            </div>

            {agents.length === 0 ? (
              <div className="px-1 py-10 text-center">
                <p className="text-sm text-muted-foreground">No connected servers found.</p>
              </div>
            ) : (
              <div className="max-h-[560px] space-y-4 overflow-auto pr-1">
                {agents.map((agent) => {
                  const agentId = normalizeAgentId(agent);
                  const capabilities = normalizeCapabilities(agent);
                  if (!agentId) {
                    return null;
                  }

                  return (
                    <section key={agentId} className="border-b border-border/50 pb-3 last:border-b-0">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
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
                              <div key={key} className="py-2 border-b border-border/40 last:border-b-0">
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
                                <code className="mt-2 block w-full overflow-x-auto whitespace-nowrap text-[11px] text-foreground/90">
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
          </article>
        </section>
      </main>
    </div>
  );
}

