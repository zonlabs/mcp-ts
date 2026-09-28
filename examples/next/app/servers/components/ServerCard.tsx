"use client";

import * as React from "react";
import {
  Globe,
  Shield,
  Key,
  Layers,
  Power,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  SlidersHorizontal,
  Sparkles,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { McpServerItem } from "../types";

interface ServerCardProps {
  server: McpServerItem;
  authorizingId: string | null;
  onToggleEnabled: (server: McpServerItem) => void;
  onConnectOAuth: (server: McpServerItem) => void;
  onOpenPolicy: (server: McpServerItem) => void;
  onDelete: (serverId: string) => void;
}

export function ServerCard({
  server,
  authorizingId,
  onToggleEnabled,
  onConnectOAuth,
  onOpenPolicy,
  onDelete,
}: ServerCardProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopyId = () => {
    navigator.clipboard.writeText(server.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusBadge = () => {
    switch (server.status?.state) {
      case "connected":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Connected
          </span>
        );
      case "auth_required":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Key className="w-3 h-3" />
            Auth Required
          </span>
        );
      case "error":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <AlertCircle className="w-3 h-3" />
            Error
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
            Disconnected
          </span>
        );
    }
  };

  const getAuthBadge = () => {
    const authType = server.auth?.type || "none";
    switch (authType) {
      case "oauth":
        return (
          <Badge variant="outline" className="text-xs bg-indigo-500/5 text-indigo-600 dark:text-indigo-400 border-indigo-500/20">
            OAuth 2.1
          </Badge>
        );
      case "bearer":
        return (
          <Badge variant="outline" className="text-xs bg-sky-500/5 text-sky-600 dark:text-sky-400 border-sky-500/20">
            Bearer Token
          </Badge>
        );
      case "custom-headers":
        return (
          <Badge variant="outline" className="text-xs bg-amber-500/5 text-amber-600 dark:text-amber-400 border-amber-500/20">
            Custom Headers
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-xs text-muted-foreground border-border">
            No Auth
          </Badge>
        );
    }
  };

  const getPolicyBadge = () => {
    const policy = server.toolPolicy;
    if (!policy || policy.mode === "all") {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
          <Layers className="w-3 h-3 text-muted-foreground/80" />
          All tools allowed
        </span>
      );
    }
    if (policy.mode === "allowlist") {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
          <Shield className="w-3 h-3" />
          Allowlist ({policy.toolIds.length})
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
        <Shield className="w-3 h-3" />
        Denylist ({policy.toolIds.length} blocked)
      </span>
    );
  };

  const customMetadataEntries = React.useMemo(() => {
    if (!server.metadata || typeof server.metadata !== "object") return [];
    return Object.entries(server.metadata).slice(0, 4);
  }, [server.metadata]);

  return (
    <div
      className={`group relative rounded-xl border p-5 transition-all duration-200 bg-card hover:shadow-md ${
        server.enabled
          ? "border-border/80 hover:border-primary/40"
          : "border-border/40 opacity-70 bg-muted/20"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
            <Globe className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-base tracking-tight truncate text-foreground">
                {server.name}
              </h3>
              {getStatusBadge()}
              {getAuthBadge()}
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate font-mono">
              {server.url}
            </p>
          </div>
        </div>

        {/* Server ID & Copy */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleCopyId}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-transparent hover:border-border"
            title="Copy Server ID"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-500" />
                <span className="text-emerald-500">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>{server.id}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Description */}
      {server.description && (
        <p className="text-xs text-muted-foreground mt-3 line-clamp-2 leading-relaxed">
          {server.description}
        </p>
      )}

      {/* Error message banner if any */}
      {server.status?.state === "error" && server.status.message && (
        <div className="mt-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="break-all">{server.status.message}</span>
        </div>
      )}

      {/* Tags / Metadata Preview */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {getPolicyBadge()}

        {customMetadataEntries.map(([key, val]) => (
          <span
            key={key}
            className="text-[11px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded border border-border/50 max-w-[200px] truncate"
            title={`${key}: ${typeof val === "object" ? JSON.stringify(val) : String(val)}`}
          >
            <span className="font-semibold text-foreground/70">{key}:</span>{" "}
            {typeof val === "object" ? JSON.stringify(val) : String(val)}
          </span>
        ))}
      </div>

      {/* Footer Actions */}
      <div className="mt-5 pt-3.5 border-t border-border/60 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {server.status?.state === "auth_required" && (
            <Button
              size="sm"
              variant="default"
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-8 gap-1.5 shadow-sm"
              onClick={() => onConnectOAuth(server)}
              disabled={authorizingId === server.id}
            >
              {authorizingId === server.id ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Authorizing...
                </>
              ) : (
                <>
                  <Key className="w-3.5 h-3.5" />
                  Connect OAuth
                </>
              )}
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            className="text-xs h-8 gap-1.5 hover:bg-muted"
            onClick={() => onOpenPolicy(server)}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
            Tools & Policy
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className={`h-8 px-2 text-xs gap-1.5 ${
              server.enabled
                ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => onToggleEnabled(server)}
            title={server.enabled ? "Disable server" : "Enable server"}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{server.enabled ? "Active" : "Disabled"}</span>
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => onDelete(server.id)}
            title="Delete server"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
