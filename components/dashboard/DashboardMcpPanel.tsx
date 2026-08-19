"use client";

import React, { useState, useMemo } from "react";
import {
  Server,
  Wrench,
  Search,
  Play,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Plus,
  Radio,
  Sliders,
  Code2,
  Terminal,
  Sparkles,
  Info,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useMcpStore } from "@/lib/stores/mcp-store";
import { useMcpConnection } from "@/hooks/useMcpConnection";
import type { ToolInfo, McpServer } from "@/types/mcp";
import { ServerIcon } from "@/components/common/ServerIcon";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface DashboardMcpPanelProps {
  onInsertPrompt?: (text: string) => void;
  className?: string;
}

export function DashboardMcpPanel({
  onInsertPrompt,
  className,
}: DashboardMcpPanelProps) {
  const [activeTab, setActiveTab] = useState<"tools" | "servers" | "runner">("tools");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedServerFilter, setSelectedServerFilter] = useState<string>("all");
  const [selectedTool, setSelectedTool] = useState<{
    serverName: string;
    serverId: string;
    tool: ToolInfo;
  } | null>(null);

  // Runner state
  const [toolArguments, setToolArguments] = useState<string>("{}");
  const [isRunning, setIsRunning] = useState(false);
  const [runnerResult, setRunnerResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const connections = useMcpStore((state) => state.connections);
  const mcpActions = useMcpStore((state) => state.mcpActions);
  const { connect, disconnect } = useMcpConnection();

  const connectionList = useMemo(() => Object.values(connections), [connections]);

  // Aggregate all tools across active servers
  const allTools = useMemo(() => {
    const list: Array<{
      serverId: string;
      serverName: string;
      tool: ToolInfo;
    }> = [];

    for (const conn of connectionList) {
      if (conn.connectionStatus === "CONNECTED" || conn.connectionStatus === "READY") {
        for (const tool of conn.tools || []) {
          list.push({
            serverId: conn.serverId,
            serverName: conn.serverName || "MCP Server",
            tool,
          });
        }
      }
    }
    return list;
  }, [connectionList]);

  // Filter tools by search and server
  const filteredTools = useMemo(() => {
    return allTools.filter((item) => {
      const matchesSearch =
        !searchQuery ||
        item.tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.tool.description &&
          item.tool.description.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesServer =
        selectedServerFilter === "all" || item.serverId === selectedServerFilter;

      return matchesSearch && matchesServer;
    });
  }, [allTools, searchQuery, selectedServerFilter]);

  const handleSelectTool = (item: {
    serverName: string;
    serverId: string;
    tool: ToolInfo;
  }) => {
    setSelectedTool(item);
    // Initialize default arguments template from schema if available
    const schemaObj = (item.tool.inputSchema || item.tool.schema) as Record<string, any> | undefined;
    if (schemaObj?.properties && typeof schemaObj.properties === "object") {
      const defaultArgs: Record<string, any> = {};
      for (const [key, prop] of Object.entries(schemaObj.properties as Record<string, any>)) {
        defaultArgs[key] =
          prop?.type === "string"
            ? ""
            : prop?.type === "number"
            ? 0
            : prop?.type === "boolean"
            ? false
            : null;
      }
      setToolArguments(JSON.stringify(defaultArgs, null, 2));
    } else {
      setToolArguments("{}");
    }
    setRunnerResult(null);
  };

  const handleRunTool = async () => {
    if (!selectedTool) return;
    setIsRunning(true);
    setRunnerResult(null);

    try {
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(toolArguments);
      } catch (err) {
        throw new Error("Invalid JSON in tool arguments.");
      }

      // Find connection session ID
      const conn = Object.values(connections).find(
        (c) => c.serverId === selectedTool.serverId
      );

      if (!conn?.sessionId) {
        throw new Error("Server session is not active.");
      }

      if (!mcpActions?.callTool) {
        throw new Error("MCP actions are not ready. Please sign in or reconnect.");
      }

      const result = await mcpActions.callTool(conn.sessionId, selectedTool.tool.name, parsedArgs);
      setRunnerResult({ success: true, data: result });
      toast.success(`Executed ${selectedTool.tool.name}`);
    } catch (error: any) {
      setRunnerResult({
        success: false,
        error: error.message || "Failed to execute tool",
      });
      toast.error(error.message || "Tool execution failed");
    } finally {
      setIsRunning(false);
    }
  };

  const handleInsertIntoChat = () => {
    if (!selectedTool) return;
    const promptText = `Please call tool \`${selectedTool.tool.name}\` from server "${selectedTool.serverName}".`;
    if (onInsertPrompt) {
      onInsertPrompt(promptText);
    } else {
      navigator.clipboard.writeText(promptText);
    }
  };

  const handleCopySchema = () => {
    if (!selectedTool) return;
    navigator.clipboard.writeText(JSON.stringify(selectedTool.tool.inputSchema, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-background border-l border-border select-none text-foreground font-sans",
        className
      )}
    >
      {/* Top Bar / Tab Switcher */}
      <div className="h-10 px-3 border-b border-border flex items-center justify-between bg-card shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab("tools")}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-xs transition-colors",
              activeTab === "tools"
                ? "bg-foreground text-background font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Tools ({allTools.length})
          </button>
          <button
            onClick={() => setActiveTab("servers")}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-xs transition-colors",
              activeTab === "servers"
                ? "bg-foreground text-background font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Servers ({connectionList.length})
          </button>
        </div>

        <a
          href="/mcp"
          className="text-[11px] font-mono text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          Manage Hub
          <ExternalLink className="size-3" />
        </a>
      </div>

      {/* Main Tab Content */}
      {activeTab === "tools" && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Filter / Search Bar */}
          <div className="p-2.5 border-b border-border space-y-2 bg-background">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search tools by name or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs bg-card border-border font-mono placeholder:font-sans"
              />
            </div>

            {connectionList.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide text-xs">
                <button
                  onClick={() => setSelectedServerFilter("all")}
                  className={cn(
                    "px-2 py-0.5 rounded-xs font-mono text-[11px] whitespace-nowrap transition-colors",
                    selectedServerFilter === "all"
                      ? "bg-foreground text-background"
                      : "bg-card text-muted-foreground hover:text-foreground border border-border"
                  )}
                >
                  All ({allTools.length})
                </button>
                {connectionList.map((conn) => (
                  <button
                    key={conn.serverId}
                    onClick={() => setSelectedServerFilter(conn.serverId)}
                    className={cn(
                      "px-2 py-0.5 rounded-xs font-mono text-[11px] whitespace-nowrap transition-colors",
                      selectedServerFilter === conn.serverId
                        ? "bg-foreground text-background"
                        : "bg-card text-muted-foreground hover:text-foreground border border-border"
                    )}
                  >
                    {conn.serverName} ({conn.tools?.length || 0})
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Split Content: Tool List on top / Tool Detail Inspector on bottom */}
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden divide-y divide-border">
            {/* Tool List */}
            <div className="flex-1 overflow-y-auto min-h-[160px] p-2 space-y-1.5 scrollbar-minimal">
              {filteredTools.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  <Wrench className="size-8 mx-auto mb-2 opacity-40" />
                  <p className="font-medium text-foreground">No tools found</p>
                  <p className="mt-1 text-[11px]">
                    Connect MCP servers in the Servers tab to enable tools.
                  </p>
                </div>
              ) : (
                filteredTools.map((item) => {
                  const isSelected =
                    selectedTool?.tool.name === item.tool.name &&
                    selectedTool?.serverId === item.serverId;

                  return (
                    <div
                      key={`${item.serverId}-${item.tool.name}`}
                      onClick={() => handleSelectTool(item)}
                      className={cn(
                        "p-2 rounded-sm border cursor-pointer transition-all text-left group",
                        isSelected
                          ? "bg-card border-foreground/40 shadow-xs"
                          : "bg-card/60 hover:bg-card border-border"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-medium text-foreground group-hover:text-ink truncate">
                          {item.tool.name}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono px-1.5 py-0 border-border text-muted-foreground shrink-0"
                        >
                          {item.serverName}
                        </Badge>
                      </div>
                      {item.tool.description && (
                        <p className="text-[11px] text-muted-foreground line-clamp-1 mt-1 leading-relaxed">
                          {item.tool.description}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Tool Inspector / Direct Runner Drawer */}
            {selectedTool && (
              <div className="h-[45%] min-h-[220px] flex flex-col bg-card/40 overflow-hidden">
                {/* Inspector Header */}
                <div className="px-3 py-2 border-b border-border bg-card flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Code2 className="size-3.5 text-foreground shrink-0" />
                    <span className="font-mono text-xs font-semibold text-foreground truncate">
                      {selectedTool.tool.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={handleCopySchema}
                      className="h-6 text-[11px] font-mono text-muted-foreground hover:text-foreground"
                    >
                      {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={handleInsertIntoChat}
                      className="h-6 text-[11px] font-mono border-border bg-background hover:bg-card"
                    >
                      <Sparkles className="size-3 mr-1" />
                      Ask Agent
                    </Button>
                  </div>
                </div>

                {/* Inspector Body */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3 font-mono text-xs scrollbar-minimal">
                  {selectedTool.tool.description && (
                    <div className="font-sans text-[11px] text-body-strong leading-relaxed bg-background p-2 rounded-sm border border-border">
                      {selectedTool.tool.description}
                    </div>
                  )}

                  {/* Arguments input */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                      <span>Input Arguments (JSON):</span>
                      <Button
                        size="xs"
                        variant="default"
                        disabled={isRunning}
                        onClick={handleRunTool}
                        className="h-6 text-[11px] px-2"
                      >
                        {isRunning ? (
                          <RefreshCw className="size-3 animate-spin mr-1" />
                        ) : (
                          <Play className="size-3 mr-1" />
                        )}
                        Execute
                      </Button>
                    </div>
                    <textarea
                      value={toolArguments}
                      onChange={(e) => setToolArguments(e.target.value)}
                      rows={3}
                      className="w-full bg-background border border-border rounded-sm p-2 text-xs font-mono text-foreground focus:outline-none focus:border-foreground/50 resize-none"
                    />
                  </div>

                  {/* Output preview */}
                  {runnerResult && (
                    <div>
                      <div className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
                        <Terminal className="size-3" />
                        <span>Execution Output:</span>
                      </div>
                      <pre
                        className={cn(
                          "p-2 rounded-sm text-[11px] overflow-x-auto max-h-32 border font-mono",
                          runnerResult.success
                            ? "bg-background border-border text-foreground"
                            : "bg-destructive/10 border-destructive/30 text-destructive-foreground"
                        )}
                      >
                        {JSON.stringify(runnerResult.data || runnerResult.error, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Servers Management Tab */}
      {activeTab === "servers" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scrollbar-minimal">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider font-mono">
              Connected MCP Servers
            </span>
            <a
              href="/mcp"
              className="text-xs font-medium text-foreground hover:underline flex items-center gap-1"
            >
              <Plus className="size-3" /> Add Server
            </a>
          </div>

          {connectionList.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-border rounded-sm bg-card/40">
              <Server className="size-8 mx-auto mb-2 text-muted-foreground opacity-50" />
              <p className="text-xs font-medium text-foreground">No MCP servers connected</p>
              <p className="text-[11px] text-muted-foreground mt-1 mb-3">
                Connect external or local MCP tools to supercharge your AI agent.
              </p>
              <Button asChild size="sm" variant="default" className="text-xs">
                <a href="/mcp">Connect MCP Server</a>
              </Button>
            </div>
          ) : (
            connectionList.map((conn) => {
              const isConnected =
                conn.connectionStatus === "CONNECTED" || conn.connectionStatus === "READY";

              return (
                <div
                  key={conn.serverId}
                  className="p-3 bg-card border border-border rounded-sm space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="size-7 rounded-sm bg-background border border-border flex items-center justify-center shrink-0">
                        <Server className="size-3.5 text-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-foreground truncate">
                          {conn.serverName}
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground truncate">
                          {conn.url || conn.transport || "Active Session"}
                        </div>
                      </div>
                    </div>

                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-mono shrink-0",
                        isConnected
                          ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                          : "border-border text-muted-foreground"
                      )}
                    >
                      {conn.connectionStatus}
                    </Badge>
                  </div>

                  <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                    <span>{conn.tools?.length || 0} tools available</span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => {
                          const mockServer: McpServer = {
                            id: conn.serverId,
                            name: conn.serverName,
                            transport: conn.transport || "streamable-http",
                            url: conn.url,
                            requiresOauth2: false,
                            tools: conn.tools || [],
                            updated_at: conn.connectedAt || new Date().toISOString(),
                          };
                          if (isConnected) {
                            disconnect(mockServer);
                          } else {
                            connect(mockServer);
                          }
                        }}
                        className="h-6 text-[10px] font-mono"
                      >
                        {isConnected ? "Disconnect" : "Reconnect"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </aside>
  );
}
