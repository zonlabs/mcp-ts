"use client";

import React, { useState, useMemo } from "react";
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
  AlertTriangle,
  Play,
  Copy,
  Check,
  Info,
  Plug,
} from "lucide-react";
import { McpServer, ToolInfo } from "@/types/mcp";
import { UserSession } from "@/components/providers/AuthProvider";
import { ServerIcon } from "@/components/common/ServerIcon";
import { useMcpStore, findConnectionForServer } from "@/lib/stores/mcp-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ToolAccessDialog } from "./ToolAccessDialog";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";

interface AppDetailViewProps {
  server: McpServer;
  userSession: UserSession | null;
  onBack: () => void;
  onAction: (server: McpServer, action: "activate" | "deactivate") => Promise<unknown>;
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
  onTestTool,
}: AppDetailViewProps) {
  const connections = useMcpStore((s) => s.connections);
  const updateSession = useMcpStore((s) => s.mcpActions?.updateSession);
  const stored = useMemo(
    () => findConnectionForServer(connections, server),
    [connections, server]
  );

  const [activeAccordion, setActiveAccordion] = useState<string | null>("read");
  const [expandedToolName, setExpandedToolName] = useState<string | null>(null);
  const [toolAccessOpen, setToolAccessOpen] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);
  const [isTogglingEnabled, setIsTogglingEnabled] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const isConnected = Boolean(
    stored &&
      (stored.connectionStatus?.toUpperCase() === "READY" ||
        stored.connectionStatus?.toUpperCase() === "CONNECTED")
  );
  const isServerEnabled = stored ? stored.enabled !== false : true;

  const allTools: ToolInfo[] = stored?.tools ?? server.tools ?? [];
  const prompts = stored?.prompts ?? server.prompts ?? [];
  const resources = stored?.resources ?? server.resources ?? [];
  const resourceTemplates = stored?.resourceTemplates ?? [];

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
      } else {
        await onAction(server, "activate");
        toast.success(`Connected to ${server.name}`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to update connection");
    } finally {
      setIsActionPending(false);
    }
  };

  const handleToggleEnabled = async (checked: boolean) => {
    if (!stored?.sessionId || !updateSession) {
      toast.error("Active session required to toggle AI access");
      return;
    }
    setIsTogglingEnabled(true);
    try {
      await updateSession(stored.sessionId, checked);
      toast.success(checked ? `${server.name} enabled for AI` : `${server.name} disabled for AI`);
    } catch (err: any) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle server state");
    } finally {
      setIsTogglingEnabled(false);
    }
  };

  const handleCopyUrl = async () => {
    if (!server.url) return;
    try {
      await navigator.clipboard.writeText(server.url);
      setCopiedUrl(true);
      toast.success("Server endpoint copied");
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      toast.error("Failed to copy URL");
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
        <div className="bg-card border border-border rounded-md p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-6">
          <div className="flex items-start gap-4 min-w-0">
            <div className="size-14 shrink-0 flex items-center justify-center rounded-sm bg-background border border-border p-2">
              <ServerIcon
                serverName={server.name}
                serverUrl={server.url}
                size={36}
              />
            </div>

            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-medium tracking-tight text-foreground font-sans">
                  {server.name}
                </h1>
                {isConnected ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground border border-border px-2 py-0.5 rounded-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                    Inactive
                  </span>
                )}
                {isConnected && !isServerEnabled && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-amber-400 border border-amber-500/40 px-2 py-0.5 rounded-sm">
                    AI Off
                  </span>
                )}
              </div>

              <div className="prose prose-sm dark:prose-invert max-w-full text-xs leading-relaxed text-muted-foreground [&>p]:mb-1.5 [&>p:last-child]:mb-0 [&>ul]:mt-1 [&>ol]:mt-1 [&>h1]:text-sm [&>h2]:text-xs [&>h3]:text-xs [&>code]:text-[11px] [&>code]:font-mono">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {server.description || ""}
                </ReactMarkdown>
              </div>

              {server.url && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[11px] font-mono text-muted-foreground/80 truncate max-w-xs sm:max-w-md">
                    {server.url}
                  </span>
                  <button
                    onClick={handleCopyUrl}
                    className="text-muted-foreground hover:text-foreground p-0.5 rounded-sm cursor-pointer"
                    title="Copy endpoint"
                  >
                    {copiedUrl ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons & Server Enable/Disable Toggle */}
          <div className="shrink-0 flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {isConnected && (
              <>
                <div className="flex items-center gap-2 px-2.5 h-8 rounded-sm border border-border bg-card">
                  <Switch
                    checked={isServerEnabled}
                    onCheckedChange={handleToggleEnabled}
                    disabled={isTogglingEnabled}
                    id="server-enabled-toggle"
                    aria-label={isServerEnabled ? "Disable server for AI" : "Enable server for AI"}
                  />
                  <label
                    htmlFor="server-enabled-toggle"
                    className="text-xs font-mono text-muted-foreground cursor-pointer select-none"
                  >
                    {isServerEnabled ? "Enabled" : "Disabled"}
                  </label>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setToolAccessOpen(true)}
                  className="h-8 px-3 text-xs font-mono text-muted-foreground hover:text-foreground border border-border rounded-sm"
                >
                  <Lock className="size-3 mr-1.5" />
                  <span>Permissions</span>
                </Button>
              </>
            )}

            <Button
              onClick={handleToggleConnect}
              disabled={isActionPending}
              className={cn(
                "h-8 px-4 text-xs font-medium rounded-sm transition-all",
                isConnected
                  ? "bg-card border border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              {isActionPending ? (
                <RefreshCw className="size-3.5 animate-spin mr-1.5" />
              ) : isConnected ? (
                "Disconnect"
              ) : (
                "Connect"
              )}
            </Button>
          </div>
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
                  {prompts.map((p) => (
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
                  {resources.map((r) => (
                    <div key={r.uri} className="p-2.5 bg-background border border-border rounded-sm space-y-1">
                      <p className="text-xs font-mono font-medium text-foreground truncate">{r.name || r.uri}</p>
                      <p className="text-[11px] font-mono text-muted-foreground truncate">{r.uri}</p>
                    </div>
                  ))}
                  {resourceTemplates.map((rt) => (
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
    <div className={cn(
      "bg-card border border-border rounded-sm p-3 transition-colors space-y-2",
      !isAllowed && "opacity-60"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-semibold text-foreground">
              {tool.name}
            </span>
            <span
              className={cn(
                "text-[10px] font-mono px-1.5 py-0.2 rounded-xs border",
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
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-xs border text-rose-400 border-rose-800/40">
                Blocked
              </span>
            )}
          </div>
          {tool.description && (
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {tool.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onTest && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onTest(tool.name)}
              className="h-6 px-2 text-[11px] font-mono text-muted-foreground hover:text-foreground border border-border rounded-sm"
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

      {isExpanded && Boolean(tool.inputSchema) && (
        <div className="pt-2 border-t border-border">
          <pre className="p-2.5 bg-background rounded-sm border border-border text-[11px] font-mono text-body overflow-x-auto">
            {JSON.stringify(tool.inputSchema, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
