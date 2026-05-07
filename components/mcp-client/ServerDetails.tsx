"use client";

import { useState, useMemo } from "react";
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
} from "lucide-react";
import { McpServer } from "@/types/mcp";
import { ServerIcon } from "@/components/common/ServerIcon";
import ServerManagement from "./ServerManagement";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
}

export function ServerDetails({
  server,
  session,
  userSession,
  onAction,
  onEdit,
  onDelete,
}: ServerDetailsProps) {
  const [urlCopied, setUrlCopied] = useState(false);

  const connections = useMcpStore((s) => s.connections);
  const stored = useMemo(
    () => findConnectionForServer(connections, server),
    [connections, server.id, server.url]
  );

  const connectionStatus =
    stored?.connectionStatus ?? server.connectionStatus ?? "DISCONNECTED";
  const isConnected = connectionStatus?.toUpperCase() === "READY";

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
    <div className="p-4 sm:p-6 border-b border-border">
      <div className="flex flex-col gap-4">
        {/* Header with title and actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ServerIcon
              serverName={server.name}
              serverUrl={server.url}
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
              {server.id && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium whitespace-nowrap">ID:</span>
                  <code
                    className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono truncate flex-1 min-w-0"
                    title={server.id}
                  >
                    {server.id}
                  </code>
                </div>
              )}

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
                <Badge
                  variant={
                    isConnected
                      ? "default"
                      : "secondary"
                  }
                  className="text-[10px] px-1.5 py-0"
                >
                  {connectionStatus}
                </Badge>
              </div>
              {server.url && (
                <div className="flex items-center gap-2 text-xs">
                  <Link2
                    className="h-3.5 w-3.5 text-muted-foreground shrink-0"
                    aria-hidden
                  />
                  <code
                    className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono truncate flex-1 min-w-0"
                    title={server.url}
                  >
                    {server.url}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
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
                <div
                  className="flex items-center gap-2 text-muted-foreground"
                  title={`Last connected ${new Date(stored.connectedAt).toLocaleString()}`}
                >
                  <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="text-xs">
                    {new Date(stored.connectedAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
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
  );
}
