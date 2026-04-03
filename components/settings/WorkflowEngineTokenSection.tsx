"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Loader2,
  Copy,
  Check,
  RefreshCw,
  Eye,
  EyeOff,
  ExternalLink,
  Plus,
  Trash2,
  ChevronDown,
  KeyRound,
  Sparkles,
  BookOpen,
} from "lucide-react";
import Link from "next/link";
import { toast } from "react-hot-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type WorkflowApiKeyRow = {
  id: string;
  key_prefix: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
};

type TokenPayload = {
  access_token: string;
  expires_at: number | null;
  expires_in: number | null;
};

function maskToken(token: string): string {
  if (token.length <= 24) return "•".repeat(Math.min(token.length, 24));
  return `${token.slice(0, 12)}${"•".repeat(24)}${token.slice(-12)}`;
}

export function WorkflowEngineTokenSection() {
  const oauthIssuer =
    process.env.NEXT_PUBLIC_WORKFLOW_OAUTH_ISSUER?.replace(/\/$/, "") ?? "";

  const [keys, setKeys] = useState<WorkflowApiKeyRow[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [keysError, setKeysError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const [secretOpen, setSecretOpen] = useState(false);
  const [plainApiKey, setPlainApiKey] = useState<string | null>(null);

  const [jwtLoading, setJwtLoading] = useState(true);
  const [jwtPayload, setJwtPayload] = useState<TokenPayload | null>(null);
  const [jwtError, setJwtError] = useState<string | null>(null);
  const [jwtRevealed, setJwtRevealed] = useState(false);
  const [jwtCopied, setJwtCopied] = useState(false);
  const [jwtRefreshing, setJwtRefreshing] = useState(false);

  const loadKeys = useCallback(async () => {
    setKeysLoading(true);
    setKeysError(null);
    try {
      const res = await fetch("/api/workflow-api-keys", { credentials: "include" });
      const data = (await res.json()) as { keys?: WorkflowApiKeyRow[]; error?: string };
      if (!res.ok) {
        setKeys([]);
        setKeysError(data.error ?? "Could not load API keys");
        return;
      }
      setKeys(data.keys ?? []);
    } catch {
      setKeys([]);
      setKeysError("Network error");
    } finally {
      setKeysLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  const loadJwt = useCallback(async () => {
    setJwtLoading(true);
    setJwtError(null);
    try {
      const res = await fetch("/api/auth/access-token", { credentials: "include" });
      const data = (await res.json()) as TokenPayload & { error?: string };
      if (!res.ok) {
        setJwtPayload(null);
        setJwtError(data.error ?? "No session");
        return;
      }
      setJwtPayload({
        access_token: data.access_token,
        expires_at: data.expires_at,
        expires_in: data.expires_in,
      });
    } catch {
      setJwtPayload(null);
      setJwtError("Network error");
    } finally {
      setJwtLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJwt();
  }, [loadJwt]);

  const handleCreateKey = async () => {
    setCreateSubmitting(true);
    try {
      const res = await fetch("/api/workflow-api-keys", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim() || undefined }),
      });
      const data = (await res.json()) as { api_key?: string; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Could not create key");
        return;
      }
      if (data.api_key) {
        setPlainApiKey(data.api_key);
        setSecretOpen(true);
        setCreateOpen(false);
        setNewLabel("");
        toast.success("API key created — copy it now; it will not be shown again.");
        void loadKeys();
      }
    } catch {
      toast.error("Network error");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this key? Any MCP client or script using it will stop working.")) {
      return;
    }
    try {
      const res = await fetch(`/api/workflow-api-keys/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        toast.error(j.error ?? "Revoke failed");
        return;
      }
      toast.success("Key revoked");
      void loadKeys();
    } catch {
      toast.error("Network error");
    }
  };

  const copyPlainKey = async () => {
    if (!plainApiKey) return;
    try {
      await navigator.clipboard.writeText(plainApiKey);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  const closeSecretDialog = () => {
    setSecretOpen(false);
    setPlainApiKey(null);
  };

  const jwtExpiresLabel =
    jwtPayload?.expires_at != null
      ? new Date(jwtPayload.expires_at * 1000).toLocaleString()
      : jwtPayload?.expires_in != null
        ? `in ~${Math.round(jwtPayload.expires_in / 60)} min`
        : null;

  const authorizeUrl =
    oauthIssuer.length > 0
      ? `${oauthIssuer}/oauth/authorize?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_REDIRECT&code_challenge=...&code_challenge_method=S256`
      : null;

  return (
    <section>
      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="border-b border-border/80 bg-muted/20 pb-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background shadow-xs">
              <KeyRound className="h-5 w-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1.5">
              <CardTitle className="text-lg tracking-tight">Workflow Automation Engine</CardTitle>
              <CardDescription className="text-pretty leading-relaxed">
                Revocable API keys for MCP clients and automation. Use as{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.7rem]">
                  Authorization: Bearer
                </code>{" "}
                on the engine and when authorizing OAuth.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-8 pt-6">
          <div className="flex gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3.5 dark:bg-primary/10">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">Recommended</span>
                <Badge variant="secondary" className="text-[0.65rem] font-normal">
                  Most secure
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Create a workflow API key below instead of copying session tokens. Secrets are stored
                as a hash; you only see the full key once. Revoke anytime.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold tracking-tight">Your API keys</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Keys start with <code className="rounded bg-muted px-1 font-mono">wfmcp_</code>
                </p>
              </div>
              <Button type="button" size="sm" className="shrink-0" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Create key
              </Button>
            </div>

            {keysLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading keys…
              </div>
            ) : keysError ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {keysError}
              </div>
            ) : keys.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No keys yet. Create one to connect MCP clients and scripts to the engine.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {keys.map((k) => (
                  <li
                    key={k.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/30"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-medium tracking-wide">{k.key_prefix}…</p>
                      {k.label && (
                        <p className="text-muted-foreground text-xs mt-0.5">{k.label}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Created {new Date(k.created_at).toLocaleDateString()}
                        {k.last_used_at &&
                          ` · Last used ${new Date(k.last_used_at).toLocaleDateString()}`}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => void handleRevoke(k.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <BookOpen className="h-4 w-4 text-muted-foreground" aria-hidden />
              ChatGPT, Claude, and other MCP apps
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Connecting from{" "}
              <span className="font-medium text-foreground">ChatGPT</span>,{" "}
              <span className="font-medium text-foreground">Claude</span>,{" "}
              <span className="font-medium text-foreground">Cursor</span>, or any client that supports{" "}
              <span className="font-medium text-foreground">MCP</span>? Create a{" "}
              <span className="font-medium text-foreground">workflow API key</span> above. When your
              app opens the Workflow Automation Engine sign-in page in the browser, paste that key there
              to complete setup (or use a short-lived session token from Advanced below). The app then
              keeps the access token it receives and uses it to talk to the engine—no need to copy it
              again.
            </p>
            {!oauthIssuer && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-950 dark:text-amber-100/90">
                Set <code className="font-mono">NEXT_PUBLIC_WORKFLOW_OAUTH_ISSUER</code> to your engine
                base URL to show full endpoints and links.
              </p>
            )}
            {oauthIssuer ? (
              <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
                <a
                  href={`${oauthIssuer}/.well-known/oauth-authorization-server`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  OAuth server metadata
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            ) : null}
            {authorizeUrl ? (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Example authorize URL:</span>{" "}
                <code className="mt-1 block break-all rounded-md bg-muted px-2 py-1.5 font-mono text-[0.65rem]">
                  {authorizeUrl}
                </code>
              </p>
            ) : null}
          </div>

          <Collapsible className="rounded-xl border border-border bg-muted/10">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left text-sm font-medium hover:bg-muted/40 rounded-xl [&[data-state=open]>svg]:rotate-180 transition-colors">
              <span>Advanced · Session JWT (short-lived)</span>
              <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 border-t border-border px-4 pb-4 pt-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Same access token as your signed-in browser session. Prefer workflow API keys when
                possible.
              </p>
              {jwtLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading…
                </div>
              ) : jwtError && !jwtPayload ? (
                <div className="space-y-2 text-sm">
                  <p className="text-destructive">{jwtError}</p>
                  <Link href="/signin" className="text-sm text-primary underline">
                    Sign in
                  </Link>
                </div>
              ) : jwtPayload ? (
                <div className="space-y-2">
                  <Label className="text-xs">JWT</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      readOnly
                      className="font-mono text-xs"
                      value={jwtRevealed ? jwtPayload.access_token : maskToken(jwtPayload.access_token)}
                    />
                    <div className="flex shrink-0 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setJwtRevealed((r) => !r)}
                      >
                        {jwtRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(jwtPayload.access_token);
                            setJwtCopied(true);
                            toast.success("Copied");
                            setTimeout(() => setJwtCopied(false), 2000);
                          } catch {
                            toast.error("Could not copy");
                          }
                        }}
                      >
                        {jwtCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={jwtRefreshing}
                        onClick={async () => {
                          setJwtRefreshing(true);
                          try {
                            const res = await fetch("/api/auth/refresh-session", {
                              method: "POST",
                              credentials: "include",
                            });
                            const d = (await res.json()) as TokenPayload & { error?: string };
                            if (!res.ok) {
                              toast.error(d.error ?? "Refresh failed");
                              return;
                            }
                            setJwtPayload({
                              access_token: d.access_token,
                              expires_at: d.expires_at,
                              expires_in: d.expires_in,
                            });
                            setJwtRevealed(false);
                            toast.success("Session refreshed");
                          } catch {
                            toast.error("Network error");
                          } finally {
                            setJwtRefreshing(false);
                          }
                        }}
                      >
                        {jwtRefreshing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  {jwtExpiresLabel && (
                    <p className="text-xs text-muted-foreground">Expires: {jwtExpiresLabel}</p>
                  )}
                </div>
              ) : null}
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create workflow API key</DialogTitle>
            <DialogDescription>
              Optional label helps you remember where you use this key. The secret is shown only once
              after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="key-label">Label (optional)</Label>
            <Input
              id="key-label"
              placeholder="e.g. Claude Desktop, CI"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleCreateKey()} disabled={createSubmitting}>
              {createSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={secretOpen} onOpenChange={(o) => !o && closeSecretDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Copy your API key</DialogTitle>
            <DialogDescription>
              Store it in a password manager. You cannot view it again after closing this dialog.
            </DialogDescription>
          </DialogHeader>
          {plainApiKey && (
            <div className="space-y-2">
              <Input readOnly className="font-mono text-xs" value={plainApiKey} />
              <Button type="button" variant="outline" size="sm" onClick={() => void copyPlainKey()}>
                <Copy className="h-4 w-4 mr-2" />
                Copy to clipboard
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button type="button" onClick={closeSecretDialog}>
              I have saved it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
