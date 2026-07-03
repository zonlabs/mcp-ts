"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type McpOAuthGrantRow = {
  id: string;
  client_id: string;
  client_name: string | null;
  redirect_uri: string;
  logo_uri?: string;
  scope: string;
  token_prefix: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
};

type ConnectedClientsCardProps = {
  grants: McpOAuthGrantRow[];
};

export function ConnectedClientsCard({ grants }: ConnectedClientsCardProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [items, setItems] = useState<McpOAuthGrantRow[]>(grants);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  const handleRevoke = async (id: string) => {
    setPendingId(id);
    try {
      const res = await fetch(`/api/mcp-oauth/grants/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        toast.error(data.error ?? "Revoke failed");
        return;
      }

      setItems((current) => current.filter((item) => item.id !== id));
      toast.success("Client revoked");
    } catch {
      toast.error("Network error");
    } finally {
      setPendingId(null);
    }
  };

  const revokeTarget = items.find((item) => item.id === revokeId);
  const targetClientName = revokeTarget ? (revokeTarget.client_name || revokeTarget.client_id) : "this client";

  return (
    <section id="clients" className="scroll-mt-24 space-y-4">
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">No OAuth clients connected yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((grant) => {
            return (
              <li
                key={grant.id}
                className="flex items-start justify-between gap-4 rounded-xl border border-border/70 bg-transparent px-4 py-3.5 transition-colors hover:bg-muted/10"
              >
                <div className="flex min-w-0 flex-1 gap-3.5 items-start">
                  {/* Client Logo Avatar */}
                  {grant.logo_uri ? (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-background border border-border/40 shadow-xs">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={grant.logo_uri}
                        alt={grant.client_name || "Client"}
                        className="h-full w-full object-contain p-1 rounded-lg"
                      />
                    </div>
                  ) : (
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/40 bg-zinc-500 text-white font-bold text-base shadow-xs uppercase"
                    >
                      {(grant.client_name || grant.client_id || "?").charAt(0)}
                    </div>
                  )}

                  <div className="min-w-0 flex-1 space-y-1 text-left">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                      <span className="text-sm font-semibold text-foreground">{grant.client_name || grant.client_id}</span>
                      {grant.token_prefix && (
                        <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{grant.token_prefix}...</span>
                      )}
                    </div>
                    
                    {grant.redirect_uri && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="truncate text-xs text-muted-foreground/80 cursor-help max-w-fit">
                            {grant.redirect_uri}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" align="start">
                          {grant.redirect_uri}
                        </TooltipContent>
                      </Tooltip>
                    )}

                    <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground/60">
                      <span>Authorized on {new Date(grant.created_at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "numeric", hour12: true })}</span>
                      {grant.last_used_at && (
                        <>
                          <span>•</span>
                          <span>Last used {new Date(grant.last_used_at).toLocaleDateString()}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 gap-1.5 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive self-center"
                  disabled={pendingId === grant.id}
                  onClick={() => setRevokeId(grant.id)}
                >
                  {pendingId === grant.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Revoke
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={revokeId !== null} onOpenChange={(open) => { if (!open) setRevokeId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {targetClientName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke access for &ldquo;{targetClientName}&rdquo;? It will need to authorize again to access your MCP servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => {
                if (revokeId) {
                  void handleRevoke(revokeId);
                  setRevokeId(null);
                }
              }}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
