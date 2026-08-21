"use client";

import { useState, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Server,
  Activity,
  Calendar,
  User as UserIcon,
  Globe,
  Shield,
  Lock,
  LockOpen,
  Copy,
  Check,
  Clock,
  Link2,
  Terminal,
  MessageSquare,
  Database,
  ChevronDown,
  Info,
} from "lucide-react";
import { McpServer } from "@/types/mcp";
import { ServerIcon } from "@/components/common/ServerIcon";
import ServerManagement from "./ServerManagement";
import { ToolAccessDialog } from "./ToolAccessDialog";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { UserSession } from "@/components/providers/AuthProvider";
import { findConnectionForServer } from "@/lib/mcp/connection-utils";
import { useMcpContext } from "@/components/providers/McpProvider";

interface ServerDetailsProps {
  server: McpServer;
  session: UserSession | null;
  userSession?: UserSession | null;
  onAction: (
    server: McpServer,
    action: "activate" | "deactivate"
  ) => Promise<unknown>;
  onEdit?: (server: McpServer) => void;
  onDelete?: (serverId: string) => void;
  toolTesterOpen?: boolean;
  onToggleTools?: () => void;
  onToolClick?: (toolName: string) => void;
}

type ToolBadge = "Read" | "Write" | "Destructive" | "Idempotent";

function classifyTool(tool: { name: string; description?: string; annotations?: unknown }): ToolBadge {
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

export function ServerDetails({
  server,
  session,
  userSession,
  onAction,
  onEdit,
  onDelete,
  toolTesterOpen,
  onToggleTools,
  onToolClick,
}: ServerDetailsProps) {
  const [urlCopied, setUrlCopied] = useState(false);
  const [toolAccessOpen, setToolAccessOpen] = useState(false);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [templateParams, setTemplateParams] = useState<Record<string, string>>({});
  const [templateResourceContent, setTemplateResourceContent] = useState<string | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateMimeType, setTemplateMimeType] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState("tools");
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [expandedResource, setExpandedResource] = useState<string | null>(null);
  const [resourceContents, setResourceContents] = useState<Record<string, { text?: string; mimeType?: string }>>({});
  const [loadingResource, setLoadingResource] = useState<string | null>(null);

  const { connections, readResource } = useMcpContext();
  const stored = useMemo(
    () => findConnectionForServer(connections, server),
    [connections, server.id, server.url]
  );

  const connectionStatus =
    stored?.state ?? server.connectionStatus ?? "DISCONNECTED";
  const isConnected = connectionStatus?.toUpperCase() === "READY";
  const isFailed = ["ERROR", "FAILED"].includes(connectionStatus?.toUpperCase() ?? "");
  const lastConnectedDate = stored?.updatedAt || stored?.createdAt;
  const lastConnectedLabel = lastConnectedDate
    ? new Date(lastConnectedDate).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  const statusTooltipText = stored?.error || server.error
    ? stored?.error || server.error
    : [
        `Status: ${connectionStatus}`,
        server.url ? `Target: ${server.url}` : null,
        lastConnectedLabel ? `Last connected: ${lastConnectedLabel}` : null,
      ]
        .filter(Boolean)
        .join("\n");
  const visibleToolCount = stored?.tools?.length ?? server.tools?.length ?? 0;
  const accessSummary = stored?.toolPolicy?.mode === "allowlist"
    ? `${visibleToolCount} tools allowed`
    : stored?.toolPolicy?.mode === "denylist"
      ? `${stored.toolPolicy.toolIds.length} tools denied`
      : "All tools allowed";

  const prompts = stored?.prompts ?? server.prompts;
  const resources = stored?.resources ?? server.resources;
  const resourceTemplates = stored?.resourceTemplates;
  const allTools = stored?.tools ?? server.tools ?? [];

  const tabs = [
    { id: "tools" as const, label: "Tools", count: allTools.length, icon: Terminal },
    { id: "prompts" as const, label: "Prompts", count: prompts?.length ?? 0, icon: MessageSquare },
    { id: "resources" as const, label: "Resources", count: resources?.length ?? 0, icon: Database },
    { id: "templates" as const, label: "Templates", count: resourceTemplates?.length ?? 0, icon: Database },
  ].filter((t) => t.count > 0);

  const handleReadResource = async (uri: string) => {
    if (loadingResource) return;
    if (expandedResource === uri) {
      setExpandedResource(null);
      return;
    }
    setLoadingResource(uri);
    try {
      if (!stored?.sessionId || !readResource) return;
      const result = await readResource(stored.sessionId, uri);
      const contents = (result as any)?.contents;
      if (contents?.[0]) {
        setResourceContents((prev) => ({
          ...prev,
          [uri]: { text: contents[0].text, mimeType: contents[0].mimeType },
        }));
      }
      setExpandedResource(uri);
    } catch {
      setResourceContents((prev) => ({
        ...prev,
        [uri]: { text: "Failed to read resource" },
      }));
      setExpandedResource(uri);
    } finally {
      setLoadingResource(null);
    }
  };

  const extractTemplateVars = useCallback((uriTemplate: string): string[] => {
    const vars: string[] = [];
    const regex = /\{([^}]+)\}/g;
    let match;
    while ((match = regex.exec(uriTemplate)) !== null) {
      vars.push(match[1]);
    }
    return vars;
  }, []);

  const substituteTemplate = useCallback((uriTemplate: string, params: Record<string, string>): string => {
    return uriTemplate.replace(/\{([^}]+)\}/g, (_, key) => params[key] || `{${key}}`);
  }, []);

  const handleReadTemplate = async (uriTemplate: string) => {
    if (templateLoading) return;
    setTemplateLoading(true);
    setTemplateResourceContent(null);
    setTemplateMimeType(undefined);
    try {
      const uri = substituteTemplate(uriTemplate, templateParams);
      if (!stored?.sessionId || !readResource) return;
      const result = await readResource(stored.sessionId, uri);
      const contents = (result as any)?.contents;
      setTemplateResourceContent(contents?.[0]?.text ?? "(empty)");
      setTemplateMimeType(contents?.[0]?.mimeType);
    } catch {
      setTemplateResourceContent("Failed to read resource");
    } finally {
      setTemplateLoading(false);
    }
  };

  const addedAtSource = server.createdAt || server.updated_at;

  const handleCopyUrl = () => {
    if (server.url) {
      navigator.clipboard.writeText(server.url);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    }
  };

  const isStaff = userSession?.role === "staff";
  const myId = session?.user?.id;
  const isMine = Boolean(myId && server.owner && server.owner === myId);
  const canEdit = isStaff || !(server.isPublic && server.owner !== myId);
  const canDelete = isStaff || !(server.isPublic && server.owner !== myId);

  return (
    <>
      <div className="p-4 sm:p-6">
      <div className="flex flex-col gap-4">
        {/* Header with title and actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ServerIcon
              serverName={server.name}
              serverUrl={server.url}
              icon={server.icon}
              size={32}
              className="flex-shrink-0"
            />
            <h2 className="text-base sm:text-2xl font-semibold">{server.name}</h2>
          </div>

          <div className="flex items-center gap-2">
            <ServerManagement
              server={{ ...server, connectionStatus }}
              onAction={onAction}
              onEdit={canEdit ? onEdit : undefined}
              onDelete={canDelete ? onDelete : undefined}
              onToggleTools={isConnected && onToggleTools ? onToggleTools : undefined}
              toolTesterOpen={toolTesterOpen}
              onManageAccess={isConnected && stored ? () => setToolAccessOpen(true) : undefined}
              toolAccessSummary={accessSummary}
            />
          </div>
        </div>

        {/* Description - Full Width */}
        {server.description && (
          <div className="text-sm prose prose-sm max-w-none [&>*]:text-foreground/80 [&>p]:text-foreground/75 [&_strong]:font-bold [&_strong]:text-foreground dark:[&_strong]:text-white [&>em]:italic [&>em]:text-foreground/80 [&>code]:bg-muted [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:rounded [&>code]:text-sm [&>code]:text-foreground/90 [&>a]:text-primary [&>a]:underline [&>a]:underline-offset-2 hover:[&>a]:text-primary/80 [&>ul]:text-foreground/75 [&>ol]:text-foreground/75 [&>li]:text-foreground/75">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {server.description}
            </ReactMarkdown>
          </div>
        )}

        {/* Status bar */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div className="flex items-center gap-1.5 cursor-default">
            <span className={cn(
              "h-2 w-2 rounded-full",
              isConnected ? "bg-green-500" : isFailed ? "bg-red-500" : "bg-muted-foreground/50"
            )} />
            <span className={cn(
              "text-xs font-semibold",
              isConnected && "text-green-600 dark:text-green-400",
              isFailed && "text-red-600 dark:text-red-400",
              !isConnected && !isFailed && "text-foreground"
            )}>
              {connectionStatus}
            </span>
          </div>

          <HoverCard openDelay={100} closeDelay={100}>
            <HoverCardTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 cursor-pointer" aria-label="Server details">
                <Info className="h-3.5 w-3.5" />
              </Button>
            </HoverCardTrigger>
            <HoverCardContent side="left" align="start" className="w-72 p-4">
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center gap-2 border-b border-border pb-2">
                  <ServerIcon
                    serverName={server.name}
                    serverUrl={server.url}
                    icon={server.icon}
                    size={18}
                  />
                  <span className="text-sm font-semibold truncate">{server.name}</span>
                </div>

                {/* Basic Info */}
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Basic Info</h4>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <Server className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="font-medium text-foreground">Transport:</span>
                      <span className="text-muted-foreground">{server.transport}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {server.requiresOauth2 ? (
                        <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
                      ) : (
                        <LockOpen className="h-3 w-3 text-muted-foreground shrink-0" />
                      )}
                      <span className="font-medium text-foreground">Server type:</span>
                      {server.requiresOauth2 ? (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Shield className="h-3 w-3 text-amber-500" />
                          OAuth
                        </span>
                      ) : (
                        <span className="text-blue-600 dark:text-blue-400 font-medium">Open</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Connection */}
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Connection</h4>
                  <div className="space-y-1">
                    {server.url && (
                      <div className="flex items-center gap-2 text-xs min-w-0">
                        <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
                        <code className="bg-muted px-1 rounded text-[10px] font-mono truncate flex-1 min-w-0">{server.url}</code>
                        <button onClick={handleCopyUrl} className="shrink-0 hover:text-foreground text-muted-foreground">
                          {urlCopied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs">
                      <Activity className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="font-medium text-foreground">Status:</span>
                      <Badge variant={isConnected ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                        {connectionStatus}
                      </Badge>
                    </div>
                    {lastConnectedDate && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3 shrink-0" />
                        <span className="font-medium text-foreground">Connected at:</span>
                        <span>{lastConnectedLabel}</span>
                      </div>
                    )}
                    {isConnected && !lastConnectedDate && (
                      <p className="text-[10px] text-muted-foreground">Connected — reconnect once to record a "last connected" time.</p>
                    )}
                  </div>
                </div>

                {/* Metadata */}
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Metadata</h4>
                  <div className="space-y-1">
                    {addedAtSource && (
                      <div className="flex items-center gap-2 text-xs">
                        <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="font-medium text-foreground">Added:</span>
                        <span className="text-muted-foreground">
                          {new Date(addedAtSource).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    )}
                    {isMine && (
                      <div className="flex items-center gap-2 text-xs">
                        <UserIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">Added by you</span>
                      </div>
                    )}
                    {server.isPublic !== undefined && (
                      <div className="flex items-center gap-2 text-xs">
                        <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="font-medium text-foreground">Visibility:</span>
                        <span className="text-muted-foreground">
                          {server.isPublic ? "Public" : "Private"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>
      </div>
      </div>

      {tabs.length > 0 && (<>
        <div className="mx-4 sm:mx-6 h-px bg-border border-b" />
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="px-4 sm:px-6 overflow-x-auto">
            <TabsList className="w-full justify-start rounded-none bg-transparent p-0 h-auto flex-nowrap">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-red-500 bg-transparent px-4 py-3 text-xs font-medium data-[state=active]:text-foreground text-muted-foreground hover:text-foreground transition-colors gap-2"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {tab.label}
                    <span className="ml-1 text-[10px] text-muted-foreground">({tab.count})</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <div className="px-4 sm:px-6 py-4">
            {/* Tools */}
            <TabsContent value="tools" className="m-0 space-y-2">
              {allTools.length === 0 ? (
                <p className="text-xs text-muted-foreground">No tools available</p>
              ) : (
                allTools.map((tool) => {
                  const isExpanded = expandedTool === tool.name;
                  const badge = classifyTool(tool);
                  const uiMeta = (tool as any)._meta?.ui as { resourceUri?: string; visibility?: string[] } | undefined;
                  const isApp = uiMeta?.resourceUri?.startsWith("ui://");
                  return (
                    <div key={tool.name}>
                      <button
                        onClick={() => setExpandedTool(isExpanded ? null : tool.name)}
                        className="w-full text-left rounded-lg border border-border/60 p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <code className="text-sm font-medium text-foreground truncate">{tool.name}</code>
                            <Badge variant="outline" className={cn("text-[10px] font-medium px-1.5 py-0.5 h-auto",
                              badge === "Destructive" && "text-red-500 border-red-500/30",
                              badge === "Write" && "text-amber-500 border-amber-500/30",
                              badge === "Read" && "text-emerald-500 border-emerald-500/30",
                              badge === "Idempotent" && "text-blue-500 border-blue-500/30",
                            )}>
                              {badge}
                            </Badge>
                            {isApp && (
                              <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0.5 h-auto text-purple-500 dark:text-purple-400 border-purple-500/30">
                                App
                              </Badge>
                            )}
                          </div>
                          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0", isExpanded && "rotate-180")} />
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-3 pb-3 border border-t-0 border-border/60 rounded-b-lg -mt-px">
                          {tool.description && (
                            <p className="text-xs text-muted-foreground mt-2">{tool.description}</p>
                          )}
                          {tool.inputSchema ? (
                            <div className="mt-2">
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Input Schema</p>
                              <pre className="text-[10px] font-mono bg-muted p-2 rounded overflow-x-auto">{JSON.stringify(tool.inputSchema, null, 2)}</pre>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </TabsContent>

            {/* Prompts */}
            <TabsContent value="prompts" className="m-0 space-y-2">
              {(!prompts || prompts.length === 0) ? (
                <p className="text-xs text-muted-foreground">No prompts available</p>
              ) : (
                prompts.map((prompt) => (
                  <div key={prompt.name} className="rounded-lg border border-border/60 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <code className="text-sm font-medium text-foreground">{prompt.name}</code>
                    </div>
                    {prompt.description && (
                      <p className="text-xs text-muted-foreground mb-2">{prompt.description}</p>
                    )}
                    {prompt.arguments && prompt.arguments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {prompt.arguments.map((arg: any) => (
                          <span
                            key={arg.name}
                            className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground"
                          >
                            {arg.name}
                            {arg.required && <span className="text-red-500">*</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </TabsContent>

            {/* Resources */}
            <TabsContent value="resources" className="m-0 space-y-2">
              {(!resources || resources.length === 0) ? (
                <p className="text-xs text-muted-foreground">No resources available</p>
              ) : (
                resources.map((resource) => {
                  const isExpanded = expandedResource === resource.uri;
                  const content = resourceContents[resource.uri];
                  const isLoading = loadingResource === resource.uri;
                  return (
                    <div key={resource.uri}>
                      <button
                        onClick={() => handleReadResource(resource.uri)}
                        className="w-full text-left rounded-lg border border-border/60 p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <code className="text-sm font-medium text-foreground">{resource.name}</code>
                          <div className="flex items-center gap-2">
                            {resource.mimeType && (
                              <span className="text-[10px] text-muted-foreground font-mono">{resource.mimeType}</span>
                            )}
                            {isLoading ? (
                              <span className="text-[10px] text-muted-foreground animate-pulse">loading...</span>
                            ) : (
                              <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                            )}
                          </div>
                        </div>
                        {resource.description && (
                          <p className="text-xs text-muted-foreground mb-2">{resource.description}</p>
                        )}
                        <div className="text-[10px] text-muted-foreground font-mono truncate">
                          {resource.uri}
                        </div>
                      </button>
                      {isExpanded && content && (
                        <div className="mx-3 mb-2 p-3 rounded-lg bg-muted/40 border border-border/40">
                          {content.mimeType && (
                            <div className="text-[10px] text-muted-foreground font-mono mb-2">{content.mimeType}</div>
                          )}
                          <pre className="text-xs whitespace-pre-wrap break-words font-mono max-h-64 overflow-y-auto">
                            {content.text || "(binary content)"}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </TabsContent>

            {/* Resource Templates */}
            <TabsContent value="templates" className="m-0 space-y-2">
              {(!resourceTemplates || resourceTemplates.length === 0) ? (
                <p className="text-xs text-muted-foreground">No resource templates available</p>
              ) : (
                resourceTemplates.map((template) => {
                  const vars = extractTemplateVars(template.uriTemplate);
                  const isExpanded = expandedTemplate === template.uriTemplate;
                  return (
                    <div key={template.uriTemplate} className="rounded-lg border border-border/60">
                      <button
                        onClick={() => setExpandedTemplate(isExpanded ? null : template.uriTemplate)}
                        className="w-full text-left p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <code className="text-sm font-medium text-foreground">{template.name}</code>
                          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform flex-shrink-0", isExpanded && "rotate-180")} />
                        </div>
                        {template.description && (
                          <p className="text-xs text-muted-foreground mb-2">{template.description}</p>
                        )}
                        <div className="text-[10px] text-muted-foreground font-mono">{template.uriTemplate}</div>
                      </button>
                      {isExpanded && vars.length > 0 && (
                        <div className="px-3 pb-3 space-y-2">
                          {vars.map((v) => (
                            <div key={v}>
                              <label className="text-[10px] font-mono text-muted-foreground block mb-1">{v}</label>
                              <Input
                                value={templateParams[v] || ""}
                                onChange={(e) => setTemplateParams((p) => ({ ...p, [v]: e.target.value }))}
                                placeholder={`Enter ${v}`}
                                className="h-7 text-xs"
                              />
                            </div>
                          ))}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleReadTemplate(template.uriTemplate)}
                              disabled={templateLoading || vars.some((v) => !templateParams[v])}
                              className="h-7 text-xs"
                            >
                              {templateLoading ? "Loading..." : "Read"}
                            </Button>
                          </div>
                        </div>
                      )}
                      {isExpanded && templateResourceContent && (
                        <div className="mx-3 mb-3 p-3 rounded-lg bg-muted/40 border border-border/40">
                          {templateMimeType && (
                            <div className="text-[10px] text-muted-foreground font-mono mb-2">{templateMimeType}</div>
                          )}
                          <pre className="text-xs whitespace-pre-wrap break-words font-mono max-h-64 overflow-y-auto">
                            {templateResourceContent}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </TabsContent>
          </div>
        </Tabs>
      </>)}

      <ToolAccessDialog
        server={server}
        connection={stored}
        open={toolAccessOpen}
        onOpenChange={setToolAccessOpen}
      />
    </>
  );
}

