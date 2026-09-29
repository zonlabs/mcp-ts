"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Layers,
  Search,
  Check,
  Ban,
  RefreshCw,
  SlidersHorizontal,
  Code,
  AlertTriangle,
  Info,
} from "lucide-react";
import type { McpServerItem, McpToolItem, ToolPolicy } from "../types";

interface ToolsPolicyModalProps {
  server: McpServerItem | null;
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onPolicyUpdated: () => void;
}

export function ToolsPolicyModal({
  server,
  userId,
  isOpen,
  onClose,
  onPolicyUpdated,
}: ToolsPolicyModalProps) {
  const [tools, setTools] = React.useState<McpToolItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Policy form state
  const [mode, setMode] = React.useState<"all" | "allowlist" | "denylist">("all");
  const [selectedToolIds, setSelectedToolIds] = React.useState<Set<string>>(new Set());

  // Initialize state when server changes or modal opens
  React.useEffect(() => {
    if (!server || !isOpen) return;

    const initialMode = server.toolPolicy?.mode || "all";
    setMode(initialMode);

    // Normalize IDs to plain tool names if namespaced
    const ids = (server.toolPolicy?.toolIds || []).map((id) =>
      id.includes("::") ? id.split("::").slice(1).join("::") : id
    );
    setSelectedToolIds(new Set(ids));
    setSearch("");
    setError(null);

    // Fetch tools from server
    fetchTools(server.id);
  }, [server, isOpen]);

  const fetchTools = async (serverId: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/servers/tools?serverId=${serverId}&userId=${encodeURIComponent(userId)}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to fetch tools (${res.status})`);
      }
      const data = await res.json();
      setTools(data.tools || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load tools");
      setTools([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTool = (toolName: string) => {
    setSelectedToolIds((prev) => {
      const next = new Set(prev);
      if (next.has(toolName)) {
        next.delete(toolName);
      } else {
        next.add(toolName);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedToolIds(new Set(tools.map((t) => t.name)));
  };

  const handleClearAll = () => {
    setSelectedToolIds(new Set());
  };

  const handleSavePolicy = async () => {
    if (!server) return;

    try {
      setSaving(true);
      setError(null);

      const toolPolicy: ToolPolicy = {
        mode,
        toolIds: mode === "all" ? [] : Array.from(selectedToolIds),
      };

      const res = await fetch("/api/servers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          serverId: server.id,
          toolPolicy,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to save tool policy");
      }

      onPolicyUpdated();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to save policy");
    } finally {
      setSaving(false);
    }
  };

  const filteredTools = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
    );
  }, [tools, search]);

  if (!server) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-card border-border">
        {/* Header */}
        <DialogHeader className="p-6 pb-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">
                Tools & Access Policy
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Configure tool access rules for{" "}
                <span className="font-semibold text-foreground">{server.name}</span>{" "}
                (<code className="text-[11px] font-mono">{server.id}</code>)
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Policy Mode Tabs */}
        <div className="p-6 pt-4 pb-3 bg-muted/20 border-b border-border/40">
          <label className="text-xs font-semibold text-foreground/80 block mb-2">
            Enforcement Mode
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setMode("all")}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                mode === "all"
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card text-muted-foreground hover:text-foreground border-border hover:border-border/80"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>All Tools (Open)</span>
            </button>

            <button
              type="button"
              onClick={() => setMode("allowlist")}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                mode === "allowlist"
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                  : "bg-card text-muted-foreground hover:text-foreground border-border hover:border-border/80"
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              <span>Allowlist (Strict)</span>
            </button>

            <button
              type="button"
              onClick={() => setMode("denylist")}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                mode === "denylist"
                  ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                  : "bg-card text-muted-foreground hover:text-foreground border-border hover:border-border/80"
              }`}
            >
              <Ban className="w-3.5 h-3.5" />
              <span>Denylist (Blocklist)</span>
            </button>
          </div>

          <p className="text-[11px] text-muted-foreground mt-2.5">
            {mode === "all" && "All tools are accessible to agents without restriction."}
            {mode === "allowlist" &&
              "Only tools checked below are allowed. All unselected tools are blocked."}
            {mode === "denylist" &&
              "Tools checked below are explicitly blocked. All unselected tools remain allowed."}
          </p>
        </div>

        {/* Body / Tool List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Search & Bulk Actions */}
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tools by name or description..."
                className="pl-8 text-xs h-8 bg-card"
              />
            </div>

            {mode !== "all" && tools.length > 0 && (
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-8 px-2.5"
                  onClick={handleSelectAll}
                >
                  Select All
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-8 px-2 text-muted-foreground"
                  onClick={handleClearAll}
                >
                  Clear
                </Button>
              </div>
            )}
          </div>

          {/* Tool Cards */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <RefreshCw className="w-6 h-6 animate-spin mb-2 text-primary" />
              <p className="text-xs">Connecting to MCP server and fetching tools...</p>
            </div>
          ) : tools.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed rounded-xl p-6 text-muted-foreground">
              <Info className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm font-medium">No tools found</p>
              <p className="text-xs text-muted-foreground/80 mt-1 max-w-sm">
                Ensure the server is connected and authenticated. If this server requires OAuth, authorize it first.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-4 text-xs h-8 gap-1.5"
                onClick={() => fetchTools(server.id)}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </Button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredTools.map((tool) => {
                const isSelected = selectedToolIds.has(tool.name);
                const isAllowed =
                  mode === "all" ||
                  (mode === "allowlist" && isSelected) ||
                  (mode === "denylist" && !isSelected);

                return (
                  <div
                    key={tool.name}
                    onClick={() => mode !== "all" && handleToggleTool(tool.name)}
                    className={`rounded-lg border p-3.5 transition-all text-left flex items-start gap-3 ${
                      mode === "all"
                        ? "bg-card border-border cursor-default"
                        : isSelected
                        ? mode === "allowlist"
                          ? "bg-emerald-500/5 border-emerald-500/30 cursor-pointer"
                          : "bg-rose-500/5 border-rose-500/30 cursor-pointer"
                        : "bg-card border-border/80 hover:border-border cursor-pointer"
                    }`}
                  >
                    {mode !== "all" && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleTool(tool.name)}
                        className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary shrink-0 cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold text-foreground">
                          {tool.name}
                        </span>

                        {isAllowed ? (
                          <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                            Allowed
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-rose-600 dark:text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                            Blocked
                          </span>
                        )}

                        {tool.inputSchema?.properties && (
                          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {Object.keys(tool.inputSchema.properties).length} params
                          </span>
                        )}
                      </div>

                      {tool.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                          {tool.description}
                        </p>
                      )}

                      {/* Schema params preview */}
                      {tool.inputSchema?.properties && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {Object.keys(tool.inputSchema.properties).map((prop) => (
                            <span
                              key={prop}
                              className="text-[10px] font-mono text-muted-foreground/80 bg-muted/60 px-1.5 py-0.5 rounded border border-border/40"
                            >
                              {prop}
                              {tool.inputSchema?.required?.includes(prop) && "*"}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 border-t border-border/60 bg-card flex items-center justify-between sm:justify-between">
          <div className="text-xs text-muted-foreground font-mono">
            {tools.length > 0 && (
              <span>
                {tools.length} total tools •{" "}
                {mode === "all"
                  ? "All active"
                  : mode === "allowlist"
                  ? `${selectedToolIds.size} allowed`
                  : `${selectedToolIds.size} blocked`}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="text-xs h-8" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-xs h-8 gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
              onClick={handleSavePolicy}
              disabled={saving}
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Saving Policy...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Save Policy
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
