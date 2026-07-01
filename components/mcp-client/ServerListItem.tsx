"use client";

import { Shield, Edit, Trash2 } from "lucide-react";
import { McpServer } from "@/types/mcp";
import { ServerIcon } from "@/components/common/ServerIcon";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ServerListItemProps {
  server: McpServer;
  isSelected: boolean;
  onClick: () => void;
  onEdit?: (server: McpServer) => void;
  onDelete?: (serverId: string) => void;
  showActions?: boolean;
}

export function ServerListItem({
  server,
  isSelected,
  onClick,
  onEdit,
  onDelete,
  showActions = false,
}: ServerListItemProps) {
  const getStatusColor = (status?: string | null) => {
    const upperStatus = status?.toUpperCase();
    if (upperStatus === "READY") return "bg-green-500 animate-pulse";
    if (upperStatus === "FAILED") return "bg-red-500";
    if (upperStatus === "VALIDATING" || upperStatus === "CONNECTING" || upperStatus === "DISCOVERING" || upperStatus === "INITIALIZING") {
      return "bg-yellow-500 animate-pulse";
    }
    return "hidden";
  };

  return (
    <div
      className={`group relative border-b border-border last:border-b-0 ${showActions ? "" : "px-1 py-0.5"}`}
    >
      {/* Action Buttons (for user servers) */}
      {showActions && onEdit && onDelete && (
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col gap-1 z-10">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Edit ${server.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(server);
            }}
            className="h-6 w-6 p-0 bg-background/90 hover:bg-accent shadow-sm cursor-pointer border"
          >
            <Edit className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Delete ${server.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(server.id);
            }}
            className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 bg-background/90 shadow-sm cursor-pointer border"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}

      <div
        className={`cursor-pointer transition-[background-color,border-color,box-shadow] duration-200 relative ${showActions
          ? `p-2 ${isSelected
            ? "rounded-lg border border-border bg-muted/65 dark:bg-muted/30 shadow-xs"
            : "rounded-lg border border-transparent hover:bg-muted/30 dark:hover:bg-muted/15"
          }`
          : `${isSelected
            ? "rounded-lg border border-border bg-muted/50 px-2.5 py-2 dark:bg-muted/30 shadow-xs"
            : "rounded-lg border border-transparent px-2.5 py-2 hover:bg-muted/25 dark:hover:bg-muted/15"
          }`
          }`}
        onClick={onClick}
      >
        {/* Left Side Active Indicator Bar */}
        {isSelected && (
          <div className="absolute left-0 top-2.5 bottom-2.5 w-[3px] bg-red-500 rounded-r" />
        )}
        <div className={`flex items-center justify-between ${showActions ? "pr-8" : ""}`}>
          <div className="flex items-center gap-2 flex-1">
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <div
                  className={`w-2 h-2 rounded-full transition-all ${getStatusColor(
                    server.connectionStatus
                  )}`}
                />
              </TooltipTrigger>
              <TooltipContent side="top">
                {`Status: ${server.connectionStatus || "Unknown"}`}
              </TooltipContent>
            </Tooltip>
            <ServerIcon
              serverName={server.name}
              serverUrl={server.url}
              size={16}
              className="flex-shrink-0"
            />
            <span className="font-medium text-sm truncate">{server.name}</span>
            {server.requiresOauth2 ? (
              <Tooltip delayDuration={100}>
                <TooltipTrigger asChild>
                  <div>
                    <Shield className="h-3 w-3 text-amber-500 flex-shrink-0" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">OAuth2 Required</TooltipContent>
              </Tooltip>
            ) : (
              !showActions && (
                <span className="text-xs font-medium text-red-600 dark:text-red-300">
                  open
                </span>
              )
            )}
          </div>
        </div>
        <div className="mt-2 h-[2.5rem]">
          <div className="line-clamp-2 text-xs leading-relaxed text-muted-foreground [&>*]:inline [&>p]:inline [&>p>code]:bg-muted [&>p>code]:px-1 [&>p>code]:rounded [&>p>code]:text-[10px] [&_a]:underline [&_a]:underline-offset-2 [&_a]:text-primary">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {server.description || ""}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
