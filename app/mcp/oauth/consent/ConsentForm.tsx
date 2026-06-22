"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { ConsentActions } from "./ConsentActions";
import { type McpOAuthConsentParams } from "@/lib/mcp-oauth";

interface ConsentFormProps {
  params: McpOAuthConsentParams;
  accountLabel: string;
  scopesList: string[];
}

export function ConsentForm({ params, accountLabel, scopesList }: ConsentFormProps) {
  return (
    <form action="/api/mcp-oauth/approve" className="space-y-4 pt-2" method="post">
      {/* Hidden Fields */}
      <input type="hidden" name="authorization_id" value={params.authorization_id} />

      {/* Access requested list with checkboxes */}
      <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Signed in as</p>
          <p className="mt-0.5 break-words text-sm font-semibold">{accountLabel}</p>
        </div>

        <div className="space-y-2.5">
          <p className="text-xs font-medium text-muted-foreground">Access requested</p>
          <div className="space-y-3">
            {scopesList.includes("mcp:tools:read") && (
              <label className="flex items-start gap-3 cursor-not-allowed select-none">
                <Checkbox
                  id="scope-read"
                  checked={true}
                  disabled={true}
                  className="mt-[3px]"
                />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium leading-none">Read access to tools</p>
                  <p className="text-xs text-muted-foreground leading-normal">Discover and inspect connected MCP servers and tool definitions.</p>
                </div>
              </label>
            )}

            {scopesList.includes("mcp:tools:execute") && (
              <label className="flex items-start gap-3 cursor-not-allowed select-none">
                <Checkbox
                  id="scope-execute"
                  checked={true}
                  disabled={true}
                  className="mt-[3px]"
                />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium leading-none">Execute tools</p>
                  <p className="text-xs text-muted-foreground leading-normal">Call connected MCP tools and run sandboxed scripts.</p>
                </div>
              </label>
            )}

            {!scopesList.includes("mcp:tools:read") && !scopesList.includes("mcp:tools:execute") && (
              <div className="flex items-start gap-2 text-sm leading-5">
                <span className="text-muted-foreground mt-0.5">✓</span>
                <span className="text-xs text-muted-foreground">Basic profile information (openid, email).</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Form Submission Actions */}
      <ConsentActions />
    </form>
  );
}
