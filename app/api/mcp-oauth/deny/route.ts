import { NextRequest, NextResponse } from "next/server";
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

  if (validationError) {
    return redirectToConsent(request, buildConsentPath(params, validationError));
  }

  const body = new URLSearchParams({
    client_id: params.client_id,
    redirect_uri: params.redirect_uri,
    state: params.state ?? "",
  });

  const response = await fetch(mcpOAuthEndpoint(params.issuer, "/oauth/authorize/deny"), {
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
    buildConsentPath(params, text || "Could not deny MCP authorization.")
  );
}
