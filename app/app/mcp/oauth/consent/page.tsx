import { redirect } from "next/navigation";
import Image from "next/image";
import Logo from "@/components/common/Logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/server";
import { parseConsentSearchParams } from "@/lib/mcp-oauth";
import { ConsentForm } from "./ConsentForm";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function McpOAuthConsentPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const requestError =
    typeof resolvedSearchParams.error === "string" ? resolvedSearchParams.error : undefined;

  const authorizationId = typeof resolvedSearchParams.authorization_id === "string"
    ? resolvedSearchParams.authorization_id
    : undefined;

  let validationError = authorizationId ? null : "Missing authorization_id parameter.";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!validationError && !user && authorizationId) {
    const redirectPath = `/mcp/oauth/consent?authorization_id=${authorizationId}`;
    redirect(`/signin?redirect=${encodeURIComponent(redirectPath)}`);
  }

  let clientLabel = "MCP client";
  let scopesList: string[] = ["openid", "email"];
  let pageParams = parseConsentSearchParams(resolvedSearchParams);

  if (authorizationId && user) {
    const { data: authDetails, error: authError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
    if (authError) {
      validationError = authError.message;
    } else if (authDetails) {
      if ("redirect_url" in authDetails) {
        redirect(authDetails.redirect_url);
      } else if ("authorization_id" in authDetails) {
        clientLabel = authDetails.client.name || authDetails.client.id || "MCP client";
        scopesList = authDetails.scope.split(/\s+/).filter(Boolean);
        pageParams = {
          authorization_id: authorizationId,
          client_id: authDetails.client.id,
          redirect_uri: authDetails.redirect_uri,
          client_name: authDetails.client.name,
          logo_uri: authDetails.client.logo_uri,
          scope: authDetails.scope,
        };
      }
    }
  }

  const accountLabel = user?.email ?? "your MCP Assistant account";
  const avatarUrl = user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture ?? null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-3 text-foreground">
      <style>
        {`
          .oauth-flow-lines {
            width: clamp(44px, 10vw, 72px);
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 6px;
          }

          .oauth-flow-line {
            position: relative;
            width: 100%;
            height: 2px;
            border-radius: 999px;
            background: transparent;
            overflow: hidden;
          }

          .oauth-flow-line::before {
            content: "";
            position: absolute;
            inset: 0;
            opacity: 0.95;
            background-repeat: no-repeat;
          }

          .oauth-flow-line-out::before {
            background-image: linear-gradient(
              90deg,
              rgba(37, 99, 235, 0) 0%,
              rgba(37, 99, 235, 0.96) 18%,
              rgba(37, 99, 235, 0.96) 82%,
              rgba(37, 99, 235, 0) 100%
            );
            background-size: 52px 100%;
            filter: drop-shadow(0 0 8px rgba(37, 99, 235, 0.28));
            animation: oauth-flow-single-ltr 1.35s linear infinite;
          }

          .oauth-flow-line-in::before {
            background-image: linear-gradient(
              90deg,
              rgba(22, 163, 74, 0) 0%,
              rgba(22, 163, 74, 0.96) 18%,
              rgba(22, 163, 74, 0.96) 82%,
              rgba(22, 163, 74, 0) 100%
            );
            background-size: 52px 100%;
            filter: drop-shadow(0 0 8px rgba(22, 163, 74, 0.28));
            animation: oauth-flow-single-rtl 1.35s linear infinite;
          }

          @keyframes oauth-flow-single-ltr {
            from { background-position-x: -60px; }
            to { background-position-x: 130px; }
          }

          @keyframes oauth-flow-single-rtl {
            from { background-position-x: 130px; }
            to { background-position-x: -60px; }
          }
        `}
      </style>
      <section className="w-full max-w-[420px] rounded-xl border bg-background px-5 py-6 shadow-sm sm:px-7">
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight">Authorize MCP access</h1>

          <div className="mt-4 flex items-center justify-center gap-3">
            {/* Left: MCP Assistant (our platform) logo */}
            <div
              aria-label="MCP Platform"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-background border-2 border-zinc-300 dark:border-zinc-600 shadow-sm"
            >
              <Image
                alt=""
                aria-hidden="true"
                height={28}
                priority
                src="/logo-mark-red.svg"
                width={28}
              />
            </div>

            <div className="oauth-flow-lines" aria-hidden="true">
              <span className="oauth-flow-line oauth-flow-line-out" />
              <span className="oauth-flow-line oauth-flow-line-in" />
            </div>

            {/* Right: Requesting client logo or letter avatar */}
            {pageParams.logo_uri ? (
              <div
                aria-label={clientLabel}
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-background border-2 border-zinc-300 dark:border-zinc-600 shadow-sm"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={clientLabel}
                  height={36}
                  src={pageParams.logo_uri}
                  width={36}
                  style={{ objectFit: "contain" }}
                />
              </div>
            ) : (
              <div
                aria-label={clientLabel}
                className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-zinc-300 dark:border-zinc-600 shadow-sm"
                style={{
                  background: "#64748b",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "1.1rem",
                  textTransform: "uppercase",
                  letterSpacing: "-0.02em",
                }}
              >
                {(pageParams.client_name || pageParams.client_id || "?").charAt(0)}
              </div>
            )}
          </div>

          <p className="mt-3 text-sm">
            <strong>{clientLabel}</strong> is requesting access to your account.
          </p>
        </div>

        <div className="mt-5">
          {validationError || requestError ? (
            <Alert variant="destructive">
              <AlertDescription>{validationError || requestError}</AlertDescription>
            </Alert>
          ) : (
            <ConsentForm
              params={pageParams}
              accountLabel={accountLabel}
              scopesList={scopesList}
              avatarUrl={avatarUrl}
            />
          )}
        </div>
      </section>
    </main>
  );
}
