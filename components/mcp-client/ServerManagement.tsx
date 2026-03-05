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
  onDelete?: (serverName: string) => void;
}

export default function ServerManagement({ server, onAction, onEdit, onDelete }: ServerManagementProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const status = server.connectionStatus?.toUpperCase();
  const isReady = status === "READY";
  const isInProgress = !!status && [
    "INITIALIZING",
    "VALIDATING",
    "CONNECTING",
    "AUTHENTICATING",
    "AUTHENTICATED",
    "CONNECTED",
    "DISCOVERING",
  ].includes(status);

  const handleAction = async (action: 'activate' | 'deactivate') => {
    setLoading(action);

    try {
      const result = await onAction(server, action);

      // Use the actual message from the response data if available
      // const message = (result && typeof result === 'object' && 'message' in result && typeof result.message === 'string')
      //   ? result.message
      //   : `Server ${action}d successfully`;
      // toast.success(message);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `Failed to ${action} server`;
      toast.error(errorMessage);
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
        return !isReady || isInProgress;
      default:
        return false;
    }
  };

  return (
    <div className="flex items-center gap-3">
      {/* Status Badge - Commented out as it's redundant with Connection Details section */}
      {/* <div className="flex items-center gap-2">
        <div
          className={`w-3 h-3 rounded-full cursor-pointer transition-all duration-300 hover:scale-125 ${server.connectionStatus?.toUpperCase() === "CONNECTED"
            ? "bg-green-500 hover:bg-green-600 animate-pulse"
            : server.connectionStatus?.toUpperCase() === "VALIDATING"
              ? "bg-yellow-500 hover:bg-yellow-600 animate-pulse"
              : server.connectionStatus?.toUpperCase() === "DISCONNECTED"
                ? "bg-gray-400 hover:bg-gray-500"
                : server.connectionStatus?.toUpperCase() === "FAILED"
                  ? "bg-red-500 hover:bg-red-600 animate-pulse"
                  : "bg-gray-400 hover:bg-gray-500"
            }`}
          title={`Status: ${server.connectionStatus || "Unknown"}`}
        />
        <Badge
          variant={getStatusColor(server.connectionStatus)}
          className="flex items-center gap-1"
        >
          {getStatusIcon(server.connectionStatus)}
          <span>
            {server.connectionStatus || "Unknown"}
          </span>
        </Badge>
      </div> */}

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        {/* Primary Action Button */}
        {isReady ? (
          <Button
            onClick={() => handleAction('deactivate')}
            disabled={isActionDisabled('deactivate')}
            variant="outline"
            size="sm"
            className="flex items-center gap-2 cursor-pointer"
          >
            {loading === 'deactivate' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Pause className="h-4 w-4" />
            )}
            Deactivate
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
                  onClick={() => onDelete(server.name)}
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
