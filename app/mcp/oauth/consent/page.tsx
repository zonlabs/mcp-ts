import { redirect } from "next/navigation";
import { ShieldCheck, X } from "lucide-react";
import Logo from "@/components/common/Logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import {
  buildConsentPath,
  parseConsentSearchParams,
  validateConsentParams,
} from "@/lib/workflow-oauth";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function HiddenConsentFields({ params }: { params: ReturnType<typeof parseConsentSearchParams> }) {
  return (
    <>
      <input type="hidden" name="issuer" value={params.issuer} />
      <input type="hidden" name="client_id" value={params.client_id} />
      <input type="hidden" name="redirect_uri" value={params.redirect_uri} />
      <input type="hidden" name="client_name" value={params.client_name ?? ""} />
      <input type="hidden" name="logo_uri" value={params.logo_uri ?? ""} />
      <input type="hidden" name="state" value={params.state ?? ""} />
      <input type="hidden" name="code_challenge" value={params.code_challenge ?? ""} />
      <input type="hidden" name="code_challenge_method" value={params.code_challenge_method ?? "S256"} />
      <input type="hidden" name="scope" value={params.scope ?? "workflow"} />
    </>
  );
}

export default async function WorkflowOAuthConsentPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const params = parseConsentSearchParams(resolvedSearchParams);
  const validationError = validateConsentParams(params);
  const requestError =
    typeof resolvedSearchParams.error === "string" ? resolvedSearchParams.error : undefined;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!validationError && !user) {
    redirect(`/signin?redirect=${encodeURIComponent(buildConsentPath(params))}`);
  }

  const clientLabel = params.client_name || params.client_id || "MCP client";
  const accountLabel = user?.email ?? "your MCP Assistant account";

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <section className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="text-lg font-semibold text-foreground">MCP Assistant</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Authorize MCP access</h1>
          <p className="text-sm text-muted-foreground">
            Review this request before connecting an external MCP client.
          </p>
        </div>

        <div className="space-y-4 rounded-lg border bg-background p-5 shadow-sm">
          {validationError || requestError ? (
            <Alert variant="destructive">
              <AlertDescription>{validationError || requestError}</AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Application</p>
                  <p className="mt-1 break-words text-base font-semibold text-foreground">{clientLabel}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Signed in as</p>
                  <p className="mt-1 break-words text-base font-semibold text-foreground">{accountLabel}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Access requested</p>
                  <p className="mt-1 text-sm text-foreground">
                    Read and run your MCP Assistant workflows through the remote MCP server.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <form action="/api/workflow-oauth/deny" method="post">
                  <HiddenConsentFields params={params} />
                  <Button className="w-full" type="submit" variant="outline">
                    <X className="h-4 w-4" />
                    Deny
                  </Button>
                </form>
                <form action="/api/workflow-oauth/approve" method="post">
                  <HiddenConsentFields params={params} />
                  <Button className="w-full" type="submit">
                    <ShieldCheck className="h-4 w-4" />
                    Allow
                  </Button>
                </form>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
