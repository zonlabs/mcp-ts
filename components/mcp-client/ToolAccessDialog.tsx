"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ServerIcon } from "@/components/common/ServerIcon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useMcpStore, findConnectionForServer, type StoredConnection } from "@/lib/stores/mcp-store";
import type { McpServer, ToolAccessInfo, ToolAccessResult, ToolPolicyMode } from "@/types/mcp";

type ToolAccessDialogProps = {
  server: McpServer;
  connection?: StoredConnection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ToolBadge = "Read" | "Write" | "Destructive" | "Idempotent";

const MODE_OPTIONS: Array<{ mode: ToolPolicyMode; label: string }> = [
  { mode: "all", label: "All tools" },
  { mode: "allowlist", label: "Allowlist" },
  { mode: "denylist", label: "Denylist" },
];

export function ToolAccessDialog({
  server,
  connection,
  open,
  onOpenChange,
}: ToolAccessDialogProps) {
  const storeConnections = useMcpStore((state) => state.connections);
  const activeConn = connection || findConnectionForServer(storeConnections, server);

  const getToolAccess = useMcpStore((state) => state.mcpActions?.getToolAccess);
  const updateToolPolicy = useMcpStore((state) => state.mcpActions?.updateToolPolicy);
  const updateConnectionToolAccess = useMcpStore((state) => state.updateConnectionToolAccess);

  const initialAccess = useMemo<ToolAccessResult | null>(() => {
    const targetTools = server.tools ?? activeConn?.tools ?? [];
    const targetPolicy = activeConn?.toolPolicy ?? { mode: "all", toolIds: [] };

    return {
      toolPolicy: targetPolicy,
      tools: targetTools.map((t) => {
        const toolId = (t as any).toolId || (server.id ? `${server.id}::${t.name}` : t.name);
        return {
          ...t,
          toolId,
          allowed: targetPolicy.mode === "all"
            ? true
            : targetPolicy.mode === "allowlist"
              ? targetPolicy.toolIds.includes(toolId) || targetPolicy.toolIds.includes(t.name)
              : !targetPolicy.toolIds.includes(toolId) && !targetPolicy.toolIds.includes(t.name),
        };
      }),
      toolCount: targetTools.length,
      allowedToolCount: targetTools.length,
    };
  }, [activeConn, server]);

  const [access, setAccess] = useState<ToolAccessResult | null>(() => initialAccess);
  const [mode, setMode] = useState<ToolPolicyMode>(() => activeConn?.toolPolicy?.mode ?? "all");
  const [selectedToolIds, setSelectedToolIds] = useState<Set<string>>(() => new Set(activeConn?.toolPolicy?.toolIds ?? []));
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmZeroOpen, setConfirmZeroOpen] = useState(false);
  const userInteracted = useRef(false);
  const userToggledCheckbox = useRef(false);

  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const sessionId = activeConn?.sessionId;

  useEffect(() => {
    if (!open || !sessionId) return;
    const currentSessionId = sessionId;
    let active = true;
    userInteracted.current = false;
    userToggledCheckbox.current = false;

    async function loadAccess() {
      if (!getToolAccess) {
        setError("Tool access management requires the updated MCP SDK.");
        return;
      }

      if (!activeConn || !activeConn.tools || activeConn.tools.length === 0) {
        setLoading(true);
      }
      setError(null);
      try {
        const result = await getToolAccess(currentSessionId);
        if (!active) return;
        setAccess(result);
        if (!userInteracted.current) {
          setMode(result.toolPolicy.mode);
        }
        if (!userToggledCheckbox.current) {
          const activeMode = userInteracted.current ? modeRef.current : result.toolPolicy.mode;
          if (activeMode === result.toolPolicy.mode) {
            setSelectedToolIds(new Set(result.toolPolicy.toolIds));
          } else if (activeMode === "allowlist") {
            setSelectedToolIds(new Set(result.tools.filter((t) => t.allowed).map((t) => t.toolId)));
          } else if (activeMode === "denylist") {
            setSelectedToolIds(new Set(result.tools.filter((t) => !t.allowed).map((t) => t.toolId)));
          } else {
            setSelectedToolIds(new Set());
          }
        }
      } catch (loadError) {
        if (!active) return;
        if (!activeConn || !activeConn.tools || activeConn.tools.length === 0) {
          setError(loadError instanceof Error ? loadError.message : "Could not load tool access.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadAccess();
    return () => {
      active = false;
    };
  }, [getToolAccess, open, sessionId, activeConn]);

  const tools = access?.tools ?? [];
  const allToolIds = useMemo(() => tools.map((tool) => tool.toolId), [tools]);
  const filteredTools = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return tools;
    return tools.filter((tool) => {
      return (
        tool.name.toLowerCase().includes(normalized) ||
        (tool.description ?? "").toLowerCase().includes(normalized)
      );
    });
  }, [query, tools]);

  const allowedCount = useMemo(() => {
    if (!access) return activeConn?.tools.length ?? 0;
    if (mode === "all") return access.toolCount;
    if (mode === "allowlist") return selectedToolIds.size;
    return Math.max(0, access.toolCount - selectedToolIds.size);
  }, [access, activeConn?.tools.length, mode, selectedToolIds]);

  const hasChanges = useMemo(() => {
    if (!access) return false;
    const original = access.toolPolicy;
    if (original.mode !== mode) return true;
    const originalIds = new Set(original.toolIds);
    if (originalIds.size !== selectedToolIds.size) return true;
    return Array.from(selectedToolIds).some((id) => !originalIds.has(id));
  }, [access, mode, selectedToolIds]);

  function handleModeChange(nextMode: ToolPolicyMode) {
    userInteracted.current = true;
    setMode(nextMode);
    if (nextMode === "all") {
      setSelectedToolIds(new Set());
      return;
    }

    if (nextMode === "allowlist") {
      setSelectedToolIds(new Set());
      return;
    }

    if (access?.toolPolicy.mode === "denylist") {
      setSelectedToolIds(new Set(access.toolPolicy.toolIds));
    } else {
      setSelectedToolIds(new Set());
    }
  }

  function toggleTool(toolId: string, checked: boolean) {
    userToggledCheckbox.current = true;
    setSelectedToolIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(toolId);
      } else {
        next.delete(toolId);
      }
      return next;
    });
  }

  function selectAll() {
    userToggledCheckbox.current = true;
    setSelectedToolIds(new Set(allToolIds));
  }

  function clearSelected() {
    userToggledCheckbox.current = true;
    setSelectedToolIds(new Set());
  }

  async function savePolicy(skipZeroConfirm = false) {
    if (!sessionId || !updateToolPolicy) {
      setError("Tool access management requires the updated MCP SDK.");
      return;
    }

    if (mode === "allowlist" && selectedToolIds.size === 0 && !skipZeroConfirm) {
      setConfirmZeroOpen(true);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await updateToolPolicy(sessionId, {
        mode,
        toolIds: mode === "all" ? undefined : Array.from(selectedToolIds),
      });
      setAccess(result);
      setMode(result.toolPolicy.mode);
      setSelectedToolIds(new Set(result.toolPolicy.toolIds));
      updateConnectionToolAccess(sessionId, result);
      toast.success("Tool access updated");
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save tool access.");
    } finally {
      setSaving(false);
      setConfirmZeroOpen(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[86vh] flex-col overflow-hidden p-0 sm:max-w-2xl bg-background border border-border rounded-md shadow-none">
          <DialogHeader className="border-b border-border px-5 py-4 text-left">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-sm border border-border bg-card">
                <ShieldCheck className="size-4 text-foreground/80" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-sm font-medium tracking-tight text-foreground font-sans">
                  Tool Permissions
                </DialogTitle>
                <DialogDescription className="truncate text-xs font-mono text-muted-foreground mt-0.5">
                  {server.name} · {allowedCount} of {access?.toolCount ?? activeConn?.tools.length ?? 0} tools allowed for AI
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-5 py-4">
            <Tabs
              value={mode}
              onValueChange={(val) => handleModeChange(val as ToolPolicyMode)}
              className="w-full"
            >
              <TabsList className="grid grid-cols-3 w-full bg-card border border-border p-1 rounded-sm h-auto">
                {MODE_OPTIONS.map((option) => (
                  <TabsTrigger
                    key={option.mode}
                    value={option.mode}
                    className="text-xs font-mono rounded-sm px-3 py-1 transition-all cursor-pointer data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:font-semibold"
                  >
                    {option.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {error && (
              <div className="rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs font-mono text-destructive">
                {error}
              </div>
            )}

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              {mode === "all" && (
                <div className="rounded-sm border border-border bg-card px-3 py-2 text-center">
                  <p className="text-xs font-mono text-muted-foreground">
                    All tools are accessible. Switch to Allowlist or Denylist to restrict access.
                  </p>
                </div>
              )}
              {mode === "allowlist" && (
                <div className="rounded-sm border border-border bg-card px-3 py-2 text-center">
                  <p className="text-xs font-mono text-muted-foreground">
                    {selectedToolIds.size} selected tool{selectedToolIds.size === 1 ? "" : "s"} will be accessible by AI agents
                  </p>
                </div>
              )}
              {mode === "denylist" && (
                <div className="rounded-sm border border-border bg-card px-3 py-2 text-center">
                  <p className="text-xs font-mono text-muted-foreground">
                    {selectedToolIds.size} selected tool{selectedToolIds.size === 1 ? "" : "s"} will be blocked from AI agents
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search tools..."
                    className="h-8 pl-8 pr-3 text-xs font-mono bg-card border-border rounded-sm placeholder:font-sans"
                  />
                </div>
                {mode !== "all" && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 text-xs font-mono rounded-sm border-border" onClick={selectAll}>
                      Select all
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-8 px-2.5 text-xs font-mono rounded-sm" onClick={clearSelected}>
                      Clear
                    </Button>
                  </div>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto rounded-sm border border-border bg-card/30 scrollbar-minimal">
                {loading ? (
                  <div className="flex h-40 items-center justify-center text-xs font-mono text-muted-foreground">
                    <Loader2 className="mr-2 size-3.5 animate-spin" />
                    Loading tools...
                  </div>
                ) : filteredTools.length === 0 ? (
                  <div className="flex h-40 items-center justify-center text-xs font-mono text-muted-foreground">
                    No tools match this search.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {filteredTools.map((tool) => {
                      const isAllMode = mode === "all";
                      const checked = isAllMode ? true : selectedToolIds.has(tool.toolId);
                      const badge = classifyTool(tool);
                      const uiMeta = (tool as any)._meta?.ui as { resourceUri?: string; visibility?: string[] } | undefined;
                      const isApp = uiMeta?.resourceUri?.startsWith("ui://");
                      return (
                        <label
                          key={tool.toolId}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2.5 transition-colors",
                            isAllMode ? "" : "cursor-pointer hover:bg-card/70",
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={isAllMode}
                            onCheckedChange={(value) => toggleTool(tool.toolId, value === true)}
                            className="size-4 shrink-0 rounded-xs border-border data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                            aria-label={`${
                              isAllMode ? "Allow" : mode === "allowlist" ? "Allow" : "Deny"
                            } ${tool.name}`}
                          />
                          <div className="size-8 shrink-0 flex items-center justify-center rounded-sm bg-background border border-border p-1">
                            <ServerIcon
                              serverName={server.name}
                              serverUrl={server.url}
                              icon={server.icon || (server as any).icon}
                              size={24}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <code className="truncate font-mono text-[11px] font-semibold text-foreground">{tool.name}</code>
                              <span className={cn(
                                "text-[10px] font-mono px-1.5 py-0.2 rounded-xs border",
                                badge === "Destructive" && "text-rose-400 border-rose-800/40",
                                badge === "Write" && "text-amber-400 border-amber-800/40",
                                badge === "Read" && "text-sky-400 border-sky-800/40",
                                badge === "Idempotent" && "text-sky-300 border-sky-700/40",
                              )}>
                                {badge}
                              </span>
                              {isApp && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-xs border text-purple-400 border-purple-800/40">
                                  App
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                              {tool.description || "No description provided."}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-border px-5 py-3 flex items-center justify-end gap-2 bg-background">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="h-8 px-3 text-xs font-medium rounded-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void savePolicy()}
              disabled={!hasChanges || saving || loading}
              className="h-8 px-4 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-sm disabled:opacity-50"
            >
              {saving && <Loader2 className="mr-2 size-3.5 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmZeroOpen} onOpenChange={setConfirmZeroOpen}>
        <AlertDialogContent className="bg-background border border-border rounded-md shadow-none max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-medium font-sans text-foreground">
              No tools selected?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs font-mono text-muted-foreground">
              No tools will be available to AI agents for this server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-8 px-3 text-xs font-medium rounded-sm border-border">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void savePolicy(true)}
              className="h-8 px-3 text-xs font-medium rounded-sm bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Save anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function classifyTool(tool: ToolAccessInfo): ToolBadge {
  const ann = tool.annotations as { destructiveHint?: boolean; readOnlyHint?: boolean; idempotentHint?: boolean } | undefined;
  if (ann?.destructiveHint === true) return "Destructive";
  if (ann?.readOnlyHint === true) return "Read";
  if (ann?.idempotentHint === true) return "Idempotent";

  const value = `${tool.name} ${tool.description ?? ""}`.toLowerCase();
  if (/delete|remove|destroy|drop|revoke|disable|purge|clear|wipe/.test(value)) return "Destructive";
  if (/create|add|update|edit|write|send|post|put|patch|merge|commit|upload|enable|process|execute|run|transform|calculate|generate|build|publish|deploy|sync|import|export|clone|fork|copy/.test(value)) return "Write";
  if (/get|list|read|fetch|search|find|query|lookup|view|inspect|check|count|sum|aggregate|describe|show/.test(value)) return "Read";
  return "Write";
}




