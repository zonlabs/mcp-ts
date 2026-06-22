export type McpOAuthConsentParams = {
  authorization_id?: string;
  client_id: string;
  redirect_uri: string;
  client_name?: string;
  logo_uri?: string;
  scope?: string;
};

type SearchParamRecord = Record<string, string | string[] | undefined>;

function firstString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function parseConsentSearchParams(params: SearchParamRecord): McpOAuthConsentParams {
  return {
    authorization_id: firstString(params.authorization_id) || undefined,
    client_id: firstString(params.client_id),
    redirect_uri: firstString(params.redirect_uri),
    client_name: firstString(params.client_name) || undefined,
    logo_uri: firstString(params.logo_uri) || undefined,
    scope: firstString(params.scope) || "openid email",
  };
}

export function parseConsentFormData(form: FormData): McpOAuthConsentParams {
  const get = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value : "";
  };

  return {
    authorization_id: get("authorization_id") || undefined,
    client_id: get("client_id"),
    redirect_uri: get("redirect_uri"),
    client_name: get("client_name") || undefined,
    logo_uri: get("logo_uri") || undefined,
    scope: get("scope") || "openid email",
  };
}
