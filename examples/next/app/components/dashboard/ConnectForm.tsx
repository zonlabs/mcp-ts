"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { ConnectConfig } from "./types";

interface ConnectFormProps {
  onConnect: (config: ConnectConfig) => Promise<void>;
  connecting: boolean;
  status: string;
  error: string | null;
}

export default function ConnectForm({
  onConnect,
  connecting,
  status,
  error,
}: ConnectFormProps) {
  const [serverName, setServerName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [transportType, setTransportType] = useState<
    "sse" | "streamable-http" | "auto"
  >("auto");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showOAuth, setShowOAuth] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const callbackUrl = `${window.location.origin}/oauth/callback-popup`;
    await onConnect({
      serverName,
      serverUrl,
      callbackUrl,
      transportType,
      clientId: clientId.trim() || undefined,
      clientSecret: clientSecret.trim() || undefined,
    });
    setServerName("");
    setServerUrl("");
    setClientId("");
    setClientSecret("");
  };

  const sseReady = status === "connected";

  return (
    <section className="rounded-xl border border-border/80 bg-card/50 p-4 shadow-sm ring-1 ring-foreground/5">
      <h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
        Add server
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="space-y-1.5">
          <label
            htmlFor="serverName"
            className="text-xs font-medium text-muted-foreground"
          >
            Name
          </label>
          <Input
            id="serverName"
            value={serverName}
            onChange={(e) => setServerName(e.target.value)}
            placeholder="My MCP server"
            required
            disabled={connecting}
            className="h-9"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="serverUrl"
            className="text-xs font-medium text-muted-foreground"
          >
            Server URL
          </label>
          <Input
            id="serverUrl"
            type="url"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="https://…"
            required
            disabled={connecting}
            className="h-9"
          />
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Transport
          </span>
          <Select
            value={transportType}
            onValueChange={(v) =>
              setTransportType(v as "sse" | "streamable-http" | "auto")
            }
            disabled={connecting}
          >
            <SelectTrigger className="h-9 w-full">
              <SelectValue placeholder="Transport" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="streamable-http">Streamable HTTP</SelectItem>
              <SelectItem value="sse">SSE</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Auto lets the client negotiate the best transport.
          </p>
        </div>

        <div className="space-y-1.5 border-t border-border/40 pt-2">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowOAuth((prev) => !prev)}
          >
            <span className="text-[10px]">{showOAuth ? "▲" : "▼"}</span>
            <span>OAuth Client Credentials (Optional - Bypass DCR)</span>
          </button>
          {showOAuth && (
            <div className="mt-2 flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/30 p-2.5">
              <div className="space-y-1">
                <label
                  htmlFor="clientId"
                  className="text-[11px] font-medium text-muted-foreground"
                >
                  Client ID
                </label>
                <Input
                  id="clientId"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="Pre-registered Client ID"
                  disabled={connecting}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="clientSecret"
                  className="text-[11px] font-medium text-muted-foreground"
                >
                  Client Secret
                </label>
                <Input
                  id="clientSecret"
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="Pre-registered Client Secret"
                  disabled={connecting}
                  className="h-8 text-xs"
                />
              </div>
              <p className="text-[10px] leading-snug text-muted-foreground">
                Providing Client ID bypasses Dynamic Client Registration (DCR).
              </p>
            </div>
          )}
        </div>

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={connecting || !sseReady}
          className="h-9 w-full gap-2"
        >
          {connecting ? (
            <>
              <Spinner className="size-3.5" />
              Connecting…
            </>
          ) : (
            "Connect"
          )}
        </Button>

        {!sseReady ? (
          <p className="text-center text-[11px] text-muted-foreground">
            Waiting for transport…
          </p>
        ) : null}
      </form>
    </section>
  );
}
