"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "react-hot-toast";
import {
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  if (token.length <= 24) return "*".repeat(Math.min(token.length, 24));
  return `${token.slice(0, 12)}${"*".repeat(24)}${token.slice(-12)}`;
}

const WORKFLOW_ENGINE_SITE_URL = "https://run.mcp-assistant.in";
const WORKFLOW_MCP_HTTP_URL = `${WORKFLOW_ENGINE_SITE_URL}/api/mcp`;

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
  const [urlCopied, setUrlCopied] = useState(false);

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
        toast.success("API key created - copy it now; it will not be shown again.");
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

  const copyServerUrl = async () => {
    try {
      await navigator.clipboard.writeText(WORKFLOW_MCP_HTTP_URL);
      setUrlCopied(true);
      toast.success("Copied");
      setTimeout(() => setUrlCopied(false), 2000);
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
    <section className="space-y-6">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 space-y-1">
          <h2 className="text-xl font-instrument-serif font-medium tracking-wide">Workflow Automation Engine</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Create revocable keys for MCP clients and automation.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Endpoint</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <code className="block rounded-md bg-muted px-2.5 py-2 font-mono text-[0.72rem] text-foreground sm:inline-block">
              {WORKFLOW_MCP_HTTP_URL}
            </code>
            <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5" onClick={() => void copyServerUrl()}>
              {urlCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              Copy URL
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {oauthIssuer ? (
              <a
                href={`${oauthIssuer}/.well-known/oauth-authorization-server`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <Link2 className="h-3.5 w-3.5" />
                OAuth metadata
              </a>
            ) : null}
            <a
              href={WORKFLOW_ENGINE_SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open engine
            </a>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-medium uppercase tracking-[0.16em]">Your API keys</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Keys start with <code className="rounded bg-muted px-1 font-mono">wfmcp_</code>
            </p>
          </div>
          <Button type="button" size="sm" className="shrink-0" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Create key
          </Button>
        </div>

        {keysLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading keys...
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
                className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-transparent px-3 py-2 transition-colors"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <p className="font-mono text-xs font-medium tracking-wide text-foreground">{k.key_prefix}...</p>
                    {k.label ? <p className="text-xs text-muted-foreground">{k.label}</p> : null}
                  </div>
                  <p className="text-xs text-muted-foreground/90">
                    Created {new Date(k.created_at).toLocaleDateString()}
                    {k.last_used_at ? ` · Last used ${new Date(k.last_used_at).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 gap-1.5 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void handleRevoke(k.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Separator />

      <Collapsible className="rounded-xl border border-border/70 bg-card/20 px-4 py-3">
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium text-foreground transition-colors hover:text-foreground/80 [&[data-state=open]>svg]:rotate-180">
          <span className="inline-flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" aria-hidden />
            How to connect to MCP clients
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            For ChatGPT, Claude, Cursor, and other MCP-compatible apps: create a workflow API key,
            then paste it into the Workflow Automation Engine sign-in page when the client opens it.
          </p>
          {authorizeUrl ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">Example authorize URL</p>
              <code className="block break-all rounded-md bg-muted px-2 py-1.5 font-mono text-[0.65rem]">
                {authorizeUrl}
              </code>
            </div>
          ) : null}
        </CollapsibleContent>
      </Collapsible>

      <Collapsible className="rounded-xl border border-border/70 bg-card/20 px-4 py-3">
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium text-foreground transition-colors hover:text-foreground/80 [&[data-state=open]>svg]:rotate-180">
          <span>Advanced · Session JWT</span>
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Uses your current signed-in browser session. Prefer workflow API keys when possible.
          </p>
          {jwtLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
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
              <div className="flex gap-2">
                <Input
                  readOnly
                  className="font-mono text-xs"
                  value={jwtRevealed ? jwtPayload.access_token : maskToken(jwtPayload.access_token)}
                />
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setJwtRevealed((r) => !r)}
                  >
                    {jwtRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
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
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
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
                    {jwtRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              {jwtExpiresLabel ? (
                <p className="text-xs text-muted-foreground">Expires: {jwtExpiresLabel}</p>
              ) : null}
            </div>
          ) : null}
        </CollapsibleContent>
      </Collapsible>

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
          {plainApiKey ? (
            <div className="space-y-2">
              <Input readOnly className="font-mono text-xs" value={plainApiKey} />
              <Button type="button" variant="outline" size="sm" onClick={() => void copyPlainKey()}>
                <Copy className="mr-2 h-4 w-4" />
                Copy to clipboard
              </Button>
            </div>
          ) : null}
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
