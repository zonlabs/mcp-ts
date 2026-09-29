"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Server,
  Globe,
  Key,
  Shield,
  Code,
  Check,
  AlertCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";

interface CreateServerModalProps {
  isOpen: boolean;
  userId: string;
  onClose: () => void;
  onCreated: (createdServer: any) => void;
}

export function CreateServerModal({
  isOpen,
  userId,
  onClose,
  onCreated,
}: CreateServerModalProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Form Fields
  const [name, setName] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [serverId, setServerId] = React.useState("");
  const [authType, setAuthType] = React.useState<"none" | "bearer" | "custom-headers" | "oauth">("none");
  const [bearerToken, setBearerToken] = React.useState("");
  const [customHeaders, setCustomHeaders] = React.useState("");
  const [oauthClientId, setOauthClientId] = React.useState("");
  const [oauthScopes, setOauthScopes] = React.useState("");
  const [clientMetadataUrl, setClientMetadataUrl] = React.useState("");

  // Raw JSON Metadata
  const [rawMetadata, setRawMetadata] = React.useState("");
  const [metadataError, setMetadataError] = React.useState<string | null>(null);

  // Live JSON validation
  React.useEffect(() => {
    if (!rawMetadata.trim()) {
      setMetadataError(null);
      return;
    }
    try {
      const parsed = JSON.parse(rawMetadata.trim());
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setMetadataError("Metadata must be a JSON object {...}");
      } else {
        setMetadataError(null);
      }
    } catch (e: any) {
      setMetadataError(e.message || "Invalid JSON syntax");
    }
  }, [rawMetadata]);

  const handleFormatJson = () => {
    if (!rawMetadata.trim()) return;
    try {
      const parsed = JSON.parse(rawMetadata.trim());
      setRawMetadata(JSON.stringify(parsed, null, 2));
      setMetadataError(null);
    } catch {}
  };

  const handleReset = () => {
    setName("");
    setUrl("");
    setDescription("");
    setServerId("");
    setAuthType("none");
    setBearerToken("");
    setCustomHeaders("");
    setOauthClientId("");
    setOauthScopes("");
    setClientMetadataUrl("");
    setRawMetadata("");
    setMetadataError(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;

    if (metadataError) {
      setError("Please fix the JSON metadata error before saving");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      // Parse metadata
      let parsedMetadata: Record<string, unknown> | undefined = undefined;
      if (rawMetadata.trim()) {
        parsedMetadata = JSON.parse(rawMetadata.trim());
      }

      // Build Auth payload
      let auth: any = { type: authType };
      if (authType === "bearer" && bearerToken.trim()) {
        auth.token = bearerToken.trim();
      } else if (authType === "custom-headers" && customHeaders.trim()) {
        try {
          auth.headers = customHeaders.trim().startsWith("{")
            ? JSON.parse(customHeaders.trim())
            : Object.fromEntries(
                customHeaders
                  .split("\n")
                  .filter((l) => l.includes(":"))
                  .map((l) => {
                    const idx = l.indexOf(":");
                    return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
                  })
              );
        } catch {
          auth.headers = {};
        }
      } else if (authType === "oauth") {
        auth.type = "oauth";
        if (oauthClientId.trim() || oauthScopes.trim() || clientMetadataUrl.trim()) {
          auth.config = {
            clientId: oauthClientId.trim() || undefined,
            clientMetadataUrl: clientMetadataUrl.trim() || undefined,
            scopes: oauthScopes
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          };
        }
      }

      const payload = {
        userId,
        name: name.trim(),
        url: url.trim(),
        description: description.trim() || undefined,
        serverId: serverId.trim() || undefined,
        auth,
        metadata: parsedMetadata,
        callbackUrl: `${window.location.origin}/oauth/callback`,
      };

      const res = await fetch("/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to create MCP server");
      }

      const created = await res.json().catch(() => null);
      handleReset();
      onCreated(created);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to create server");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-card border-border">
        {/* Header */}
        <DialogHeader className="p-6 pb-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">
                Connect New MCP Server
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Register an MCP server endpoint for user{" "}
                <code className="text-[11px] font-mono font-semibold text-foreground">
                  {userId}
                </code>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Server Name & ID */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground/80 flex items-center gap-1">
                Server Name <span className="text-rose-500">*</span>
              </label>
              <Input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Exa Search MCP"
                className="text-xs h-9 bg-card"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground/80 flex items-center justify-between">
                <span>Server ID</span>
                <span className="text-[10px] text-muted-foreground font-normal">Optional</span>
              </label>
              <Input
                value={serverId}
                onChange={(e) => setServerId(e.target.value)}
                placeholder="Auto-generated if empty"
                className="text-xs h-9 font-mono bg-card"
              />
            </div>
          </div>

          {/* Endpoint URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground/80 flex items-center gap-1">
              MCP Server Endpoint URL <span className="text-rose-500">*</span>
            </label>
            <Input
              required
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mcp.example.com/sse"
              className="text-xs h-9 font-mono bg-card"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground/80 flex items-center justify-between">
              <span>Description</span>
              <span className="text-[10px] text-muted-foreground font-normal">Optional</span>
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief explanation of tools provided by this server"
              className="text-xs h-9 bg-card"
            />
          </div>

          {/* Authentication Type */}
          <div className="space-y-2 pt-2 border-t border-border/40">
            <label className="text-xs font-semibold text-foreground/80 block">
              Authentication Method
            </label>
            <div className="grid grid-cols-4 gap-1.5 p-1 bg-muted/40 rounded-lg border border-border/50">
              {[
                { id: "none", label: "None" },
                { id: "bearer", label: "Bearer" },
                { id: "custom-headers", label: "Headers" },
                { id: "oauth", label: "OAuth 2.1" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setAuthType(tab.id as any)}
                  className={`px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                    authType === tab.id
                      ? "bg-card text-foreground shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {authType === "bearer" && (
              <div className="space-y-1.5 pt-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Bearer Token
                </label>
                <Input
                  type="password"
                  value={bearerToken}
                  onChange={(e) => setBearerToken(e.target.value)}
                  placeholder="Secret token (e.g. ghp_...)"
                  className="text-xs h-9 font-mono bg-card"
                />
              </div>
            )}

            {authType === "custom-headers" && (
              <div className="space-y-1.5 pt-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Custom Headers (Key: Value or JSON object)
                </label>
                <Textarea
                  value={customHeaders}
                  onChange={(e) => setCustomHeaders(e.target.value)}
                  placeholder={"X-API-Key: secret_key\nX-Custom-Header: value"}
                  rows={2}
                  className="text-xs font-mono bg-card"
                />
              </div>
            )}

            {authType === "oauth" && (
              <div className="space-y-2 pt-1.5">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Client ID (Optional)
                    </label>
                    <Input
                      value={oauthClientId}
                      onChange={(e) => setOauthClientId(e.target.value)}
                      placeholder="Auto-registered if empty"
                      className="text-xs h-8 font-mono bg-card"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Scopes (comma separated)
                    </label>
                    <Input
                      value={oauthScopes}
                      onChange={(e) => setOauthScopes(e.target.value)}
                      placeholder="mcp:tools, user:read"
                      className="text-xs h-8 bg-card"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Client Metadata Document URL (CIMD, Optional)
                  </label>
                  <Input
                    value={clientMetadataUrl}
                    onChange={(e) => setClientMetadataUrl(e.target.value)}
                    placeholder="https://myapp.com/oauth/client-metadata.json"
                    className="text-xs h-8 font-mono bg-card"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Auto-discovers endpoints via RFC 9207 & RFC 9728. Browser popup opens on creation.
                </p>
              </div>
            )}
          </div>

          {/* RAW JSON METADATA INPUT */}
          <div className="space-y-2 pt-2 border-t border-border/40">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
                <Code className="w-3.5 h-3.5 text-primary" />
                <span>Custom JSON Metadata</span>
              </label>

              <div className="flex items-center gap-2">
                {rawMetadata.trim() && (
                  <>
                    {metadataError ? (
                      <span className="text-[10px] font-medium text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded">
                        Invalid JSON
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" />
                        Valid JSON
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={handleFormatJson}
                      className="text-[11px] text-primary hover:underline"
                    >
                      Format
                    </button>
                  </>
                )}
              </div>
            </div>

            <Textarea
              value={rawMetadata}
              onChange={(e) => setRawMetadata(e.target.value)}
              placeholder={'{\n  "environment": "production",\n  "team": "ai-infra",\n  "region": "us-east-1"\n}'}
              rows={4}
              className={`text-xs font-mono bg-card leading-relaxed ${
                metadataError ? "border-rose-500 focus-visible:ring-rose-500/20" : ""
              }`}
            />

            {metadataError && (
              <p className="text-[11px] text-rose-500 font-mono">{metadataError}</p>
            )}

            <p className="text-[11px] text-muted-foreground">
              Paste or type arbitrary JSON. Stored strictly in <code className="text-[10px] font-mono">server.metadata</code> without polluting system fields.
            </p>
          </div>
        </form>

        {/* Footer */}
        <DialogFooter className="p-4 border-t border-border/60 bg-card flex items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-xs h-8"
            onClick={onClose}
          >
            Cancel
          </Button>

          <Button
            type="button"
            size="sm"
            className="text-xs h-8 gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
            onClick={handleSubmit}
            disabled={isSubmitting || Boolean(metadataError)}
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Connecting Server...
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                Register MCP Server
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
