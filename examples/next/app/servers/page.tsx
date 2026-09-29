"use client";

import * as React from "react";
import Link from "next/link";
import {
  Server,
  ArrowLeft,
  RefreshCw,
  Layers,
  Sparkles,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  PlugZap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ServerCard } from "./components/ServerCard";
import { CreateServerModal } from "./components/CreateServerModal";
import { ToolsPolicyModal } from "./components/ToolsPolicyModal";
import { PresetsBar, PRESETS } from "./components/PresetsBar";
import { ServerFilters } from "./components/ServerFilters";
import type { McpServerItem, PresetServer } from "./types";

export default function ServersPage() {
  const [userId, setUserId] = React.useState(
    process.env.NEXT_PUBLIC_MCP_USER_ID || "demo-user-123"
  );
  const [servers, setServers] = React.useState<McpServerItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [filterEnabled, setFilterEnabled] = React.useState<"all" | "true" | "false">("all");

  // Modals
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [policyServer, setPolicyServer] = React.useState<McpServerItem | null>(null);
  const [authorizingId, setAuthorizingId] = React.useState<string | null>(null);

  const fetchServers = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ userId });
      if (filterEnabled !== "all") {
        params.append("enabled", filterEnabled);
      }
      if (search.trim()) {
        params.append("search", search.trim());
      }

      const res = await fetch(`/api/servers?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load servers (${res.status})`);
      }
      const data = await res.json();
      setServers(data.data || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load servers");
    } finally {
      setLoading(false);
    }
  }, [userId, filterEnabled, search]);

  React.useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  // Auto-refresh when returning from OAuth popup or receiving auth broadcast
  React.useEffect(() => {
    const handleAuthMessage = (event: MessageEvent) => {
      if (
        event.data?.type === "MCP_AUTH_SUCCESS" ||
        event.data?.type === "MCP_AUTH_RESULT" ||
        event.data?.type === "MCP_AUTH_CODE"
      ) {
        fetchServers();
      }
    };
    const handleFocus = () => {
      fetchServers();
    };

    window.addEventListener("message", handleAuthMessage);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("message", handleAuthMessage);
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchServers]);

  const handleConnectOAuth = async (server: McpServerItem) => {
    try {
      setAuthorizingId(server.id);
      setError(null);

      let authUrl =
        server.status?.state === "auth_required" && server.status.authorizationUrl
          ? server.status.authorizationUrl
          : null;

      if (!authUrl) {
        const res = await fetch("/api/servers/oauth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            serverId: server.id,
            callbackUrl: `${window.location.origin}/oauth/callback`,
            clientMetadataUrl: server.auth?.type === "oauth" ? server.auth.config?.clientMetadataUrl : undefined,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to generate authorization URL");
        }

        const data = await res.json();
        authUrl = data.url;
      }

      if (authUrl) {
        window.open(authUrl, "mcp_oauth_popup", "width=600,height=750");
      }
    } catch (err: any) {
      setError(err?.message || "OAuth authorization failed");
    } finally {
      setAuthorizingId(null);
    }
  };

  const handleToggleEnabled = async (server: McpServerItem) => {
    try {
      const nextState = !server.enabled;
      // Optimistic update
      setServers((prev) =>
        prev.map((s) => (s.id === server.id ? { ...s, enabled: nextState } : s))
      );

      const res = await fetch("/api/servers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, serverId: server.id, enabled: nextState }),
      });

      if (!res.ok) {
        await fetchServers(); // Rollback
      }
    } catch {
      await fetchServers();
    }
  };

  const handleDelete = async (serverId: string) => {
    if (!confirm(`Are you sure you want to delete MCP server "${serverId}"?`)) return;

    try {
      setServers((prev) => prev.filter((s) => s.id !== serverId));
      const res = await fetch(
        `/api/servers?serverId=${encodeURIComponent(serverId)}&userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        await fetchServers();
      }
    } catch {
      await fetchServers();
    }
  };

  const handleQuickPreset = async (preset: PresetServer) => {
    try {
      setLoading(true);
      const res = await fetch("/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          name: preset.name,
          url: preset.url,
          description: preset.description,
          auth: preset.auth,
          metadata: preset.metadata,
          callbackUrl: `${window.location.origin}/oauth/callback`,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add preset");
      }

      const created = await res.json().catch(() => null);
      await fetchServers();

      if (created?.status?.state === "auth_required" && created?.status?.authorizationUrl) {
        window.open(created.status.authorizationUrl, "mcp_oauth_popup", "width=600,height=750");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to add preset server");
    } finally {
      setLoading(false);
    }
  };

  const handleServerCreated = (created: any) => {
    fetchServers();
    if (created?.status?.state === "auth_required" && created?.status?.authorizationUrl) {
      window.open(created.status.authorizationUrl, "mcp_oauth_popup", "width=600,height=750");
    }
  };

  // Stats calculation
  const totalCount = servers.length;
  const connectedCount = servers.filter((s) => s.status?.state === "connected").length;
  const authRequiredCount = servers.filter((s) => s.status?.state === "auth_required").length;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Chat</span>
            </Link>
            <span className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <PlugZap className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm tracking-tight">MCP Hub</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={fetchServers}
              disabled={loading}
              className="text-xs h-8 gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Page Banner & Stats */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              MCP Servers & Tool Governance
            </h1>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
              Register remote Model Context Protocol servers, configure OAuth 2.1 authentication,
              attach custom metadata, and enforce per-tool allowlists or denylists.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3 text-xs shrink-0">
            <div className="px-3 py-1.5 rounded-lg border border-border/60 bg-card">
              <span className="text-muted-foreground">Servers:</span>{" "}
              <span className="font-semibold font-mono">{totalCount}</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg border border-border/60 bg-card">
              <span className="text-muted-foreground">Active:</span>{" "}
              <span className="font-semibold font-mono text-emerald-500">
                {connectedCount}
              </span>
            </div>
            {authRequiredCount > 0 && (
              <div className="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <span>Needs Auth:</span>{" "}
                <span className="font-semibold font-mono">{authRequiredCount}</span>
              </div>
            )}
          </div>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs h-7 text-rose-600 hover:text-rose-700 hover:bg-rose-500/20"
              onClick={fetchServers}
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* 1-Click Quick Presets */}
        <PresetsBar onSelectPreset={handleQuickPreset} disabled={loading} />

        {/* Search, Status Tabs, User Switcher */}
        <ServerFilters
          search={search}
          onSearchChange={setSearch}
          filterEnabled={filterEnabled}
          onFilterEnabledChange={setFilterEnabled}
          userId={userId}
          onUserIdChange={setUserId}
          totalServers={totalCount}
          onOpenCreate={() => setIsCreateOpen(true)}
        />

        {/* Server Cards Grid */}
        {loading && servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
            <RefreshCw className="w-8 h-8 animate-spin mb-3 text-primary" />
            <p className="text-sm font-medium">Loading MCP server catalog...</p>
          </div>
        ) : servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed rounded-2xl p-8 bg-card/40">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
              <Server className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-base text-foreground">No MCP servers found</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              {search
                ? `No servers matching "${search}". Try clearing your search.`
                : "Get started by choosing a quick preset above or adding a custom MCP server endpoint."}
            </p>
            <Button
              size="sm"
              onClick={() => setIsCreateOpen(true)}
              className="mt-4 text-xs h-8"
            >
              Add Your First Server
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {servers.map((server) => (
              <ServerCard
                key={server.id}
                server={server}
                authorizingId={authorizingId}
                onToggleEnabled={handleToggleEnabled}
                onConnectOAuth={handleConnectOAuth}
                onOpenPolicy={(srv) => setPolicyServer(srv)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>

      {/* Create Server Modal (includes direct JSON metadata input) */}
      <CreateServerModal
        isOpen={isCreateOpen}
        userId={userId}
        onClose={() => setIsCreateOpen(false)}
        onCreated={handleServerCreated}
      />

      {/* Tools & Policy Modal */}
      <ToolsPolicyModal
        isOpen={Boolean(policyServer)}
        server={policyServer}
        userId={userId}
        onClose={() => setPolicyServer(null)}
        onPolicyUpdated={fetchServers}
      />
    </div>
  );
}
