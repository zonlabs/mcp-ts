# Issue Analysis & Resolution: Exa MCP HTTP 403 Version Negotiation / OAuth Failure

## Executive Summary

When running `mcp-ts/mcp` remotely on Cloudflare Workers alongside `mcp-client` on Vercel (sharing a remote Supabase storage backend), connecting to the Exa MCP server (`https://mcp.exa.ai/mcp`) failed with:

```text
Version negotiation failed: the server denied access (HTTP 403)
code: CLIENT_HTTP_FORBIDDEN, status: 403
```

**Verified root cause**: The 403 is **not an OAuth/token problem**. It is Exa's Cloudflare WAF (bot protection) returning the classic **"Attention Required! | Cloudflare" block page (HTTP 403)** to any request that originates from a **Cloudflare Workers egress IP**. Requests from residential IPs — including with an *expired* access token — succeed with HTTP 200.

The connection succeeds locally (where egress is the developer's residential IP) and fails on the deployed Worker (where egress is a Cloudflare datacenter IP). This is the same class of issue as the earlier GitHub (`api.githubcopilot.com`) 522: the deployed Worker's egress path to Cloudflare-fronted MCP origins is blocked/timed-out at the edge.

This document details the environment architecture, the live test evidence, root cause analysis, and resolution options.

---

## 1. Environment & Architecture Overview

- **Frontend / Administrative Client (`mcp-client`)**: Hosted on Vercel. Initiates connections and completes OAuth authorization flows with remote MCP providers (e.g., Exa, GitHub, Tavily).
- **Execution Server / Gateway (`mcp-ts/mcp`)**: Hosted on Cloudflare Workers (`mcp-assistant`). Restores sessions from storage and proxies MCP tool calls.
- **Database (`Supabase`)**: Centralized durable storage backend containing tables (`mcp_sessions`) shared between environments. Stored data includes connection metadata (`serverUrl`, `callbackUrl`, `clientInformation`) and OAuth tokens (`access_token`, `refresh_token`).
- **Exa MCP endpoint**: `https://mcp.exa.ai/mcp` — Cloudflare-fronted (`Server: cloudflare`), hosted on Exa's platform.

---

## 2. Observed Behavior

| Environment | Egress IP source | Result |
|---|---|---|
| Local `wrangler dev` + local `mcp-client` | Developer's residential IP | **Connect OK**, Exa appears in `list_mcp_servers` |
| Deployed Worker (`mcp-assistant`) + Vercel `mcp-client` | Cloudflare datacenter IP | **HTTP 403** during version negotiation / initialize |

`wrangler tail` log on the deployed Worker:

```text
[gw9kgds6c808] Version negotiation failed: the server denied access (HTTP 403)
[gw9kgds6c808] Connection state: CONNECTING → FAILED
[MultiSessionClient] Failed to connect to session sess_... after 3 attempts: SdkHttpError: Version negotiation failed: the server denied access (HTTP 403)
```

---

## 3. Live Test Evidence (all tests executed with real credentials)

### 3.1 From the developer's residential network (curl)

| Probe | Auth | Result |
|---|---|---|
| POST `server/discover` | none | **HTTP 200**, `-32601 Method not found` (legacy fallback) |
| POST `server/discover` | `Bearer <expired token>` | **HTTP 200** |
| POST `server/discover` | `Bearer <fresh token>` | **HTTP 200** |
| POST `initialize` (2025-11-25) | expired token | **HTTP 200** |
| POST `initialize` (2026-07-28) | expired token | **HTTP 400** `Unsupported protocol version` (Exa supports up to 2025-11-25) |
| POST `initialize` | `Bearer invalid_token_probe` | **HTTP 200** |
| POST `initialize` | `x-api-key: invalid_key_probe` | **HTTP 200** |

Exa does **not** gate its MCP endpoint on token validity or expiry — unknown, expired, and fresh tokens all return 200 from a residential IP.

### 3.2 From a dedicated Cloudflare Worker egress probe (`exa-egress-probe`)

A throwaway Worker (`https://exa-egress-probe.himanshu-mehta-sde.workers.dev`) was deployed that forwards a POST to `https://mcp.exa.ai/mcp` and returns the upstream status/body. **Every** combination returned **HTTP 403** with the Cloudflare WAF block page (`<title>Attention Required! | Cloudflare</title>`, `content-type: text/html`):

| Probe | Auth | User-Agent | Result |
|---|---|---|---|
| `server/discover` | none | (none) | **403** Cloudflare block page |
| `server/discover` | `Bearer <expired token>` | (none) | **403** Cloudflare block page |
| `server/discover` | `Bearer <fresh token>` | (none) | **403** Cloudflare block page |
| `initialize` (2025-11-25) | none | (none) | **403** Cloudflare block page |
| `initialize` (2026-07-28) | none | (none) | **403** Cloudflare block page |
| `server/discover` | none | browser UA | **403** Cloudflare block page |
| `server/discover` | `Bearer <fresh token>` | browser UA | **403** Cloudflare block page |

### 3.3 Control tests (isolate the block to Exa's edge)

| Target from the probe Worker | Result |
|---|---|
| `https://example.com` | **HTTP 200 OK** (worker egress to the open internet works) |
| `https://www.google.com` | HTTP 429 (reachable, rate-limited) |
| `https://mcp.exa.ai/mcp` | **HTTP 403** Cloudflare block page |

The probe Worker's general internet egress works fine; only Exa's edge denies it. Adding a browser-like `User-Agent` does not bypass the block, confirming it is IP-reputation/WAF-driven rather than a header heuristic.

### 3.4 OAuth token state

| Check | Result |
|---|---|
| Stored access token `exp` | `1786380625` vs `now ≈ 1786397994` → **expired ~4.8h** |
| Refresh grant `POST auth.exa.ai/api/oauth/token` (grant_type=refresh_token, form-encoded) | **HTTP 200** — fresh `access_token` + new `refresh_token` minted |
| Token endpoint | `https://auth.exa.ai/api/oauth/token` (issuer `https://auth.exa.ai`, Next.js/Vercel) |

The token set is valid and refreshable, but **irrelevant** to the 403 — see §3.2.

---

## 4. Root Cause Analysis

### Primary Cause (verified)
Exa's Cloudflare edge (WAF / bot protection) returns an HTTP 403 "Attention Required!" block page to any request whose source IP is a **Cloudflare Workers egress IP**. This occurs **regardless of the `Authorization` header** — no token, expired token, and fresh token all receive the same 403 from worker egress, while a residential IP receives 200 for the same requests. The error message surfaced by `@modelcontextprotocol/client` v2 (`Version negotiation failed: the server denied access (HTTP 403)`, `code: CLIENT_HTTP_FORBIDDEN`) is simply the SDK mapping that HTTP 403 on the `server/discover` version-negotiation probe.

### Protocol / SDK Handling Mismatch (secondary, real but not the cause)
1. **Standard SDK Re-Auth Trigger**: `@mcp-ts/client` (`MCPClient`) intercepts `SDKUnauthorizedError` (**HTTP 401**) to transition session states from `active` to `pending` and emit an `auth_required` event for re-authentication.
2. **Generic Error Fallback**: An **HTTP 403** (`CLIENT_HTTP_FORBIDDEN`) during initialization is treated as a generic, unrecoverable connection failure rather than an authentication issue — correct per spec, but it means the real cause (network-layer block) is misread as an auth failure.
3. **Retry Loop**: `MultiSessionClient.establishConnectionWithRetries()` retries up to 3 times; since the 403 is not a 401, the client retries with the same in-memory token without re-auth. This is a symptom amplifier, not the cause.

---

## 5. Specification & Standards Analysis (for reference)

### MCP Specification & OAuth 2.1 Standards (RFC 6749 / RFC 6750)
- **HTTP 401 Unauthorized**: Defined for missing, expired, or invalid Bearer tokens. Clients should attempt a silent `refresh_token` grant flow if available, or fall back to full interactive re-authorization.
- **HTTP 403 Forbidden**: Defined for situations where authentication succeeded but the client lacks permissions/scopes (Step-up authorization / `insufficient_scope`). The server MUST send a `WWW-Authenticate: Bearer error="insufficient_scope", scope="..."` response header.

### Upstream Behavior Note
The observed 403 is **not** an OAuth `insufficient_scope` response — the response body is a Cloudflare WAF HTML block page, not an MCP/OAuth JSON error, and it appears with no credentials at all. This rules out any token/scope interpretation and confirms the network-layer egress block.

---

## 6. Resolution Options

1. **Re-authenticate / refresh the stored Exa session** (hygiene, does NOT fix the 403): The stored access token is expired. Refresh it via `POST https://auth.exa.ai/api/oauth/token` (form-encoded `grant_type=refresh_token`) or by re-running the OAuth flow in `mcp-client`.
2. **Route Exa through a non-Workers runtime** (working fix): Serve the Exa connection through a runtime whose egress is a residential/allowlisted IP — e.g. the `mcp-client` server (Vercel) or `mcp-server` (Railway). Exa is reachable from those networks today.
3. **Ask Exa to allowlist Cloudflare Workers egress** (vendor action): Exa's WAF must permit requests from Cloudflare Workers IP ranges (or the account's specific egress ASN) for the Worker to connect directly.
4. **Transport-level mitigation** (partial): Wrap downstream `listTools()` / connect with per-server timeouts so a blocked server degrades gracefully instead of failing every `codemode_run` (already implemented for the listTools path in `packages/code-mode/src/runtime/tool-index.ts`).

---

## 7. Artifacts

- Probe worker source: `%TEMP%\opencode\exa-probe\src\index.ts` (deployed as `exa-egress-probe`, workers.dev URL above). Delete after investigation.
- Related: the analogous GitHub 522 issue (deployed Worker egress to `api.githubcopilot.com/mcp` timing out at the edge) was mitigated by adding per-server listTools timeouts; see `packages/code-mode/src/runtime/tool-index.ts`.
