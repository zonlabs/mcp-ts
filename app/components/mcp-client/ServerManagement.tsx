"use client";

import { useState } from "react";
import { toast } from "react-hot-toast";
import {
  Power,
  Play,
  Pause,
  MoreVertical,
  CheckCircle,
  XCircle,
  Loader2,
  Edit,
  Trash2,
  Wrench,
  ShieldCheck,
  RotateCw,
} from "lucide-react";
import { useMcpContext } from "@/components/providers/McpProvider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { McpServer } from "@/types/mcp";

interface ServerManagementProps {
  server: McpServer;
  onAction: (server: McpServer, action: 'activate' | 'deactivate') => Promise<unknown>;
  onEdit?: (server: McpServer) => void;
  onDelete?: (serverId: string) => void;
  onToggleTools?: () => void;
  toolTesterOpen?: boolean;
  onManageAccess?: () => void;
  toolAccessSummary?: string;
}

export default function ServerManagement({
  server,
  onAction,
  onEdit,
  onDelete,
  onToggleTools,
  toolTesterOpen,
  onManageAccess,
  toolAccessSummary,
}: ServerManagementProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const status = server.connectionStatus?.toUpperCase();
  const isReady = status === "READY";
  const isAuthenticating = status === "AUTHENTICATING";
  const isInProgress = !!status && [
    "INITIALIZING",
    "VALIDATING",
    "CONNECTING",
    "AUTHENTICATING",
    "AUTHENTICATED",
    "CONNECTED",
    "DISCOVERING",
  ].includes(status);
  const canCancel = !isReady && isInProgress;

  const handleAction = async (action: 'activate' | 'deactivate') => {
    setLoading(action);

    try {
      await onAction(server, action);

      // Use the actual message from the response data if available
      // const message = (result && typeof result === 'object' && 'message' in result && typeof result.message === 'string')
      //   ? result.message
      //   : `Server ${action}d successfully`;
      // toast.success(message);
    } catch (error) {
      // Error notifications are handled by the underlying action layer (hooks/store).
    } finally {
      setLoading(null);
    }
  };

  const getStatusColor = (status: string | null | undefined) => {
    if (!status) return "outline";
    switch (status.toUpperCase()) {
      case "READY":
        return "default";
      case "CONNECTED":
        return "default";
      case "DISCONNECTED":
        return "secondary";
      case "FAILED":
        return "destructive";
      case "VALIDATING":
        return "outline";
      default:
        return "outline";
    }
  };

  const getStatusIcon = (status: string | null | undefined) => {
    if (!status) return <Power className="h-3 w-3" />;
    switch (status.toUpperCase()) {
      case "READY":
        return <CheckCircle className="h-3 w-3" />;
      case "CONNECTED":
        return <CheckCircle className="h-3 w-3" />;
      case "DISCONNECTED":
        return <XCircle className="h-3 w-3" />;
      case "FAILED":
        return <XCircle className="h-3 w-3" />;
      case "VALIDATING":
        return <Loader2 className="h-3 w-3 animate-spin" />; // Spinning loader for validating
      default:
        return <Power className="h-3 w-3" />;
    }
  };

  const { reconnect } = useMcpContext();

  const handleReconnect = async () => {
    setLoading("reconnect");

    try {
      if (!server.url) {
        throw new Error('Server URL is required to reconnect');
      }
      const callbackUrl = `${window.location.origin}/auth/callback/success`;
      await reconnect({
        serverId: server.id,
        serverName: server.name,
        serverUrl: server.url,
        transport: server.transport ? { type: server.transport as 'sse' | 'streamable-http' } : undefined,
        callbackUrl,
      });
      toast.success(`${server.name} reconnected successfully`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to reconnect ${server.name}`);
    } finally {
      setLoading(null);
    }
  };

  const isActionDisabled = (action: string) => {
    if (loading) return true;

    switch (action) {
      case 'activate':
        return isReady || isInProgress;
      case 'deactivate':
        return !isReady && !isInProgress;
      default:
        return false;
    }
  };

  return (
    <div className="flex items-center gap-3">
      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        {/* Primary Action Button */}
        {isReady ? (
          <Button
            onClick={() => handleAction('deactivate')}
            disabled={isActionDisabled('deactivate')}
            size="sm"
            className="flex items-center gap-2 cursor-pointer bg-red-800 hover:bg-red-700 text-white shadow-sm transition-all duration-200"
          >
            {loading === 'deactivate' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Power className="h-3.5 w-3.5" />
            )}
            Deactivate
          </Button>
        ) : canCancel ? (
          <Button
            onClick={() => handleAction('deactivate')}
            disabled={loading === 'deactivate'}
            size="sm"
            className="flex items-center gap-2 cursor-pointer bg-red-800 hover:bg-red-700 text-white shadow-sm transition-all duration-200"
          >
            {loading === 'deactivate' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-3.5 w-3.5" />
            )}
            Cancel Auth
          </Button>
        ) : (
          <Button
            onClick={() => handleAction('activate')}
            disabled={isActionDisabled('activate')}
            size="sm"
            className="flex items-center gap-2 cursor-pointer"
          >
            {loading === 'activate' || isInProgress ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {isInProgress ? "Activating" : "Activate"}
          </Button>
        )}

        {/* Dropdown Menu for Additional Actions */}
        {(onToggleTools || onManageAccess || onEdit || onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={loading !== null}
                className="cursor-pointer"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              {onToggleTools && (
                <DropdownMenuItem
                  onClick={onToggleTools}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Wrench className="h-4 w-4" />
                  {toolTesterOpen ? "Hide Tools" : "Call Tools"}
                </DropdownMenuItem>
              )}
              {onManageAccess && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuItem
                      onClick={onManageAccess}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Manage access
                    </DropdownMenuItem>
                  </TooltipTrigger>
                  {toolAccessSummary && (
                    <TooltipContent side="left">{toolAccessSummary}</TooltipContent>
                  )}
                </Tooltip>
              )}
              {isReady && (
                <DropdownMenuItem
                  onClick={handleReconnect}
                  disabled={loading !== null}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <RotateCw className={`h-4 w-4 ${loading === "reconnect" ? "animate-spin" : ""}`} />
                  Reconnect
                </DropdownMenuItem>
              )}
              <div className="border-t border-border my-1" />
              {onEdit && (
                <DropdownMenuItem
                  onClick={() => onEdit(server)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Edit className="h-4 w-4" />
                  Edit Server
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(server.id)}
                  className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Server
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
