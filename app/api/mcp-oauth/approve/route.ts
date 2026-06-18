import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildConsentPath,
  parseConsentFormData,
  validateConsentParams,
  mcpOAuthEndpoint,
} from "@/lib/mcp-oauth";

function redirectToConsent(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.url));
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const params = parseConsentFormData(form);
  const validationError = validateConsentParams(params);
  const consentPath = buildConsentPath(params);

  if (validationError) {
    return redirectToConsent(request, buildConsentPath(params, validationError));
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.redirect(new URL(`/signin?redirect=${encodeURIComponent(consentPath)}`, request.url));
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    return redirectToConsent(request, buildConsentPath(params, "No active session. Sign in again."));
  }

  const body = new URLSearchParams({
    response_type: "code",
    client_id: params.client_id,
    redirect_uri: params.redirect_uri,
    state: params.state ?? "",
    code_challenge: params.code_challenge ?? "",
    code_challenge_method: params.code_challenge_method ?? "S256",
    scope: params.scope ?? "openid email mcp:tools:read mcp:tools:execute",
    grant_duration: params.grant_duration ?? "1y",
    user_access_token: session.access_token,
  });

  const response = await fetch(mcpOAuthEndpoint(params.issuer, "/oauth/authorize"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    redirect: "manual",
    cache: "no-store",
  });

  const location = response.headers.get("location");
  if (response.status >= 300 && response.status < 400 && location) {
    return NextResponse.redirect(location);
  }

  const text = await response.text().catch(() => "");
  return redirectToConsent(
    request,
    buildConsentPath(params, text || "Could not complete MCP authorization.")
  );
}
