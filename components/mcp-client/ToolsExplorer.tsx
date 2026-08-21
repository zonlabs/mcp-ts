"use client";

import { useState, useMemo } from "react";
import {
  Wrench,
  Search,
  Grid3X3,
  List,
  Zap,
  Code2,
  Server,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { McpServer, ToolInfo } from "@/types/mcp";
import { useMcpContext } from "@/components/providers/McpProvider";
import { cn } from "@/lib/utils";

interface ToolsExplorerProps {
  server?: McpServer | null;
  onOpenToolTester?: (toolName?: string) => void;
}

export default function ToolsExplorer({ server, onOpenToolTester }: ToolsExplorerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const { connections } = useMcpContext();

  // If a specific server is provided, use its tools. Otherwise aggregate from all active connections.
  const toolsWithServer = useMemo(() => {
    if (server) {
      const serverTools = Array.isArray(server.tools) ? server.tools : [];
      return serverTools.map((t) => ({
        tool: t,
        serverName: server.name,
        serverId: server.id,
      }));
    }

    const aggregated: Array<{ tool: ToolInfo; serverName: string; serverId: string }> = [];
    for (const conn of connections) {
      if (conn.state === "READY") {
        for (const t of conn.tools || []) {
          aggregated.push({
            tool: t as ToolInfo,
            serverName: conn.serverName || "MCP Server",
            serverId: conn.serverId,
          });
        }
      }
    }
    return aggregated;
  }, [server, connections]);

  const filteredTools = useMemo(() => {
    return toolsWithServer.filter((item) => {
      const q = searchTerm.toLowerCase().trim();
      if (!q) return true;
      return (
        item.tool.name.toLowerCase().includes(q) ||
        (item.tool.description && item.tool.description.toLowerCase().includes(q)) ||
        item.serverName.toLowerCase().includes(q)
      );
    });
  }, [toolsWithServer, searchTerm]);

  if (toolsWithServer.length === 0) {
    return (
      <div className="p-12 text-center border border-dashed border-border rounded-md bg-card/30">
        <Wrench className="size-10 text-muted-foreground opacity-40 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-foreground">No Tools Available</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
          {server
            ? "Connect to this server to load and execute its available tools."
            : "Connect to MCP servers in the dashboard to discover and run their tools."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full select-none font-sans">
      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border border-border p-3.5 rounded-md">
        <div className="flex items-center gap-2">
          <Wrench className="size-4 text-foreground" />
          <span className="text-xs font-semibold text-foreground">
            Tools Catalog ({filteredTools.length} of {toolsWithServer.length})
          </span>
        </div>

        <div className="flex items-center gap-2 flex-1 max-w-md ml-auto">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search tools by name, description, or server..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-sm text-foreground font-mono placeholder:font-sans focus:outline-none focus:border-foreground/50"
            />
          </div>

          <div className="flex items-center border border-border rounded-sm bg-background">
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="xs"
              onClick={() => setViewMode("grid")}
              className="h-7 w-7 p-0 rounded-none rounded-l-xs"
            >
              <Grid3X3 className="size-3.5" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="xs"
              onClick={() => setViewMode("list")}
              className="h-7 w-7 p-0 rounded-none rounded-r-xs"
            >
              <List className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Grid or List View */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 w-full">
          {filteredTools.map((item) => (
            <div
              key={`${item.serverId}-${item.tool.name}`}
              onClick={() => onOpenToolTester?.(item.tool.name)}
              className="p-3.5 bg-card border border-border hover:border-foreground/40 rounded-md cursor-pointer transition-all flex flex-col justify-between space-y-2 group"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Code2 className="size-3.5 text-foreground shrink-0" />
                    <span className="font-mono text-xs font-semibold text-foreground group-hover:text-ink truncate">
                      {item.tool.name}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono shrink-0 border-border text-muted-foreground">
                    {item.serverName}
                  </Badge>
                </div>

                {item.tool.description && (
                  <p className="text-[11px] text-body-strong line-clamp-2 leading-relaxed">
                    {item.tool.description}
                  </p>
                )}
              </div>

              <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted-foreground">Click to inspect / test</span>
                <Zap className="size-3 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="border border-border rounded-md divide-y divide-border bg-card overflow-hidden w-full">
          {filteredTools.map((item) => (
            <div
              key={`${item.serverId}-${item.tool.name}`}
              onClick={() => onOpenToolTester?.(item.tool.name)}
              className="p-3 flex items-center justify-between gap-3 hover:bg-card/70 cursor-pointer transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-foreground">{item.tool.name}</span>
                  <Badge variant="outline" className="text-[10px] font-mono border-border text-muted-foreground">
                    {item.serverName}
                  </Badge>
                </div>
                {item.tool.description && (
                  <p className="text-[11px] text-body-strong truncate mt-0.5">{item.tool.description}</p>
                )}
              </div>
              <Button size="xs" variant="outline" className="h-6 text-[11px] font-mono shrink-0 border-border bg-background">
                Test
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
