"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConsentActions } from "./ConsentActions";

const GRANT_DURATION_OPTIONS = [
  { value: "1d", label: "1 day" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "1y", label: "1 year" },
  { value: "never", label: "Never" },
] as const;

export type McpOAuthConsentParams = {
  issuer: string;
  client_id: string;
  redirect_uri: string;
  client_name?: string;
  logo_uri?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
  grant_duration?: "1d" | "7d" | "30d" | "1y" | "never";
};

interface ConsentFormProps {
  params: McpOAuthConsentParams;
  accountLabel: string;
  scopesList: string[];
}

export function ConsentForm({ params, accountLabel, scopesList }: ConsentFormProps) {
  // Checkboxes state
  const [readChecked, setReadChecked] = useState(true);
  const [executeChecked, setExecuteChecked] = useState(true);

  // Build the dynamic scope string submitted to /approve
  const finalScopes = ["openid", "email"];
  if (readChecked && scopesList.includes("mcp:tools:read")) finalScopes.push("mcp:tools:read");
  if (executeChecked && scopesList.includes("mcp:tools:execute")) finalScopes.push("mcp:tools:execute");
  const finalScopeString = finalScopes.join(" ");

  return (
    <form action="/api/mcp-oauth/approve" className="space-y-4 pt-2" method="post">
      {/* Hidden Fields */}
      <input type="hidden" name="issuer" value={params.issuer} />
      <input type="hidden" name="client_id" value={params.client_id} />
      <input type="hidden" name="redirect_uri" value={params.redirect_uri} />
      <input type="hidden" name="client_name" value={params.client_name ?? ""} />
      <input type="hidden" name="logo_uri" value={params.logo_uri ?? ""} />
      <input type="hidden" name="state" value={params.state ?? ""} />
      <input type="hidden" name="code_challenge" value={params.code_challenge ?? ""} />
      <input type="hidden" name="code_challenge_method" value={params.code_challenge_method ?? "S256"} />
      <input type="hidden" name="scope" value={finalScopeString} />

      {/* Access requested list with interactive checkboxes */}
      <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Signed in as</p>
          <p className="mt-0.5 break-words text-sm font-semibold">{accountLabel}</p>
        </div>

        <div className="space-y-2.5">
          <p className="text-xs font-medium text-muted-foreground">Access requested</p>
          <div className="space-y-3">
            {scopesList.includes("mcp:tools:read") && (
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <Checkbox
                  id="scope-read"
                  checked={readChecked}
                  onCheckedChange={(v) => setReadChecked(v === true)}
                  className="mt-[3px]"
                />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium leading-none">Read access to tools</p>
                  <p className="text-xs text-muted-foreground leading-normal">Discover and inspect connected MCP servers and tool definitions.</p>
                </div>
              </label>
            )}

            {scopesList.includes("mcp:tools:execute") && (
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <Checkbox
                  id="scope-execute"
                  checked={executeChecked}
                  onCheckedChange={(v) => setExecuteChecked(v === true)}
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


      {/* Grant Duration Select */}
      <label className="block space-y-2 rounded-lg border p-3 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <Clock className="h-4 w-4" />
          Access expires
        </span>
        <Select defaultValue={params.grant_duration ?? "1y"} name="grant_duration">
          <SelectTrigger className="h-10 w-full bg-background font-medium shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            {GRANT_DURATION_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="block text-xs text-muted-foreground">
          You can revoke access at any time.
        </span>
      </label>

      {/* Form Submission Actions */}
      <ConsentActions />
    </form>
  );
}
