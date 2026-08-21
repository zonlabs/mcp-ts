"use client";

import React, { useState, useMemo, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  Terminal,
  FileText,
  MessageSquare,
  Database,
  KeyRound,
  RefreshCw,
  Trash2,
  Lock,
  LockOpen,
  ChevronDown,
  ChevronRight,
  Eye,
  Edit3,
  Pencil,
  AlertTriangle,
  Play,
  Copy,
  Check,
  Info,
  Plug,
  Loader2,
  AlertCircle,
  MoreVertical,
} from "lucide-react";
import { McpServer, ToolInfo } from "@/types/mcp";
import { UserSession } from "@/components/providers/AuthProvider";
import { ServerIcon } from "@/components/common/ServerIcon";
import { findConnectionForServer } from "@/lib/mcp/connection-utils";
import { useMcpContext } from "@/components/providers/McpProvider";
import { useUserServers } from "@/hooks/useUserServers";
import { Button } from "@/components/ui/button";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { ToolAccessDialog } from "./ToolAccessDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";

interface AppDetailViewProps {
  server: McpServer;
  userSession: UserSession | null;
  onBack: () => void;
  onAction: (server: McpServer, action: "activate" | "deactivate") => Promise<unknown>;
  onEdit?: (server: McpServer) => void;
  onDelete?: (serverId: string) => Promise<void>;
  onTestTool?: (toolName: string) => void;
}

type ToolCategory = "Read" | "Write" | "Destructive";

function classifyTool(tool: ToolInfo): ToolCategory {
  const ann = tool.annotations as { destructiveHint?: boolean; readOnlyHint?: boolean } | undefined;
  if (ann?.destructiveHint === true) return "Destructive";
  if (ann?.readOnlyHint === true) return "Read";

  const val = `${tool.name} ${tool.description ?? ""}`.toLowerCase();
  if (/delete|remove|destroy|drop|revoke|disable|purge|clear|wipe/.test(val)) return "Destructive";
  if (/get|list|read|fetch|search|find|query|lookup|view|inspect|check|count|describe|show/.test(val)) return "Read";
  return "Write";
}

export function AppDetailView({
  server,
  userSession,
  onBack,
  onAction,
  onEdit,
  onDelete,
  onTestTool,
}: AppDetailViewProps) {
  const { connections, updateSession } = useMcpContext();
  const { userServers, refetch: refetchUserServers } = useUserServers();
  const stored = useMemo(
    () => findConnectionForServer(connections, server),
    [connections, server]
  );

  const isOwner = Boolean(
    userSession?.user?.id && (
      server.owner === userSession.user.id ||
      userServers.some((s) => s.id === server.id) ||
      (!server.isVerified && !server.isPublic)
    )
  );

  const [activeAccordion, setActiveAccordion] = useState<string | null>("read");
  const [expandedToolName, setExpandedToolName] = useState<string | null>(null);
  const [toolAccessOpen, setToolAccessOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);
  const [optimisticEnabled, setOptimisticEnabled] = useState<boolean | null>(null);
  const [enableError, setEnableError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Sync optimistic state when stored enabled state updates
  useEffect(() => {
    setOptimisticEnabled(null);
    setEnableError(null);
  }, [stored?.enabled]);

  const handleDeleteServer = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(server.id);
      void refetchUserServers();
      toast.success(`${server.name} deleted successfully`);
      setDeleteConfirmOpen(false);
      onBack();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete server");
    } finally {
      setIsDeleting(false);
    }
  };

  const connStatus = (stored?.state ?? server.connectionStatus ?? "DISCONNECTED").toUpperCase();
  const isConnected = connStatus === "READY";
  const isInProgress = Boolean(
    isActionPending ||
    ["CONNECTING", "AUTHENTICATING", "DISCOVERING"].includes(connStatus)
  );
  const isServerEnabled = optimisticEnabled !== null ? optimisticEnabled : (stored ? (stored as any).enabled !== false : true);

  const allTools: ToolInfo[] = (stored?.tools as ToolInfo[]) ?? server.tools ?? [];
  const prompts = (stored as any)?.prompts ?? server.prompts ?? [];
  const resources = (stored as any)?.resources ?? server.resources ?? [];
  const resourceTemplates = (stored as any)?.resourceTemplates ?? [];

  // Group tools by category
  const groupedTools = useMemo(() => {
    const groups: Record<ToolCategory, ToolInfo[]> = {
      Read: [],
      Write: [],
      Destructive: [],
    };
    for (const tool of allTools) {
      const cat = classifyTool(tool);
      groups[cat].push(tool);
    }
    return groups;
  }, [allTools]);

  const isToolAllowed = (tool: ToolInfo) => {
    const policy = stored?.toolPolicy;
    if (!policy || policy.mode === "all") return true;
    const toolId = (tool as any).toolId || (server.id ? `${server.id}::${tool.name}` : tool.name);
    if (policy.mode === "allowlist") {
      return policy.toolIds.includes(toolId) || policy.toolIds.includes(tool.name);
    }
    if (policy.mode === "denylist") {
      return !policy.toolIds.includes(toolId) && !policy.toolIds.includes(tool.name);
    }
    return true;
  };

  const handleToggleConnect = async () => {
    setIsActionPending(true);
    try {
      if (isConnected) {
        await onAction(server, "deactivate");
        toast.success(`Disconnected from ${server.name}`);
      } else if (isInProgress) {
        await onAction(server, "deactivate");
        toast.success(`Cancelled connection to ${server.name}`);
      } else {
        await onAction(server, "activate");
      }
    } catch (e: any) {
      // Error is already formatted and toasted by connection handler
    } finally {
      setIsActionPending(false);
    }
  };

  const handleToggleEnabled = async (checked: boolean) => {
    if (!stored?.sessionId || !updateSession) {
      toast.error("Active session required to toggle AI access");
      return;
    }
    // Instant optimistic toggle
    setOptimisticEnabled(checked);
    setEnableError(null);
    try {
      await updateSession(stored.sessionId, checked);
      toast.success(checked ? `${server.name} access enabled` : `${server.name} access disabled`);
    } catch (err: any) {
      // Rollback on error
      const previousState = stored ? stored.enabled !== false : !checked;
      setOptimisticEnabled(previousState);
      const errorMsg = err instanceof Error ? err.message : "Failed to update AI access";
      setEnableError(errorMsg);
      toast.error(errorMsg);
    }
  };

  const handleCopyUrl = async () => {
    if (!server.url) return;
    try {
      await navigator.clipboard.writeText(server.url);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // clipboard unavailable — ignore
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background text-foreground scrollbar-minimal w-full">
      <div className="p-6 sm:p-8 space-y-7 max-w-5xl mx-auto w-full">
        {/* 1. Breadcrumb Back Button */}
        <div>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <ArrowLeft className="size-3.5" />
            <span>All Apps</span>
          </button>
        </div>

        {/* 2. App Header Card */}
        <div className="bg-card border border-border rounded-md p-5 sm:p-6 space-y-4">
          {/* Top Section: App Icon + Title + Action Buttons */}
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0 flex-1">
              <div className="size-12 sm:size-14 shrink-0 flex items-center justify-center rounded-sm bg-background border border-border p-2">
                <ServerIcon
                  serverName={server.name}
                  serverUrl={server.url}
                  icon={server.icon || (server as any).icon}
                  size={36}
                />
              </div>

              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-base font-semibold text-foreground truncate">
                    {server.name}
                  </h1>
                  {isConnected && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-emerald-500 border border-emerald-500/40 px-2 py-0.5 rounded-sm shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Active
                    </span>
                  )}
                  {(connStatus === "FAILED" || (Boolean(stored?.error || server.error) && !isConnected)) && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-destructive border border-destructive/40 px-2 py-0.5 rounded-sm shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                      Failed
                    </span>
                  )}
                </div>

                {server.description && (
                  <div className="prose prose-sm dark:prose-invert max-w-full text-xs leading-relaxed text-muted-foreground pt-0.5 [&>p]:mb-1.5 [&>p:last-child]:mb-0">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {server.description}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons & Server Enable/Disable Toggle */}
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {isConnected && (
                <>
                  {/* Segmented Access On / Access Off Toggle */}
                  <SimpleTooltip
                    open={Boolean(enableError) ? true : undefined}
                    content={enableError}
                    side="top"
                    className="text-xs text-destructive bg-card border border-destructive/40 shadow-md font-mono"
                  >
                    <div
                      className={cn(
                        "inline-flex items-center h-8 p-0.5 rounded-sm border transition-colors select-none text-xs font-mono",
                        enableError
                          ? "border-destructive/60 bg-destructive/5"
                          : "border-border bg-muted/80"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => !isServerEnabled && handleToggleEnabled(true)}
                        className={cn(
                          "h-full px-2.5 rounded-xs transition-all flex items-center justify-center cursor-pointer",
                          isServerEnabled
                            ? "bg-background text-foreground font-semibold shadow-xs border border-border"
                            : "text-muted-foreground/60 hover:text-foreground"
                        )}
                        aria-label="Turn AI tool access on"
                        aria-pressed={isServerEnabled}
                      >
                        <span>Access On</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => isServerEnabled && handleToggleEnabled(false)}
                        className={cn(
                          "h-full px-2.5 rounded-xs transition-all flex items-center justify-center cursor-pointer",
                          !isServerEnabled
                            ? "bg-background text-foreground font-semibold shadow-xs border border-border"
                            : "text-muted-foreground/60 hover:text-foreground"
                        )}
                        aria-label="Turn AI tool access off"
                        aria-pressed={!isServerEnabled}
                      >
                        <span>Access Off</span>
                      </button>
                    </div>
                  </SimpleTooltip>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setToolAccessOpen(true)}
                    className="h-8 px-3 text-xs font-mono text-muted-foreground hover:text-foreground border border-border rounded-sm cursor-pointer"
                  >
                    <Lock className="size-3 mr-1.5" />
                    <span>Permissions</span>
                  </Button>
                </>
              )}

              {(() => {
                if (isConnected) {
                  return (
                    <Button
                      onClick={handleToggleConnect}
                      disabled={isActionPending}
                      className="h-8 px-4 text-xs font-medium rounded-sm transition-all inline-flex items-center gap-1.5 cursor-pointer bg-card border border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    >
                      Disconnect
                    </Button>
                  );
                }

                if (connStatus === "AUTHENTICATING") {
                  return (
                    <Button
                      onClick={handleToggleConnect}
                      className="h-8 px-4 text-xs font-medium rounded-sm transition-all inline-flex items-center gap-1.5 cursor-pointer bg-card border border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    >
                      Cancel Auth
                    </Button>
                  );
                }

                if (connStatus === "INITIALIZING" || connStatus === "VALIDATING" || connStatus === "CONNECTING" || connStatus === "AUTHENTICATED" || connStatus === "DISCOVERING" || isActionPending) {
                  const label = connStatus === "INITIALIZING"
                    ? "Initializing"
                    : connStatus === "VALIDATING"
                      ? "Validating"
                      : connStatus === "AUTHENTICATED"
                        ? "Authenticated"
                        : connStatus === "DISCOVERING"
                          ? "Discovering"
                          : "Connecting";

                  return (
                    <Button
                      disabled
                      className="h-8 px-4 text-xs font-medium rounded-sm transition-all inline-flex items-center gap-1.5 bg-primary/80 text-primary-foreground cursor-wait"
                    >
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>{label}</span>
                    </Button>
                  );
                }

                return (
                  <Button
                    onClick={handleToggleConnect}
                    className="h-8 px-4 text-xs font-medium rounded-sm transition-all inline-flex items-center gap-1.5 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 min-w-[80px]"
                  >
                    Connect
                  </Button>
                );
              })()}

              {isOwner && (onEdit || onDelete) && (
                <DropdownMenu>
                  <SimpleTooltip content="More options" side="top">
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-card/80 rounded-sm cursor-pointer inline-flex items-center justify-center transition-colors"
                        aria-label="More options"
                      >
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </SimpleTooltip>
                  <DropdownMenuContent align="end" className="w-40 text-xs font-sans">
                    {onEdit && (
                      <DropdownMenuItem
                        onClick={() => onEdit(server)}
                        className="gap-2 cursor-pointer"
                      >
                        <Pencil className="size-3.5" />
                        <span>Edit Server</span>
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <>
                        {onEdit && <DropdownMenuSeparator />}
                        <DropdownMenuItem
                          onClick={() => setDeleteConfirmOpen(true)}
                          className="gap-2 text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                        >
                          <Trash2 className="size-3.5" />
                          <span>Delete Server</span>
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* Bottom Full-Width Metadata Row */}
          {(server.url || (isOwner && (server.createdAt || (server as any).created_at)) || (stored?.updatedAt || stored?.createdAt)) && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-2 text-[11px] font-mono text-muted-foreground/80">
              {server.url && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate max-w-xs sm:max-w-md">
                    {server.url}
                  </span>
                  <SimpleTooltip content={copiedUrl ? "Copied!" : "Copy endpoint"} side="top">
                    <button
                      onClick={handleCopyUrl}
                      className="text-muted-foreground hover:text-foreground p-0.5 rounded-sm cursor-pointer"
                      aria-label="Copy endpoint"
                    >
                      {copiedUrl ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                    </button>
                  </SimpleTooltip>
                </div>
              )}

              {isOwner && (server.createdAt || (server as any).created_at) && (
                <span className="shrink-0">
                  Created on {new Date(server.createdAt || (server as any).created_at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              )}

              {(stored?.updatedAt || stored?.createdAt) && (
                <span className="shrink-0">
                  {isConnected ? "Connected on" : "Last connected on"}{" "}
                  {new Date(stored.updatedAt || stored.createdAt!).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
          )}

          {(stored?.error || server.error) && !isConnected && (
            <div className="mt-2 flex items-start gap-2 rounded-sm border border-destructive/40 p-2.5 text-xs text-destructive">
              <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
              <div className="space-y-0.5 min-w-0">
                <p className="font-semibold font-mono text-[10px] uppercase tracking-wider">Connection Error</p>
                <p className="text-xs text-destructive/90 font-mono break-words leading-relaxed">
                  {stored?.error || server.error}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 4. Categorized Tools Section (Read / Write / Destructive) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold">
              App Capabilities & Tools ({allTools.length})
            </h2>
            {stored?.toolPolicy && stored.toolPolicy.mode !== "all" && (
              <span className="text-[11px] font-mono text-muted-foreground">
                Policy: <span className="text-foreground capitalize">{stored.toolPolicy.mode}</span>
              </span>
            )}
          </div>

          {/* Read Tools Accordion */}
          <div className="bg-card border border-border rounded-md overflow-hidden">
            <button
              onClick={() => setActiveAccordion(activeAccordion === "read" ? null : "read")}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-background/40 transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-2.5">
                <Eye className="size-4 text-sky-400" />
                <span className="text-[13px] font-medium text-foreground">Read Tools</span>
                <span className="text-xs font-mono text-muted-foreground">({groupedTools.Read.length})</span>
              </div>
              {activeAccordion === "read" ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              )}
            </button>

            {activeAccordion === "read" && (
              <div className="p-3 border-t border-border space-y-2 bg-background/50">
                {groupedTools.Read.length === 0 ? (
                  <p className="text-xs text-muted-foreground font-mono p-2">No read tools discovered</p>
                ) : (
                  groupedTools.Read.map((tool) => (
                    <ToolRow
                      key={tool.name}
                      tool={tool}
                      category="Read"
                      isAllowed={isToolAllowed(tool)}
                      isExpanded={expandedToolName === tool.name}
                      onToggleExpand={() =>
                        setExpandedToolName(expandedToolName === tool.name ? null : tool.name)
                      }
                      onTest={onTestTool}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          {/* Write Tools Accordion */}
          <div className="bg-card border border-border rounded-md overflow-hidden">
            <button
              onClick={() => setActiveAccordion(activeAccordion === "write" ? null : "write")}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-background/40 transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-2.5">
                <Edit3 className="size-4 text-amber-400" />
                <span className="text-[13px] font-medium text-foreground">Write Tools</span>
                <span className="text-xs font-mono text-muted-foreground">({groupedTools.Write.length})</span>
              </div>
              {activeAccordion === "write" ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              )}
            </button>

            {activeAccordion === "write" && (
              <div className="p-3 border-t border-border space-y-2 bg-background/50">
                {groupedTools.Write.length === 0 ? (
                  <p className="text-xs text-muted-foreground font-mono p-2">No write tools discovered</p>
                ) : (
                  groupedTools.Write.map((tool) => (
                    <ToolRow
                      key={tool.name}
                      tool={tool}
                      category="Write"
                      isAllowed={isToolAllowed(tool)}
                      isExpanded={expandedToolName === tool.name}
                      onToggleExpand={() =>
                        setExpandedToolName(expandedToolName === tool.name ? null : tool.name)
                      }
                      onTest={onTestTool}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          {/* Destructive Tools Accordion */}
          <div className="bg-card border border-border rounded-md overflow-hidden">
            <button
              onClick={() => setActiveAccordion(activeAccordion === "destructive" ? null : "destructive")}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-background/40 transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="size-4 text-rose-400" />
                <span className="text-[13px] font-medium text-foreground">Destructive Tools</span>
                <span className="text-xs font-mono text-muted-foreground">({groupedTools.Destructive.length})</span>
              </div>
              {activeAccordion === "destructive" ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              )}
            </button>

            {activeAccordion === "destructive" && (
              <div className="p-3 border-t border-border space-y-2 bg-background/50">
                {groupedTools.Destructive.length === 0 ? (
                  <p className="text-xs text-muted-foreground font-mono p-2">No destructive tools discovered</p>
                ) : (
                  groupedTools.Destructive.map((tool) => (
                    <ToolRow
                      key={tool.name}
                      tool={tool}
                      category="Destructive"
                      isAllowed={isToolAllowed(tool)}
                      isExpanded={expandedToolName === tool.name}
                      onToggleExpand={() =>
                        setExpandedToolName(expandedToolName === tool.name ? null : tool.name)
                      }
                      onTest={onTestTool}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* 5. Additional Capabilities: Prompts & Resources (if any) */}
        {(prompts.length > 0 || resources.length > 0 || resourceTemplates.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {prompts.length > 0 && (
              <div className="bg-card border border-border rounded-md p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="size-4 text-primary" />
                  <h3 className="text-xs font-mono uppercase tracking-wider font-semibold text-foreground">
                    Prompts ({prompts.length})
                  </h3>
                </div>
                <div className="space-y-2">
                  {prompts.map((p: any) => (
                    <div key={p.name} className="p-2.5 bg-background border border-border rounded-sm space-y-1">
                      <p className="text-xs font-mono font-medium text-foreground">{p.name}</p>
                      {p.description && (
                        <p className="text-[11px] text-muted-foreground">{p.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(resources.length > 0 || resourceTemplates.length > 0) && (
              <div className="bg-card border border-border rounded-md p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Database className="size-4 text-primary" />
                  <h3 className="text-xs font-mono uppercase tracking-wider font-semibold text-foreground">
                    Resources & Templates ({resources.length + resourceTemplates.length})
                  </h3>
                </div>
                <div className="space-y-2">
                  {resources.map((r: any) => (
                    <div key={r.uri} className="p-2.5 bg-background border border-border rounded-sm space-y-1">
                      <p className="text-xs font-mono font-medium text-foreground truncate">{r.name || r.uri}</p>
                      <p className="text-[11px] font-mono text-muted-foreground truncate">{r.uri}</p>
                    </div>
                  ))}
                  {resourceTemplates.map((rt: any) => (
                    <div key={rt.uriTemplate} className="p-2.5 bg-background border border-border rounded-sm space-y-1">
                      <p className="text-xs font-mono font-medium text-foreground truncate">{rt.name || rt.uriTemplate}</p>
                      <p className="text-[11px] font-mono text-muted-foreground truncate">{rt.uriTemplate}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tool Policy Permissions Dialog */}
        {toolAccessOpen && (
          <ToolAccessDialog
            server={server}
            connection={stored}
            open={toolAccessOpen}
            onOpenChange={setToolAccessOpen}
          />
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent className="w-[calc(100vw-2rem)] max-w-sm border-border bg-card p-5 text-foreground shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-sm font-semibold">Delete Server</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-1">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Are you sure you want to delete <span className="font-semibold text-foreground">{server.name}</span>? This will permanently remove this MCP server from your account.
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isDeleting}
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="h-8 px-3 text-xs cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={isDeleting}
                  onClick={handleDeleteServer}
                  className="h-8 px-3.5 text-xs cursor-pointer"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="size-3 mr-1.5 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    "Delete"
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function ToolRow({
  tool,
  category,
  isAllowed = true,
  isExpanded,
  onToggleExpand,
  onTest,
}: {
  tool: ToolInfo;
  category: ToolCategory;
  isAllowed?: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onTest?: (toolName: string) => void;
}) {
  return (
    <div
      className={cn(
        "bg-card border border-border rounded-sm p-3 transition-colors space-y-2",
        !isAllowed && "opacity-60"
      )}
    >
      {/* Top row: Tool Name + Category/Blocked badges on left, Test + Schema buttons on right */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-xs font-mono font-semibold text-foreground break-all">
            {tool.name}
          </span>
          <span
            className={cn(
              "text-[10px] font-mono px-1.5 py-0.5 rounded-xs border shrink-0",
              category === "Read"
                ? "text-sky-400 border-sky-800/40"
                : category === "Write"
                  ? "text-amber-400 border-amber-800/40"
                  : "text-rose-400 border-rose-800/40"
            )}
          >
            {category}
          </span>
          {!isAllowed && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-xs border text-rose-400 border-rose-800/40 shrink-0">
              Blocked
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {onTest && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onTest(tool.name)}
              className="h-6 px-2 text-[11px] font-mono text-muted-foreground hover:text-foreground border border-border rounded-sm cursor-pointer"
            >
              <Play className="size-2.5 mr-1" />
              <span>Test</span>
            </Button>
          )}
          <button
            onClick={onToggleExpand}
            className="text-[11px] font-mono text-muted-foreground hover:text-foreground p-1 rounded-sm cursor-pointer"
          >
            {isExpanded ? "Hide Schema" : "Schema"}
          </button>
        </div>
      </div>

      {/* Description - Full width below header */}
      {tool.description && (
        <p className="text-[11px] text-muted-foreground leading-relaxed break-words">
          {tool.description}
        </p>
      )}

      {isExpanded && Boolean(tool.inputSchema) && (
        <div className="pt-2 border-t border-border">
          <pre className="p-2.5 bg-background rounded-sm border border-border text-[11px] font-mono text-foreground overflow-x-auto max-w-full">
            {JSON.stringify(tool.inputSchema, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
