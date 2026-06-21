"use client";

import { useState } from "react";
import {
  Power,
  Play,
  Pause,
  MoreVertical,
  CheckCircle,
  XCircle,
  Loader2,
  Edit,
  Trash2
} from "lucide-react";
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
}

export default function ServerManagement({ server, onAction, onEdit, onDelete }: ServerManagementProps) {
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
            className="flex items-center gap-2 cursor-pointer bg-red-600 hover:bg-red-700 text-white shadow-sm transition-all duration-200"
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
            className="flex items-center gap-2 cursor-pointer bg-red-600 hover:bg-red-700 text-white shadow-sm transition-all duration-200"
          >
            {loading === 'deactivate' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-3.5 w-3.5" />
            )}
            {isAuthenticating ? "Cancel auth" : "Deactivate"}
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
            {isInProgress ? "Activating..." : "Activate"}
          </Button>
        )}

        {/* Dropdown Menu for Additional Actions */}
        {(onEdit || onDelete) && (
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
            <DropdownMenuContent align="end">
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
