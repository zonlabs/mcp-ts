import { redirect } from "next/navigation";
import Image from "next/image";
import { Clock } from "lucide-react";
import Logo from "@/components/common/Logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/server";
import {
  buildConsentPath,
  parseConsentSearchParams,
  validateConsentParams,
} from "@/lib/workflow-oauth";
import { ConsentActions } from "./ConsentActions";

export const dynamic = "force-dynamic";

const GRANT_DURATION_OPTIONS = [
  { value: "1d", label: "1 day" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "1y", label: "1 year" },
  { value: "never", label: "Never" },
] as const;

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function HiddenConsentFields({
  params,
  includeGrantDuration = true,
}: {
  params: ReturnType<typeof parseConsentSearchParams>;
  includeGrantDuration?: boolean;
}) {
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
      {includeGrantDuration ? (
        <input type="hidden" name="grant_duration" value={params.grant_duration ?? "1y"} />
      ) : null}
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
    <main className="flex min-h-screen items-start justify-center bg-muted p-3 pt-6 text-foreground sm:items-center sm:pt-3">
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
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-background shadow-sm"
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
            {params.logo_uri ? (
              <div
                aria-label={clientLabel}
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-background shadow-sm"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={clientLabel}
                  height={36}
                  src={params.logo_uri}
                  width={36}
                  style={{ objectFit: "contain" }}
                />
              </div>
            ) : (
              <div
                aria-label={clientLabel}
                className="flex h-9 w-9 items-center justify-center rounded-lg shadow-sm"
                style={{
                  background: "#64748b",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "1.1rem",
                  textTransform: "uppercase",
                  letterSpacing: "-0.02em",
                }}
              >
                {(params.client_name || params.client_id || "?").charAt(0)}
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
            <>
              <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Signed in as</p>
                  <p className="mt-0.5 break-words text-sm font-semibold">{accountLabel}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Access requested</p>
                  <p className="mt-0.5 text-sm font-semibold leading-5">
                    Read and use <strong>MCP Assistant APIs</strong> through the{" "}
                    <strong>MCP server</strong>.
                  </p>
                </div>
              </div>

              <form action="/api/workflow-oauth/approve" className="space-y-3 pt-2" method="post">
                <HiddenConsentFields params={params} includeGrantDuration={false} />
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
                    Shorter durations are safer. You can revoke this client anytime from connected MCP clients.
                  </span>
                </label>
                <ConsentActions />
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
