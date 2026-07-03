"use client";

import { useMemo, useState } from "react";
import { ShieldCheck, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ServerIcon } from "@/components/common/ServerIcon";
import { ToolAccessDialog } from "@/components/mcp-client/ToolAccessDialog";
import { useMcpStore, type StoredConnection } from "@/lib/stores/mcp-store";
import type { McpServer, ToolPolicyMode } from "@/types/mcp";

function PolicyBadge({ mode }: { mode?: ToolPolicyMode | null }) {
  if (!mode || mode === "all") {
    return (
      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
        All tools allowed
      </span>
    );
  }
  return (
    <span className={`text-xs font-medium ${
      mode === "allowlist"
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400"
    }`}>
      {mode === "allowlist" ? "Allowlist" : "Denylist"}
    </span>
  );
}

function connectionToServer(conn: StoredConnection): McpServer {
  return {
    id: conn.serverId,
    name: conn.serverName,
    url: conn.url,
    transport: conn.transport || "streamable-http",
    requiresOauth2: false,
    updated_at: conn.connectedAt,
    tools: conn.tools,
    connectionStatus: conn.connectionStatus,
  };
}

export default function ToolPolicyView() {
  const connections = useMcpStore((state) => state.connections);
  const [dialogServer, setDialogServer] = useState<McpServer | null>(null);
  const [dialogConnection, setDialogConnection] = useState<StoredConnection | null>(null);

  const activeConnections = useMemo(
    () => Object.values(connections).filter((c) => c.connectionStatus === "READY"),
    [connections]
  );

  return (
    <>
      <section className="space-y-4">
          {activeConnections.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
              <ShieldCheck className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No connected MCP servers.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Connect to a server first to manage its tool policy.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeConnections.map((conn) => (
                <div
                  key={conn.sessionId}
                  className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-transparent px-4 py-3.5 transition-colors hover:bg-muted/10"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <ServerIcon
                      serverName={conn.serverName}
                      serverUrl={conn.url}
                      size={36}
                      className="rounded-lg shrink-0"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground truncate">
                          {conn.serverName}
                        </span>
                        <PolicyBadge mode={conn.toolPolicy?.mode} />
                      </div>
                      <p className="text-xs text-muted-foreground/70 truncate">
                        {conn.tools.length} tool{conn.tools.length !== 1 ? "s" : ""} available
                        {conn.url ? ` · ${conn.url}` : ""}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 gap-1.5"
                    onClick={() => {
                      setDialogServer(connectionToServer(conn));
                      setDialogConnection(conn);
                    }}
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Manage
                  </Button>
                </div>
              ))}
            </div>
          )}
      </section>

      {dialogServer && (
        <ToolAccessDialog
          server={dialogServer}
          connection={dialogConnection ?? undefined}
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setDialogServer(null);
              setDialogConnection(null);
            }
          }}
        />
      )}
    </>
  );
}
