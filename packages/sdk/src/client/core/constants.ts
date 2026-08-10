/**
 * Default configuration values for the App Host.
 *
 * `SANDBOX_*_READY_METHOD` match `@modelcontextprotocol/ext-apps` (see
 * https://github.com/modelcontextprotocol/ext-apps/blob/main/src/types.ts ).
 * Duplicated here because the package root `app.d.ts` often omits these value exports under
 * `moduleResolution: "NodeNext"`.
 */
export const SANDBOX_PROXY_READY_METHOD = 'ui/notifications/sandbox-proxy-ready' as const;
export const SANDBOX_RESOURCE_READY_METHOD = 'ui/notifications/sandbox-resource-ready' as const;

export const APP_HOST_DEFAULTS = {
  /** Default timeout for waiting for the sandbox proxy to be ready (ms). */
  SANDBOX_TIMEOUT_MS: 10000,
  
  /** Default host info reported to guest apps. */
  HOST_INFO: { name: 'mcp-ts-host', version: '1.0.0' },

  /** Supported MCP App URI schemes. */
  URI_SCHEMES: ['ui://', 'mcp-app://'] as const,

  /** Default theme for the host context. */
  THEME: 'dark',

  /** Default platform for the host context. */
  PLATFORM: 'web',

  /** Default max height for the iframe container (px). */
  MAX_HEIGHT: 6000,
} as const;
