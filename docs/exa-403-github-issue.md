# 403 connecting to mcp.exa.ai from a Cloudflare Worker

## Summary

The hosted Exa MCP endpoint `https://mcp.exa.ai/mcp` returns `403` to requests coming from Cloudflare Workers egress IPs. The same requests return `200` from a normal residential connection, so any MCP client running on Cloudflare Workers (gateway, agent, aggregator) cannot connect to the hosted Exa MCP server. We hit it with MCP clients on a deployed Worker (`@cloudflare/agents`, `@mcp-ts/client`, `@modelcontextprotocol/client` v2): all fail with `Version negotiation failed: the server denied access (HTTP 403)` at connect time, while the exact same clients work when run locally. The `403` is an HTML block page from Exa's Cloudflare edge. It occurs before any MCP logic and is unaffected by auth, token, or protocol-version differences.

## Steps to reproduce

Deploy this to any Cloudflare Worker:

```ts
export default {
  async fetch() {
    const res = await fetch("https://mcp.exa.ai/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "probe", version: "1.0" },
        },
      }),
    });
    return new Response(`${res.status} ${res.statusText}\n${await res.text()}`, {
      headers: { "content-type": "text/plain" },
    });
  },
};
```

## Expected behavior

`200`, same as when the request is made from a residential connection.

## Actual behavior

`403` HTML block page served by `cloudflare` (the `server` response header).

## What I've ruled out

- **Token validity.** An expired token, a freshly refreshed token, and bogus `Authorization`/`x-api-key` all behave identically from the Worker (`403`) and from a local network (`200`). Not a token issue.
- **Protocol version.** `initialize` with both `2025-11-25` and `2026-07-28` returns `200` from a local network, `403` from the Worker. (Explicit `MCP-Protocol-Version: 2026-07-28` header returns `400 Unsupported protocol version`, a normal rejection.)
- **Transport.** Exa is streamable-http; the failure happens before any MCP message exchange.

Test matrix:

| Source | Request | Result |
|---|---|---|
| Local network (curl) | `initialize` (2025-11-25) | `200`, server `exa-search-server` v3.2.1 |
| Local network (curl) | `initialize` (2026-07-28) | `200` |
| Local network (curl) | `server/discover` | `200`, `-32601 Method not found` (legacy fallback) |
| Local network (curl) | `initialize`, bogus `Authorization` / `x-api-key` | `200` |
| Cloudflare Worker | `initialize` (2025-11-25, no auth) | `403` |
| Cloudflare Worker | `initialize` (2026-07-28) | `403` |
| Cloudflare Worker | `server/discover` (no auth / expired token / fresh token / browser UA) | `403` |
| Cloudflare Worker | `GET https://example.com` (control) | `200` |

## Root cause

Exa's Cloudflare WAF blocks Cloudflare Workers egress IPs. Changing `Authorization`, `x-api-key`, or `User-Agent` has no effect, which points to a source-IP-based block rather than anything in the request. Similar reports exist for this endpoint: #367 (http 403 when using the mcp) and anomalyco/opencode#6878 (Cloudflare 5xx / timeouts from Workers).

## Suggested fix

- Allowlist Cloudflare Workers egress ranges (ASN 13335) in the WAF rules for `mcp.exa.ai`; or
- if the WAF rule is intentional, evaluate a valid `Authorization` / `x-api-key` before the block so authenticated clients pass; or
- document that the hosted endpoint rejects Cloudflare Workers egress and recommend self-hosting `exa-mcp-server` (which calls `api.exa.ai` directly and is unaffected).

## Environment

- Endpoint: `https://mcp.exa.ai/mcp` (also with `?tools=web_search_exa,web_search_advanced_exa,web_fetch_exa`)
- Reproduced with plain `fetch()` on Cloudflare Workers (wrangler 4.x, with and without `nodejs_compat`)
- Also reproduced through MCP clients running in a deployed Worker: `@modelcontextprotocol/client` (v2), `@mcp-ts/client` (mcp-assistant gateway), and `@cloudflare/agents` (obot/worker). Both fail at connect time with:  ```
  Failed to connect to MCP server at https://mcp.exa.ai/mcp?tools=web_search_exa,web_search_advanced_exa,web_fetch_exa: Version negotiation failed: the server denied access (HTTP 403)
  ```
- The same clients connect successfully when run locally (`wrangler dev` / local dev server) instead of deployed
- Consistent across multiple Worker accounts/regions
