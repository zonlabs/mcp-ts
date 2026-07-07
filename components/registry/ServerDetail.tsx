"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ExternalLink,
  Globe,
  Calendar,
  Info,
  Copy,
  Check,
  Play,
  Pause,
  Loader2,
  CheckCircle2,
  XCircle,
  Wrench,
  Power,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ServerIcon } from "@/components/common/ServerIcon";
import ToolExecutionPanel from "@/components/mcp-client/ToolExecutionPanel";
import type { ParsedRegistryServer, McpServer } from "@/types/mcp";
import { toast } from "react-hot-toast";
import { useMcpConnection } from "@/hooks/useMcpConnection";

interface ServerDetailProps {
  server: ParsedRegistryServer;
}

export function ServerDetail({ server }: ServerDetailProps) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [toolTesterOpen, setToolTesterOpen] = useState(false);
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const displayName = server.title || server.shortName;

  const {
    connect,
    disconnect,
    isConnecting,
    connectionError,
    // isConnected, // Don't use this, rely on prop
    tools,
  } = useMcpConnection({ serverId: server.id });

  const isConnected = server.connectionStatus === 'READY';
  const isValidating = server.connectionStatus === 'VALIDATING';
  const effectiveTools = tools.length > 0 ? tools : (server.tools || []);

  useEffect(() => {
    setToolTesterOpen(isConnected);
    setSelectedToolName(null);
  }, [server.id, isConnected]);

  const handleConnect = () => connect(server);

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await disconnect(server);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleCopyUrl = () => {
    if (server?.remoteUrl) {
      navigator.clipboard.writeText(server.remoteUrl);
      setCopiedUrl(true);
      toast.success("Remote URL copied to clipboard");
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  // Convert ParsedRegistryServer to McpServer format for ToolsExplorer
  const mcpServer: McpServer = {
    id: server.id,
    name: server.name,
    description: server.description,
    transport: server.transportType || 'sse',
    url: server.remoteUrl,
    requiresOauth2: false,
    connectionStatus: isConnected ? 'READY' : 'DISCONNECTED',
    tools: effectiveTools,
    updated_at: server.updatedAt,
    createdAt: server.publishedAt,
  };

  return (
    <div className="flex gap-6">
      {/* Main Content - Hidden when tool tester is open */}
      <AnimatePresence mode="wait">
        {!toolTesterOpen && (
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="flex-1"
          >
            {/* Header Section */}
            <div className="border-b">
              <div className="flex items-start justify-between gap-8 flex-wrap mb-6">
                <div className="flex items-start gap-6 flex-1 min-w-0">
                  <div className="shrink-0">
                    <ServerIcon
                      serverName={server.shortName}
                      serverUrl={server.remoteUrl}
                      size={56}
                      className="rounded-xl shrink-0"
                      fallbackImage={server.iconUrl || undefined}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      {server.hasRemote && (
                        <Globe className="h-5 w-5 text-primary shrink-0" />
                      )}
                      <h1 className="text-3xl font-bold">{displayName}</h1>
                    </div>

                    <div className="flex items-center gap-2.5 text-muted-foreground mb-4 flex-wrap">
                      <span className="text-base">{server.vendor}</span>
                      <span className="text-xs">•</span>
                      <Badge variant="secondary" className="font-mono text-xs">
                        v{server.version}
                      </Badge>
                      {server.isLatest && (
                        <>
                          <span className="text-xs">•</span>
                          <Badge variant="default" className="text-xs">Latest</Badge>
                        </>
                      )}
                    </div>

                    {server.connectionStatus === 'READY' && (
                      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-sm font-medium">Connected</span>
                      </div>
                    )}
                    {server.connectionStatus === 'VALIDATING' && (
                      <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm font-medium">Validating...</span>
                      </div>
                    )}
                  </div>
                </div>

                {server.hasRemote && (
                  <div className="flex items-center gap-3 shrink-0">
                    {isConnected && (
                      <Button
                        onClick={() => setToolTesterOpen(!toolTesterOpen)}
                        variant={toolTesterOpen ? "default" : "outline"}
                        size="lg"
                        className="gap-2 cursor-pointer"
                      >
                        <Wrench className="h-4 w-4" />
                        {toolTesterOpen ? "Hide Tools" : "Call Tools"}
                      </Button>
                    )}
                    {!isConnected ? (
                      <Button
                        onClick={handleConnect}
                        disabled={isConnecting}
                        size="lg"
                        className="gap-2 min-w-[140px] cursor-pointer"
                      >
                        {isConnecting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 fill-current" />
                            Connect
                          </>
                        )}
                      </Button>
                    ) : (
                      <Button
                        onClick={handleDisconnect}
                        disabled={isDisconnecting}
                        size="lg"
                        className="gap-2 min-w-[140px] cursor-pointer bg-red-900 hover:bg-red-800 text-white transition-colors duration-200"
                      >
                        {isDisconnecting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Disconnecting...
                          </>
                        ) : (
                          <>
                            <Power className="h-4 w-4" />
                            Disconnect
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Content Section */}
            <div className="space-y-10">
              {connectionError && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>{connectionError}</AlertDescription>
                </Alert>
              )}



              {server.description && (
                <div className="pb-10 border-b">
                  <h2 className="text-xl font-semibold mb-4 flex items-center gap-2.5">
                    <Info className="h-5 w-5 text-primary" />
                    About
                  </h2>
                  <p className="text-muted-foreground leading-relaxed">
                    {server.description}
                  </p>
                </div>
              )}

              {server.hasRemote && server.remoteUrl && (
                <div className="pb-10 border-b">
                  <h2 className="text-xl font-semibold mb-4 flex items-center gap-2.5">
                    <Globe className="h-5 w-5 text-primary" />
                    Remote Endpoint
                  </h2>
                  <div className="bg-muted/50 rounded-lg p-4">
                    <div className="flex items-center justify-between gap-3">
                      <code className="text-sm font-mono break-all flex-1">
                        {server.remoteUrl}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCopyUrl}
                        className="shrink-0"
                      >
                        {copiedUrl ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    This server is accessible via remote HTTP endpoint
                  </p>
                </div>
              )}

              {server.hasPackage && (
                <div className="pb-10 border-b">
                  <h2 className="text-xl font-semibold mb-2">
                    Package Available
                  </h2>
                  <p className="text-muted-foreground">
                    This server includes installable packages
                  </p>
                </div>
              )}

              <div className="pb-10 border-b">
                <h2 className="text-xl font-semibold mb-6 flex items-center gap-2.5">
                  <Calendar className="h-5 w-5 text-primary" />
                  Metadata
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Published
                    </label>
                    <p className="mt-2 text-foreground">
                      {new Date(server.publishedAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Last Updated
                    </label>
                    <p className="mt-2 text-foreground">
                      {new Date(server.updatedAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Server ID
                    </label>
                    <p className="mt-2 font-mono text-sm break-all text-foreground/80">
                      {server.id}
                    </p>
                  </div>
                </div>
              </div>

              {(server.websiteUrl || server.repositoryUrl) && (
                <div>
                  <h2 className="text-xl font-semibold mb-6 flex items-center gap-2.5">
                    <ExternalLink className="h-5 w-5 text-primary" />
                    External Links
                  </h2>
                  <div className="flex gap-4 flex-wrap">
                    {server.websiteUrl && (
                      <Button variant="outline" asChild size="lg">
                        <a
                          href={server.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Visit Website
                        </a>
                      </Button>
                    )}
                    {server.repositoryUrl && (
                      <Button variant="outline" asChild size="lg">
                        <a
                          href={server.repositoryUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          View Source Code
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tool Execution Panel - Slides in from right */}
      <AnimatePresence>
        {toolTesterOpen && isConnected && (
          <motion.div
            key="tool-tester"
            initial={{ opacity: 0, x: 320 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 320 }}
            transition={{ duration: 0.3 }}
            className="flex-1"
          >
            <ToolExecutionPanel
              server={mcpServer}
              tools={effectiveTools}
              onClose={() => {
                setToolTesterOpen(false);
                setSelectedToolName(null);
              }}
              initialToolName={selectedToolName}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
