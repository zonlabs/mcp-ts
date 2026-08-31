"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldOff,
  Clock,
  AlertTriangle,
  RefreshCw,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";

interface OAuthGrant {
  id: string;
  client: {
    id: string;
    name: string;
    uri?: string | null;
    logo_uri?: string | null;
  };
  scopes: string[];
  granted_at: string;
}

function formatFullDate(iso?: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export default function AccessPage() {
  const queryClient = useQueryClient();
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery<{ grants: OAuthGrant[] }>({
    queryKey: ["oauth-grants"],
    queryFn: async () => {
      const res = await fetch("/api/mcp-oauth/grants");
      if (!res.ok) throw new Error("Failed to load grants");
      return res.json();
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const res = await fetch(`/api/mcp-oauth/grants/${encodeURIComponent(clientId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to revoke access");
      }
      return clientId;
    },
    onSuccess: (clientId) => {
      queryClient.setQueryData<{ grants: OAuthGrant[] }>(["oauth-grants"], (old) => ({
        grants: (old?.grants ?? []).filter((g) => (g.client?.id || g.id) !== clientId),
      }));
      toast.success("Client access revoked");
      setRevokingId(null);
    },
    onError: (err: Error) => {
      toast.error(err.message);
      setRevokingId(null);
    },
  });

  const grants = data?.grants ?? [];

  return (
    <div className="flex-1 overflow-y-auto bg-background text-foreground scrollbar-minimal min-h-0">
      <div className="max-w-4xl mx-auto p-6 sm:p-8 w-full space-y-6">
      {/* 1. Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-medium tracking-tight text-foreground font-sans">
          Access &amp; Permissions
        </h1>
        <p className="text-xs text-muted-foreground font-mono">
          External applications and clients authorized to access your personal MCP endpoint
        </p>
      </div>

      {/* 2. Notice Card */}
      <div className="flex items-start gap-3 p-3.5 bg-card/60 border border-border rounded-sm">
        <AlertTriangle className="size-4 text-amber-400/90 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="text-xs font-medium text-foreground">OAuth 2.1 Authorized Clients</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            These clients (e.g. Cursor, VS Code, Claude Desktop) received OAuth authorization to use your MCP tools.
            Revoking immediately invalidates their access tokens.
          </p>
        </div>
      </div>

      {/* 3. Main Grants List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="size-3.5 text-muted-foreground" />
            <h2 className="text-[13px] font-medium text-foreground font-sans">
              Authorized Clients
            </h2>
            {grants.length > 0 && (
              <span className="text-[11px] font-mono text-muted-foreground/80">
                ({grants.length})
              </span>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading || isFetching}
            className="h-7 px-2.5 text-xs rounded-sm text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
          >
            <RefreshCw className={cn("size-3.5 mr-1.5", (isLoading || isFetching) && "animate-spin")} />
            <span>Refresh</span>
          </Button>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-2 bg-card/40 border border-border rounded-sm">
            <Loader2 className="size-5 animate-spin text-primary/80" />
            <span className="text-xs font-mono">Loading authorized clients…</span>
          </div>
        ) : grants.length === 0 ? (
          <div className="bg-card/40 border border-border rounded-sm p-12 text-center space-y-2.5">
            <CheckCircle2 className="size-7 text-emerald-400/90 mx-auto" />
            <p className="text-sm font-medium text-foreground">No active client access</p>
            <p className="text-xs text-muted-foreground font-mono max-w-sm mx-auto">
              No external tools or IDEs currently have active OAuth tokens for your MCP endpoint.
            </p>
          </div>
        ) : (
          <div className="border border-border rounded-sm divide-y divide-border overflow-hidden bg-card/40">
            {grants.map((grant) => {
              const client = grant.client || { id: grant.id, name: "MCP Client" };
              const clientId = client.id || grant.id;
              const isRevoking = revokingId === clientId;
              const firstLetter = (client.name || "C").charAt(0).toUpperCase();

              return (
                <div
                  key={clientId}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 hover:bg-card/80 transition-colors"
                >
                  {/* Left: Client Logo, Name, Scopes & Time */}
                  <div className="flex items-start gap-3.5 min-w-0">
                    {/* Client Logo / Avatar */}
                    <div className="size-10 rounded-sm bg-background border border-border flex items-center justify-center shrink-0 overflow-hidden p-1">
                      {client.logo_uri ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={client.logo_uri}
                          alt={client.name}
                          className="size-full object-contain"
                        />
                      ) : (
                        <span className="font-mono text-xs font-semibold text-muted-foreground">
                          {firstLetter}
                        </span>
                      )}
                    </div>

                    {/* Client Info */}
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-medium text-foreground truncate">
                          {client.name}
                        </p>
                        {client.uri && (
                          <SimpleTooltip content="Visit website" side="top">
                            <a
                              href={client.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              aria-label="Visit website"
                            >
                              <ExternalLink className="size-3" />
                            </a>
                          </SimpleTooltip>
                        )}
                      </div>

                      {/* Time info */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3 text-muted-foreground/70" />
                          <span>Authorized on {formatFullDate(grant.granted_at)}</span>
                        </span>
                      </div>

                      {/* Scopes pill tags */}
                      {grant.scopes && grant.scopes.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 pt-0.5">
                          {grant.scopes.map((scope) => (
                            <span
                              key={scope}
                              className="px-1.5 py-0.5 rounded-xs bg-background/80 border border-border/60 text-[10px] font-mono text-muted-foreground"
                            >
                              {scope}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Revoke Action */}
                  <div className="shrink-0 sm:self-center pl-13 sm:pl-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRevokingId(clientId);
                        revokeMutation.mutate(clientId);
                      }}
                      disabled={isRevoking}
                      className="h-7 px-3 text-xs rounded-sm border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors font-medium"
                    >
                      {isRevoking ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <>
                          <ShieldOff className="size-3.5 mr-1.5" />
                          <span>Revoke</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
