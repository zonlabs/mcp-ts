export type WorkflowOAuthConsentParams = {
  issuer: string;
  client_id: string;
  redirect_uri: string;
  client_name?: string;
  logo_uri?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
  grant_duration?: "7d" | "1y" | "never";
};

type SearchParamRecord = Record<string, string | string[] | undefined>;

function firstString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function normalizeBaseUrl(value: string): string | null {
  try {
    return new URL(value.trim()).toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function getWorkflowOAuthIssuer(): string {
  const configured =
    process.env.WORKFLOW_OAUTH_ISSUER ||
    process.env.NEXT_PUBLIC_WORKFLOW_OAUTH_ISSUER ||
    process.env.WORKFLOW_MCP_URL ||
    process.env.NEXT_PUBLIC_WORKFLOW_MCP_URL ||
    "http://localhost:3002";

  return normalizeBaseUrl(configured) ?? "http://localhost:3002";
}

export function isAllowedWorkflowOAuthIssuer(issuer: string): boolean {
  const normalizedIssuer = normalizeBaseUrl(issuer);
  return normalizedIssuer !== null && normalizedIssuer === getWorkflowOAuthIssuer();
}

export function parseConsentSearchParams(params: SearchParamRecord): WorkflowOAuthConsentParams {
  const grantDuration = firstString(params.grant_duration);
  return {
    issuer: firstString(params.issuer),
    client_id: firstString(params.client_id),
    redirect_uri: firstString(params.redirect_uri),
    client_name: firstString(params.client_name) || undefined,
    logo_uri: firstString(params.logo_uri) || undefined,
    state: firstString(params.state) || undefined,
    code_challenge: firstString(params.code_challenge) || undefined,
    code_challenge_method: firstString(params.code_challenge_method) || "S256",
    scope: firstString(params.scope) || "workflow",
    grant_duration:
      grantDuration === "7d" || grantDuration === "never" ? grantDuration : "1y",
  };
}

export function parseConsentFormData(form: FormData): WorkflowOAuthConsentParams {
  const get = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value : "";
  };

  const grantDuration = get("grant_duration");
  return {
    issuer: get("issuer"),
    client_id: get("client_id"),
    redirect_uri: get("redirect_uri"),
    client_name: get("client_name") || undefined,
    logo_uri: get("logo_uri") || undefined,
    state: get("state") || undefined,
    code_challenge: get("code_challenge") || undefined,
    code_challenge_method: get("code_challenge_method") || "S256",
    scope: get("scope") || "workflow",
    grant_duration:
      grantDuration === "7d" || grantDuration === "never" ? grantDuration : "1y",
  };
}

export function validateConsentParams(params: WorkflowOAuthConsentParams): string | null {
  if (!params.issuer || !isAllowedWorkflowOAuthIssuer(params.issuer)) {
    return "This OAuth request came from an unrecognized workflow server.";
  }
  if (!params.client_id || !params.redirect_uri) {
    return "This OAuth request is missing required client details.";
  }
  return null;
}

export function buildConsentPath(params: WorkflowOAuthConsentParams, error?: string): string {
  const search = new URLSearchParams();
  search.set("issuer", params.issuer);
  search.set("client_id", params.client_id);
  search.set("redirect_uri", params.redirect_uri);
  search.set("code_challenge_method", params.code_challenge_method || "S256");
  search.set("scope", params.scope || "workflow");
  search.set("grant_duration", params.grant_duration || "1y");
  if (params.client_name) search.set("client_name", params.client_name);
  if (params.logo_uri) search.set("logo_uri", params.logo_uri);
  if (params.state) search.set("state", params.state);
  if (params.code_challenge) search.set("code_challenge", params.code_challenge);
  if (error) search.set("error", error);
  return `/mcp/oauth/consent?${search.toString()}`;
}

export function workflowOAuthEndpoint(issuer: string, path: string): string {
  return new URL(path, issuer).toString();
}
