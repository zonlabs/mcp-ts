---
title: "MCP App Host Comparison"
sidebarTitle: "Host Comparison"
description: "Side-by-side comparison of mcp-ts and mcp-ui as MCP App hosts, covering sandboxing, AppBridge support, framework integration, and developer ergonomics."
icon: "scales-balanced"
---

# MCP App Host Comparison: `mcp-ts` vs `mcp-ui`

This document compares how **`@mcp-ts/sdk`** (client `AppHost`, React `useMcpApps` / `McpAppRenderer`) and **`@mcp-ui/client`** host MCP Apps: architecture, security, and feature overlap.

## 1. Architecture and design patterns

### `mcp-ui`

- **`AppRenderer` (React)**: High level—resource/HTML, bridge configuration, streaming and host context props, optional MCP `client` with automatic forwarding.
- **`AppFrame` (low level)**: Iframe lifecycle, `PostMessageTransport`, sandbox proxy handshake.

### `mcp-ts` (current)

- **`McpAppRenderer` / `McpAppView`**: React layer that owns iframe ref, fullscreen UI, and syncs `input` / `result` / `toolInputPartial` / `toolCancelled` / merged `hostContext` into `AppHost`.
- **`AppHost` (core)**: Single class that owns `AppBridge`, resource preload/cache, sandbox launch (`setupSandboxProxyIframe` + `sendSandboxResourceReady`), and MCP forwarding or overrides.

**Similarity**: Both use the official **AppBridge** + **PostMessageTransport** model from `@modelcontextprotocol/ext-apps`.

**Difference**: `mcp-ui` splits renderer vs frame; `mcp-ts` keeps most protocol and DOM logic in `AppHost`, with React focused on binding to `useMcp` / SSE and UX (fullscreen button, loaders).

---

## 2. Sandboxing and iframes

### `mcp-ui`

- Expects an explicit **`sandbox`** configuration (proxy URL, permissions, CSP).
- Uses a proxy iframe and handshake so untrusted HTML is not executed in the parent document’s origin semantics without control.

### `mcp-ts` (current)

- **Raw HTML** path requires **`sandbox`** with a proxy URL; otherwise `launch` throws—no “silent” blob-URL-only hosting for that path.
- CSP can be supplied as `sandbox.csp` (often `DEFAULT_MCP_APP_CSP` extended per app); values are passed into the proxy (query / bridge) so the guest document can enforce policy.
- **Plain HTTP(S) `uri`** (non–`ui://` / non–`mcp-app://`) can still load with `iframe.src` and sandbox attributes (separate code path).

**Similarity**: Proxy-first mental model and explicit sandbox config for injected HTML.

**Difference**: `mcp-ts` additionally documents **`DEFAULT_MCP_APP_CSP`** and bundles utilities/constants; the actual **`sandbox.html`** asset is still something the **host app must serve** (see `examples/agents`).

---

## 3. Resource prefetch and caching

### `mcp-ts`

- **`AppHost.preload(tools)`** with cache order: SSE client cache → in-memory `resourceCache` → network. Strong fit for instant tool UI after discovery.

### `mcp-ui`

- Fetching is typically driven by React props and lifecycle; hosts can pass pre-fetched **`html`** or a **`toolResourceUri`** if they already have content.

**Similarity**: Both allow supplying HTML/URI from the host.

**Difference**: `mcp-ts` emphasizes **built-in preload** tied to tool lists from your MCP session.

---

## 4. MCP forwarding and overrides (`client` vs callbacks)

### `mcp-ui`

- **`client`** is optional; if omitted, hosts implement **`onCallTool`**, **`onReadResource`**, etc., for mediation.

### `mcp-ts` (current)

- **`AppHost` constructor accepts `AppHostClient | null`**.
- If **`onCallTool`** is set, it runs instead of `client.callTool`.
- If **`onReadResource`** is set, resource reads use it (including paths that would otherwise use the client).
- If neither override nor a connected client is available where needed, operations fail with explicit errors (e.g. disconnected client).

**Similarity**: Optional automatic forwarding vs explicit host-controlled handlers.

**Difference**: In **`useMcpApps`**, the SSE client is still passed from **`useMcp`** when present; advanced hosts can use **`useAppHost`** directly with `client: null` and full overrides.

---

## 5. Streaming, context, and display

### `mcp-ui`

- **`toolInputPartial`**, **`toolCancelled`**, **`hostContext`**, **`onFallbackRequest`**, etc., for agentic UIs and host–guest sync.

### `mcp-ts` (current)

- **`McpAppRenderer`**: `toolInputPartial` → `host.sendToolInputPartial`; `toolCancelled` → `sendToolCancelled`.
- **`hostContext`** merged with defaults and an authoritative **`displayMode`** (`inline` | `fullscreen`) for guests that read host context.
- **`onFallbackRequest`**, **`onMessage`**, **`onOpenLink`**, **`onLoggingMessage`**, **`onSizeChanged`**, **`onRequestDisplayMode`** exposed on options/props.
- **Fullscreen**: Implemented in the React layer using the Fullscreen API plus height restoration logic (guest resize events after exit can be misleading).

**Similarity**: Substantial overlap with `mcp-ui`-style props for streaming and context.

**Remaining gaps (illustrative, not exhaustive)**: Exact API parity with every `mcp-ui` prop name/edge case, tighter **AppRenderer/AppFrame** split, and any extra helpers `mcp-ui` ships for non-React stacks—verify against the **`@mcp-ui/client`** version you target.

---

## Conclusion

- **`mcp-ts`** is an **SDK that includes MCP App hosting** as part of the same package as SSE sessions, storage-backed servers, adapters, etc.
- **`@mcp-ui/client`** is a **focused UI/host library** with a more granular React component split.

**`mcp-ts`’s host behavior is much closer to `mcp-ui`** in several areas: proxy sandboxing, CSP hooks, optional client with overrides, streaming/cancellation props, host context, and fullscreen display mode. The main structural difference remains **monolithic `AppHost` + thin React** versus **`AppRenderer` + `AppFrame`**, and **`mcp-ts`’s preload/cache story** is a differentiator for tool-heavy apps.

When choosing: prefer **`mcp-ui`** if you want the reference React decomposition and are building only the host UI layer; prefer **`mcp-ts`** if you already use (or want) the full client/server stack and a single dependency for SSE + OAuth + apps.



