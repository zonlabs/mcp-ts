import Link from "next/link";
import { ConsentActions } from "./ConsentActions";
import { approveAction } from "./actions";
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
    <>
      {/*
        Server Action as form action — on submit, Next.js POSTs to the Server
        Action. For the deny button, formAction overrides this per-submission.
        redirect() to an external origin (127.0.0.1:port) causes Next.js to
        issue a top-level window.location navigation, bypassing CORS entirely.
      */}
      <form action={approveAction}>
        <input type="hidden" name="authorization_id" value={params.authorization_id} />

        <div className="space-y-4">
          <hr className="border-border/40" />
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
          {/* ConsentActions reads useFormStatus from this parent form */}
          <ConsentActions />
        </div>
      </form>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        You can{" "}
        <Link
          href="/mcp?view=activity&tab=revoke"
          className="underline underline-offset-2 hover:text-foreground transition-colors"
        >
          revoke this access anytime
        </Link>
        .
      </p>
    </>
  );
}
