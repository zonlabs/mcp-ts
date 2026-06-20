"use client";

import { useState } from "react";
import {
  Wrench,
  Search,
  Grid3X3,
  List,
  Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { McpServer } from "@/types/mcp";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ToolsExplorerProps {
  server: McpServer;
  onOpenToolTester?: (toolName?: string) => void;
}

export default function ToolsExplorer({ server, onOpenToolTester }: ToolsExplorerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Handle different tools formats
  const tools = Array.isArray(server.tools) ? server.tools : [];

  const filteredTools = tools.filter(tool => {
    const matchesSearch = tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tool.description.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesSearch;
  });
  const isConnected = server.connectionStatus === 'READY';

  const getToolCategory = (toolName: string) => {
    // Simple categorization based on tool name patterns
    if (toolName.includes('search') || toolName.includes('find')) return 'Search';
    if (toolName.includes('create') || toolName.includes('add')) return 'Create';
    if (toolName.includes('update') || toolName.includes('edit')) return 'Update';
    if (toolName.includes('delete') || toolName.includes('remove')) return 'Delete';
    if (toolName.includes('get') || toolName.includes('fetch')) return 'Read';
    return 'General';
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Search': return 'default';
      case 'Create': return 'default';
      case 'Update': return 'secondary';
      case 'Delete': return 'destructive';
      case 'Read': return 'outline';
      default: return 'secondary';
    }
  };

  if (!tools || tools.length === 0) {
    const getNoToolsMessage = () => {
      if (isConnected) {
        return "This server is connected but doesn't have any tools available.";
      } else if (server.connectionStatus === 'FAILED') {
        return "Server connection failed. Tools cannot be loaded.";
      } else {
        return "Connect to this server to load and view available tools.";
      }
    };

    return (
      <div className="p-6">
        <CardContent className="p-12 text-center">
          <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No Tools Available</h3>
          <p className="text-muted-foreground">
            {getNoToolsMessage()}
          </p>
        </CardContent>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
          <div>
            <h3 className="text-lg font-semibold">Tools Explorer</h3>
            <p className="text-sm text-muted-foreground">
              {filteredTools.length} of {tools.length} tools
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Open Tool Tester Button */}
            {tools.length > 0 && (
              <Button
                onClick={() => onOpenToolTester?.()}
                className="cursor-pointer bg-amber-500 hover:bg-amber-600 text-white"
              >
                <Zap className="h-4 w-4 mr-2" />
                Test Tools
              </Button>
            )}
            {/* View Mode Toggle */}
            <div className="flex items-center border border-border rounded-md">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className="rounded-r-none"
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="rounded-l-none"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search tools..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
          />
        </div>
      </div>

      {/* Tools Grid/List */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
          {filteredTools.map((tool) => {
            const category = getToolCategory(tool.name);

            return (
              <div key={tool.name}>
                <Card
                  className="h-full hover:shadow-md transition-shadow duration-200 overflow-hidden cursor-pointer"
                  onClick={() => isConnected && onOpenToolTester?.(tool.name)}
                >
                  <CardHeader>
                    <div className="flex flex-col gap-2 min-w-0">
                      <div className="flex items-center gap-2 min-w-0 w-full">
                        <Wrench className="h-4 w-4 text-primary flex-shrink-0" />
                        <Tooltip delayDuration={100}>
                          <TooltipTrigger asChild>
                            <CardTitle className="text-sm text-truncate min-w-0 flex-1">
                              {tool.name}
                            </CardTitle>
                          </TooltipTrigger>
                          <TooltipContent side="top">{tool.name}</TooltipContent>
                        </Tooltip>
                      </div>
                      <Badge variant={getCategoryColor(category)} className="text-xs w-fit">
                        {category}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 min-w-0">
                    <Tooltip delayDuration={100}>
                      <TooltipTrigger asChild>
                        <p className="text-xs text-muted-foreground mb-3 line-clamp-3 break-words">
                          {tool.description}
                        </p>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-sm whitespace-pre-wrap break-words">
                        {tool.description}
                      </TooltipContent>
                    </Tooltip>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTools.map((tool) => {
            const category = getToolCategory(tool.name);

            return (
              <div key={tool.name}>
                <Card
                  className="hover:shadow-md transition-shadow duration-200 cursor-pointer"
                  onClick={() => isConnected && onOpenToolTester?.(tool.name)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 min-w-0">
                          <Wrench className="h-4 w-4 text-primary flex-shrink-0" />
                          <Tooltip delayDuration={100}>
                            <TooltipTrigger asChild>
                              <h4 className="font-medium text-truncate min-w-0 flex-1">{tool.name}</h4>
                            </TooltipTrigger>
                            <TooltipContent side="top">{tool.name}</TooltipContent>
                          </Tooltip>
                          <Badge variant={getCategoryColor(category)} className="text-xs flex-shrink-0">
                            {category}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">
                          {tool.description}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      )}

      {filteredTools.length === 0 && (
        <Card className="mt-4">
          <CardContent className="p-12 text-center">
            <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Tools Found</h3>
            <p className="text-muted-foreground">
              Try adjusting your search terms.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
