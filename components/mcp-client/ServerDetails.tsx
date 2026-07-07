"use client";

import { useState, useMemo, useEffect } from "react";
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
} from "lucide-react";
import { McpServer } from "@/types/mcp";
import { ServerIcon } from "@/components/common/ServerIcon";
import ServerManagement from "./ServerManagement";
import { ToolAccessDialog } from "./ToolAccessDialog";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserSession } from "@/components/providers/AuthProvider";
import { useMcpStore, findConnectionForServer } from "@/lib/stores/mcp-store";

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
}: ServerDetailsProps) {
  const [urlCopied, setUrlCopied] = useState(false);
  const [toolAccessOpen, setToolAccessOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("tools");
  const [expandedResource, setExpandedResource] = useState<string | null>(null);
  const [resourceContents, setResourceContents] = useState<Record<string, { text?: string; mimeType?: string }>>({});
  const [loadingResource, setLoadingResource] = useState<string | null>(null);

  const connections = useMcpStore((s) => s.connections);
  const stored = useMemo(
    () => findConnectionForServer(connections, server),
    [connections, server.id, server.url]
  );

  const connectionStatus =
    stored?.connectionStatus ?? server.connectionStatus ?? "DISCONNECTED";
  const isConnected = connectionStatus?.toUpperCase() === "READY";
  const lastConnectedLabel = stored?.connectedAt
    ? new Date(stored.connectedAt).toLocaleString("en-US", {
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
  const allTools = stored?.tools ?? server.tools ?? [];

  const tabs = [
    { id: "tools" as const, label: "Tools", count: allTools.length, icon: Terminal },
    { id: "prompts" as const, label: "Prompts", count: prompts?.length ?? 0, icon: MessageSquare },
    { id: "resources" as const, label: "Resources", count: resources?.length ?? 0, icon: Database },
  ].filter((t) => t.count > 0);

  const mcpActions = useMcpStore((s) => s.mcpActions);
  const fetchConnectionCapabilities = useMcpStore((s) => s.fetchConnectionCapabilities);

  const handleReadResource = async (uri: string) => {
    if (loadingResource) return;
    if (expandedResource === uri) {
      setExpandedResource(null);
      return;
    }
    setLoadingResource(uri);
    try {
      if (!stored?.sessionId || !mcpActions?.readResource) return;
      const result = await mcpActions.readResource(stored.sessionId, uri);
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

  useEffect(() => {
    if (isConnected && stored?.sessionId && !stored?.prompts && !stored?.resources) {
      fetchConnectionCapabilities(stored.sessionId);
    }
  }, [isConnected, stored?.sessionId, stored?.prompts, stored?.resources, fetchConnectionCapabilities]);

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
      <div className="p-4 sm:p-6 border-b border-border">
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
            <h2 className="text-xl sm:text-2xl font-semibold">{server.name}</h2>
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

        {/* Server Information Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-border">
          {/* Basic Info */}
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground">
              Basic Information
            </h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <Server className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">Transport:</span>
                <span className="text-muted-foreground">{server.transport}</span>
              </div>

              <div className="flex items-center gap-2 text-xs">
                {server.requiresOauth2 ? (
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <LockOpen className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="font-medium">Server type:</span>
                {server.requiresOauth2 ? (
                  <div className="flex items-center gap-1">
                    <Shield className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-muted-foreground">OAuth</span>
                  </div>
                ) : (
                  <span className="text-blue-600 dark:text-blue-400 font-medium">
                    Open
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Connection Details */}
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground">
              Connection Details
            </h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">Status:</span>
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <span>
                      <Badge
                        variant={isConnected ? "default" : "secondary"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {connectionStatus}
                      </Badge>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs whitespace-pre-wrap break-words">
                    {statusTooltipText}
                  </TooltipContent>
                </Tooltip>
              </div>
              {server.url && (
                <div className="flex items-center gap-2 text-xs">
                  <Link2
                    className="h-3.5 w-3.5 text-muted-foreground shrink-0"
                    aria-hidden
                  />
                  <Tooltip delayDuration={100}>
                    <TooltipTrigger asChild>
                      <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono truncate flex-1 min-w-0">
                        {server.url}
                      </code>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs break-all">
                      {server.url}
                    </TooltipContent>
                  </Tooltip>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={urlCopied ? "URL copied" : "Copy server URL"}
                    onClick={handleCopyUrl}
                    className="h-5 w-5 p-0 hover:bg-accent cursor-pointer flex-shrink-0"
                  >
                    {urlCopied ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              )}
              {stored?.connectedAt && (
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="text-xs">{lastConnectedLabel}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {`Last connected ${lastConnectedLabel}`}
                  </TooltipContent>
                </Tooltip>
              )}
              {isConnected && !stored?.connectedAt && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>Connected — reconnect once to record a &quot;last connected&quot; time.</span>
                </div>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground">
              Metadata
            </h3>
            <div className="space-y-2">
              {addedAtSource && (
                <div className="flex items-center gap-2 text-xs">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">Added on:</span>
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
                  <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Added by you</span>
                </div>
              )}
              {server.isPublic !== undefined && (
                <div className="flex items-center gap-2 text-xs">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">Visibility:</span>
                  <span className="text-muted-foreground">
                    {server.isPublic ? "Public Server" : "Private Server"}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>

      {tabs.length > 0 && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="border-b border-border">
          <div className="px-4 sm:px-6">
            <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent p-0 h-auto">
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
                allTools.map((tool) => (
                  <div key={tool.name} className="rounded-lg border border-border/60 p-3">
                    <code className="text-sm font-medium text-foreground">{tool.name}</code>
                    {tool.description && (
                      <p className="text-xs text-muted-foreground mt-1">{tool.description}</p>
                    )}
                  </div>
                ))
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
                        {prompt.arguments.map((arg) => (
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
          </div>
        </Tabs>
      )}

      <ToolAccessDialog
        server={server}
        connection={stored}
        open={toolAccessOpen}
        onOpenChange={setToolAccessOpen}
      />
    </>
  );
}

