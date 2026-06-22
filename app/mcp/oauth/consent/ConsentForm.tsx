"use client";

import { ConsentActions } from "./ConsentActions";
import { type McpOAuthConsentParams } from "@/lib/mcp-oauth";

interface ConsentFormProps {
  params: McpOAuthConsentParams;
  accountLabel: string;
  scopesList: string[];
  avatarUrl?: string | null;
}

function PermissionItem({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-start gap-2.5 text-left">
      <span className="text-muted-foreground mt-0.5 select-none font-medium">✓</span>
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-foreground leading-normal">{title}</p>
        <p className="text-xs text-muted-foreground leading-normal">{description}</p>
      </div>
    </div>
  );
}

export function ConsentForm({ params, accountLabel, scopesList, avatarUrl }: ConsentFormProps) {
  return (
    <form action="/api/mcp-oauth/approve" method="post">
      <input type="hidden" name="authorization_id" value={params.authorization_id} />

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground font-semibold text-sm">
            {avatarUrl ? (
              <img alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" src={avatarUrl} />
            ) : (
              accountLabel.charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="text-sm text-foreground">{accountLabel}</p>
          </div>
        </div>

        <hr className="border-border/40" />

        <div className="space-y-3">
          {scopesList.includes("mcp:tools:read") && (
            <PermissionItem
              title="Read access to tools"
              description="Discover and inspect connected MCP servers and tool definitions."
            />
          )}

          {scopesList.includes("mcp:tools:execute") && (
            <PermissionItem
              title="Execute tools"
              description="Call connected MCP tools and run sandboxed scripts."
            />
          )}

          {(scopesList.includes("openid") || scopesList.includes("email")) && (
            <PermissionItem
              title="Basic profile information"
              description="Access your openid identifier and email address."
            />
          )}

          {scopesList.includes("profile") && (
            <PermissionItem
              title="User profile information"
              description="Access your display name, profile picture, and general preferences."
            />
          )}
        </div>
      </div>

      <div className="mt-5">
        <ConsentActions />
      </div>
    </form>
  );
}
