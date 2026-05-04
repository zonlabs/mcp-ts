"use client";

import { motion } from "framer-motion";
import { Shield, Edit, Trash2, Link2 } from "lucide-react";
import { McpServer } from "@/types/mcp";
import { ServerIcon } from "@/components/common/ServerIcon";
import { Button } from "@/components/ui/button";

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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`group relative ${showActions ? '' : 'px-3 py-3 border-b border-border last:border-b-0'}`}
    >
      {/* Action Buttons (for user servers) */}
      {showActions && onEdit && onDelete && (
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col gap-1 z-10">
          <Button
            variant="ghost"
            size="sm"
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
        className={`cursor-pointer transition-all duration-200 ${showActions
          ? `px-3 py-2 ${isSelected
            ? "bg-primary/10 border-l-2 border-primary rounded-lg"
            : "border-l-2 border-transparent hover:bg-muted/50"
          }`
          : `hover:rounded-lg hover:bg-muted/20 ${isSelected ? "bg-primary/5 rounded-lg" : ""
          }`
          }`}
        onClick={onClick}
      >
        <div className={`flex items-center justify-between mb-2 ${showActions ? 'pr-8' : ''}`}>
          <div className="flex items-center gap-2 flex-1">
            <div
              className={`w-2 h-2 rounded-full transition-all ${getStatusColor(
                server.connectionStatus
              )}`}
              title={`Status: ${server.connectionStatus || "Unknown"}`}
            />
            <ServerIcon
              serverName={server.name}
              serverUrl={server.url}
              size={16}
              className="flex-shrink-0"
            />
            <span className="font-medium text-sm truncate">{server.name}</span>
            {server.requiresOauth2 ? (
              <div title="OAuth2 Required">
                <Shield className="h-3 w-3 text-amber-500 flex-shrink-0" />
              </div>
            ) : (
              !showActions && (
                <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                  open
                </span>
              )
            )}
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed min-h-[2.5rem]">
            {server.description || ""}
          </p>
          {server.createdAt && (
            <p className="text-xs text-muted-foreground">
              added on:{" "}
              {new Date(server.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
