"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Globe, ArrowRight, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { ServerIcon } from "@/components/common/ServerIcon";
import type { ParsedRegistryServer } from "@/types/mcp";


interface RegistryServerCardProps {
  server: ParsedRegistryServer;
  onViewDetails?: (server: ParsedRegistryServer) => void;
}

export function RegistryServerCard({
  server,
  onViewDetails,
}: RegistryServerCardProps) {
  const displayName = server.title || server.shortName;

  const connectionStatus = server.connectionStatus;
  const isConnected = connectionStatus === 'READY';
  const isValidating = connectionStatus === 'VALIDATING';
  const isFailed = connectionStatus === 'FAILED';

  return (
    <Card className="group relative overflow-hidden transition-all duration-300 border-0 bg-transparent shadow-none">
      <div className="p-2">
        {/* Header with Avatar */}
        <div className="flex items-start gap-4 mb-4">
          {/* Server Icon */}
          <ServerIcon
            serverName={server.name}
            serverUrl={server.remoteUrl}
            size={48}
            className="rounded-xl"
          // fallbackImage={server.iconUrl || undefined}
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {server.hasRemote && (
                <Globe className="h-3.5 w-3.5 text-primary shrink-0" />
              )}
              <h3 className="font-semibold text-lg truncate text-foreground">
                {displayName}
              </h3>
              {isConnected && (
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              )}
              {isValidating && (
                <Loader2 className="h-4 w-4 text-yellow-500 animate-spin shrink-0" />
              )}
              {isFailed && (
                <XCircle className="h-4 w-4 text-destructive shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground truncate">
                {server.vendor}
              </p>
              {isConnected && (
                <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4">
                  Connected
                </Badge>
              )}
              {isValidating && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-yellow-500 text-yellow-500">
                  Validating...
                </Badge>
              )}
              {isFailed && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                  Failed
                </Badge>
              )}
            </div>
          </div>

          <Badge variant="secondary" className="shrink-0 text-xs font-mono mt-1">
            v{server.version}
          </Badge>
        </div>

        {/* Description */}
        {server.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-2 min-h-[2.5rem]">
            {server.description}
          </p>
        )}

        {/* Date Information */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground/70 mb-4">
          {server.updatedAt && (
            <span>
              Last updated: {new Date(server.updatedAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              })}
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 pt-4 border-t border-border/30">
          <div className="flex gap-2">
            {server.websiteUrl && (
              <Button
                size="sm"
                variant="ghost"
                asChild
                className="h-8 px-2 text-xs hover:text-primary transition-colors"
              >
                <a
                  href={server.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3 w-3" />
                  <span>Website</span>
                </a>
              </Button>
            )}
            {server.repositoryUrl && (
              <Button
                size="sm"
                variant="ghost"
                asChild
                className="h-8 px-2 text-xs hover:text-primary transition-colors"
              >
                <a
                  href={server.repositoryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3 w-3" />
                  <span>Source</span>
                </a>
              </Button>
            )}
          </div>

          {onViewDetails && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onViewDetails(server)}
              className="h-8 px-3 text-xs group/btn hover:text-primary transition-colors"
            >
              <span>View Details</span>
              <ArrowRight className="h-3 w-3 ml-1 group-hover/btn:translate-x-0.5 transition-transform" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
