"use client";

import { nanoid } from "nanoid";
import { PanelLeftClose } from "lucide-react";
import { useState } from "react";
import { useMcpOAuthPopup, type McpClient } from "@mcp-ts/client/client/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import ConnectForm from "./dashboard/ConnectForm";
import ConnectionList from "./dashboard/ConnectionList";
import ToolExecutor from "./dashboard/ToolExecutor";
import type { Connection, ConnectConfig } from "./dashboard/types";

function statusDotClass(status: string) {
  switch (status) {
    case "connected":
      return "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]";
    case "connecting":
      return "animate-pulse bg-amber-500";
    case "error":
      return "bg-destructive";
    default:
      return "bg-muted-foreground";
  }
}

interface McpSidebarProps {
  /** The shared MCP client from HomePage — single source of truth. */
  mcpClient: McpClient;
  onCollapse: () => void;
}

export default function McpSidebar({ mcpClient, onCollapse }: McpSidebarProps) {
  const [selectedTool, setSelectedTool] = useState<{
    sessionId: string;
    toolName: string;
  } | null>(null);

  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const {
    connections,
    status,
    isInitializing,
    connect,
    disconnect,
    reconnect,
    callTool,
    finishAuth,
  } = mcpClient;

  useMcpOAuthPopup(connections as Connection[], finishAuth);

  const handleConnect = async (config: ConnectConfig) => {
    setConnecting(true);
    setConnectError(null);

    try {
      await connect({
        serverId: config.serverId ?? nanoid(),
        serverName: config.serverName,
        serverUrl: config.serverUrl,
        callbackUrl: config.callbackUrl,
        transportType:
          config.transportType === "auto" ? undefined : config.transportType,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
      });
    } catch (err) {
      setConnectError(
        err instanceof Error ? err.message : "Failed to connect",
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (sessionId: string) => {
    try {
      await disconnect(sessionId);
    } catch {}
  };

  const handleReconnect = async (connection: Connection) => {
    try {
      const callbackUrl = `${window.location.origin}/oauth/callback-popup`;
      await reconnect({
        serverId: connection.serverId,
        serverName: connection.serverName,
        serverUrl: connection.serverUrl,
        callbackUrl,
        transportType:
          connection.transport === "streamable-http" ? "streamable-http" : "sse",
      });
    } catch (err) {
      console.error("Failed to reconnect:", err);
    }
  };

  const handleSelectTool = (sessionId: string, toolName: string) => {
    setSelectedTool({ sessionId, toolName });
  };

  const handleExecuteTool = async (
    sessionId: string,
    toolName: string,
    toolArgs: string,
  ) => {
    try {
      const args = JSON.parse(toolArgs);
      const result = await callTool(sessionId, toolName, args);
      return result;
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Tool execution failed",
      };
    }
  };

  const [toolResult, setToolResult] = useState<unknown>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const executeToolWrapper = async (
    sessionId: string,
    toolName: string,
    toolArgs: string,
  ) => {
    setIsExecuting(true);
    setToolResult(null);
    const result = await handleExecuteTool(sessionId, toolName, toolArgs);
    setToolResult(result);
    setIsExecuting(false);
    return result;
  };

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-sidebar text-sidebar-foreground">
      <header className="flex shrink-0 items-center gap-2 border-b border-sidebar-border px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            MCP
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                statusDotClass(status),
              )}
              aria-hidden
            />
            <span className="truncate text-xs capitalize text-sidebar-foreground">
              {status}
            </span>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-sidebar-foreground"
          onClick={onCollapse}
          aria-label="Hide MCP panel"
        >
          <PanelLeftClose className="size-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
        <div className="flex flex-col gap-4">
          <ConnectForm
            onConnect={handleConnect}
            connecting={connecting}
            status={status}
            error={connectError}
          />

          <ConnectionList
            connections={connections as Connection[]}
            isInitializing={isInitializing}
            onDisconnect={handleDisconnect}
            onReconnect={handleReconnect}
            onSelectTool={handleSelectTool}
          />
        </div>
      </div>

      {/* ToolExecutor: JSON run dialog only — no McpAppRenderer here */}
      <ToolExecutor
        selectedTool={selectedTool}
        onClose={() => {
          setSelectedTool(null);
          setToolResult(null);
        }}
        onExecute={executeToolWrapper}
        isExecuting={isExecuting}
        toolResult={toolResult}
      />
    </aside>
  );
}
