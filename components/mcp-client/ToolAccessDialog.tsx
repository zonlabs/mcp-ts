"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";

import { Badge } from "@/components/ui/badge";
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
import { useMcpStore, type StoredConnection } from "@/lib/stores/mcp-store";
import type { McpServer, ToolAccessInfo, ToolAccessResult, ToolPolicyMode } from "@/types/mcp";

type ToolAccessDialogProps = {
  server: McpServer;
  connection?: StoredConnection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ToolBadge = "Read" | "Write" | "Destructive" | "Unknown";

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
  const getToolAccess = useMcpStore((state) => state.mcpActions?.getToolAccess);
  const updateToolPolicy = useMcpStore((state) => state.mcpActions?.updateToolPolicy);
  const updateConnectionToolAccess = useMcpStore((state) => state.updateConnectionToolAccess);
  const initialAccess = useMemo<ToolAccessResult | null>(() => {
    const targetTools = server.tools ?? connection?.tools ?? [];
    const targetPolicy = connection?.toolPolicy ?? { mode: "all", toolIds: [] };

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
              ? targetPolicy.toolIds.includes(toolId)
              : !targetPolicy.toolIds.includes(toolId),
        };
      }),
      toolCount: targetTools.length,
      allowedToolCount: targetTools.length,
    };
  }, [connection, server]);

  const [access, setAccess] = useState<ToolAccessResult | null>(() => initialAccess);
  const [mode, setMode] = useState<ToolPolicyMode>(() => connection?.toolPolicy?.mode ?? "all");
  const [selectedToolIds, setSelectedToolIds] = useState<Set<string>>(() => new Set(connection?.toolPolicy?.toolIds ?? []));
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

  const sessionId = connection?.sessionId;

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

      if (!connection || !connection.tools || connection.tools.length === 0) {
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
        if (!connection || !connection.tools || connection.tools.length === 0) {
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
  }, [getToolAccess, open, sessionId]);

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
    if (!access) return connection?.tools.length ?? 0;
    if (mode === "all") return access.toolCount;
    if (mode === "allowlist") return selectedToolIds.size;
    return Math.max(0, access.toolCount - selectedToolIds.size);
  }, [access, connection?.tools.length, mode, selectedToolIds]);

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
      if (access?.toolPolicy.mode === "allowlist") {
        setSelectedToolIds(new Set(access.toolPolicy.toolIds));
      } else {
        setSelectedToolIds(new Set(tools.filter((tool) => tool.allowed).map((tool) => tool.toolId)));
      }
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
        <DialogContent className="flex max-h-[86vh] flex-col overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-border px-5 py-4 text-left">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted/40">
                <ShieldCheck className="h-4 w-4 text-foreground/80" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base">Tool access</DialogTitle>
                <DialogDescription className="truncate text-xs">
                  {server.name} - {allowedCount} of {access?.toolCount ?? connection?.tools.length ?? 0} tools allowed
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
              <TabsList className="grid grid-cols-3 w-full">
                {MODE_OPTIONS.map((option) => (
                  <TabsTrigger
                    key={option.mode}
                    value={option.mode}
                    className="text-xs cursor-pointer border-0 data-[state=active]:border-transparent dark:data-[state=active]:border-transparent data-[state=active]:bg-background dark:data-[state=active]:bg-background data-[state=active]:shadow-xs"
                  >
                    {option.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            {mode === "all" ? (
              <div className="rounded-md border border-border bg-muted/20 px-4 py-8 text-center">
                <p className="text-sm font-medium text-foreground">All tools allowed</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Agents can discover and call every tool currently exposed by this server.
                </p>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search tools"
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={selectAll}>
                      Select all
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={clearSelected}>
                      Clear
                    </Button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
                  {loading ? (
                    <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading tools
                    </div>
                  ) : filteredTools.length === 0 ? (
                    <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
                      No tools match this search.
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {filteredTools.map((tool) => {
                        const checked = selectedToolIds.has(tool.toolId);
                        const badge = classifyTool(tool);
                        return (
                          <label
                            key={tool.toolId}
                            className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/30"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => toggleTool(tool.toolId, value === true)}
                              className="shrink-0"
                              aria-label={`${mode === "allowlist" ? "Allow" : "Deny"} ${tool.name}`}
                            />
                            <ServerIcon
                              serverName={server.name}
                              serverUrl={server.url}
                              size={36}
                              className="rounded-lg shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <code className="truncate font-mono text-[11px] text-foreground">{tool.name}</code>
                                <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", badge === "Destructive" && "border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/5")}>
                                  {badge}
                                </Badge>
                              </div>
                              <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
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
            )}
          </div>

          <DialogFooter className="border-t border-border px-5 py-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void savePolicy()} disabled={!hasChanges || saving || loading}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmZeroOpen} onOpenChange={setConfirmZeroOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No tools selected?</AlertDialogTitle>
            <AlertDialogDescription>
              No tools will be available to agents for this server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void savePolicy(true)}>
              Save anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function classifyTool(tool: ToolAccessInfo): ToolBadge {
  const ann = tool.annotations as { destructiveHint?: boolean; readOnlyHint?: boolean } | undefined;
  if (ann?.destructiveHint === true) return "Destructive";
  if (ann?.readOnlyHint === true) return "Read";

  const value = `${tool.name} ${tool.description ?? ""}`.toLowerCase();
  if (/delete|remove|destroy|drop|revoke|disable|purge/.test(value)) return "Destructive";
  if (/create|add|update|edit|write|send|post|put|patch|merge|commit|upload|enable/.test(value)) return "Write";
  if (/get|list|read|fetch|search|find|query|lookup|view|inspect/.test(value)) return "Read";
  return "Unknown";
}




