"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";

export type WorkflowOAuthGrantRow = {
  id: string;
  client_id: string;
  client_name: string | null;
  redirect_uri: string;
  scope: string;
  token_prefix: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
};

type ConnectedClientsCardProps = {
  grants: WorkflowOAuthGrantRow[];
};

export function ConnectedClientsCard({ grants }: ConnectedClientsCardProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [items, setItems] = useState(grants);

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this connected MCP client? It will need to authorize again.")) {
      return;
    }

    setPendingId(id);
    try {
      const res = await fetch(`/api/workflow-oauth/grants/${id}`, {
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

  return (
    <section id="clients" className="scroll-mt-24 space-y-4 bg-background p-4 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em]">Connected MCP clients</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          OAuth clients authorized from the consent screen.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">No OAuth clients connected yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((grant) => {
            const expiresLabel = grant.expires_at ? new Date(grant.expires_at).toLocaleDateString() : "Never";

            return (
              <li
                key={grant.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-transparent px-3 py-3 transition-colors hover:bg-muted/20"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <p className="text-sm font-semibold text-foreground">{grant.client_name || grant.client_id}</p>
                    <p className="font-mono text-xs text-muted-foreground">{grant.token_prefix}...</p>
                  </div>
                  <p className="break-all text-xs text-muted-foreground/90">
                    Expires {expiresLabel}
                    {grant.last_used_at
                      ? ` - Last used ${new Date(grant.last_used_at).toLocaleDateString()}`
                      : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 gap-1.5 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={pendingId === grant.id}
                  onClick={() => void handleRevoke(grant.id)}
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
    </section>
  );
}
