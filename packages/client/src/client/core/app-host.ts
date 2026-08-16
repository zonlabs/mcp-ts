/**
 * MCP App Host
 *
 * Bridges the gap between an iframe (MCP App) and the SSEClient (MCP Server).
 * Handles secure iframe sandboxing, resource loading, and bi-directional
 * communication via the AppBridge protocol.
 *
 * Key features:
 * - Secure iframe sandboxing with minimal permissions (proxy-based)
 * - Resource preloading for instant MCP App UI loading
 * - Cache-aware resource fetching (SSEClient cache → local cache → direct fetch)
 * - Support for ui:// and mcp-app:// resource URIs
 */

import { 
  AppBridge, 
  PostMessageTransport
} from '@modelcontextprotocol/ext-apps/app-bridge';
import type { LoggingMessageNotification } from "@modelcontextprotocol/client";
import type { AppHostClient } from './types';
import { setupSandboxProxyIframe } from '../utils/app-host-utils.js';
import { APP_HOST_DEFAULTS } from './constants.js';

export type McpUiResourceCsp = Record<string, string>;
export type McpUiHostContext = Record<string, unknown>;

// Define types dynamically from AppBridge properties instead of direct imports
// which seem to fail in this tsconfig environment
type OnMessageHandler = NonNullable<AppBridge['onmessage']>;
export type McpUiMessageParams = Parameters<OnMessageHandler>[0];
export type RequestHandlerExtra = Parameters<OnMessageHandler>[1];
export type McpUiMessageResult = ReturnType<OnMessageHandler> extends Promise<infer R> ? R : never;

type OnOpenLinkHandler = NonNullable<AppBridge['onopenlink']>;
export type McpUiOpenLinkParams = Parameters<OnOpenLinkHandler>[0];
export type McpUiOpenLinkResult = ReturnType<OnOpenLinkHandler> extends Promise<infer R> ? R : never;

type OnSizeChangeHandler = NonNullable<AppBridge['onsizechange']>;
export type McpUiSizeChangedParams = Parameters<OnSizeChangeHandler>[0];

type OnRequestDisplayModeHandler = NonNullable<AppBridge['onrequestdisplaymode']>;
export type McpUiRequestDisplayModeParams = Parameters<OnRequestDisplayModeHandler>[0];
export type McpUiRequestDisplayModeResult = ReturnType<OnRequestDisplayModeHandler> extends Promise<infer R> ? R : never;


// ============================================
// Types & Interfaces
// ============================================

export interface SandboxConfig {
  url: URL | string;
  permissions?: string;
  csp?: McpUiResourceCsp;
}

/**
 * Default Content-Security-Policy for MCP App iframes.
 *
 * Allows inline scripts/styles (required by most MCP App frameworks),
 * outbound network connections, and common asset sources, while blocking
 * nested frames and plugin objects.
 *
 * Pass this (or a spread of it) as `sandbox.csp` to enforce it:
 * @example
 * sandbox={{ url: '/sandbox.html', csp: DEFAULT_MCP_APP_CSP }}
 * // or to extend:
 * sandbox={{ url: '/sandbox.html', csp: { ...DEFAULT_MCP_APP_CSP, 'connect-src': "'self' https://api.example.com" } }}
 */
export const DEFAULT_MCP_APP_CSP: McpUiResourceCsp = {
  'default-src': "'self'",
  'script-src':  "'self' 'unsafe-inline' 'unsafe-eval' https: blob:",
  'style-src':   "'self' 'unsafe-inline' https:",
  'connect-src': "'self' https: wss:",
  'img-src':     "'self' data: https: blob:",
  'font-src':    "'self' data: https:",
  'media-src':   "'self' https: blob:",
  'frame-src':   "'none'",
  'object-src':  "'none'",
  'base-uri':    "'self'",
};

export interface AppHostOptions {
  /** Enable debug logging @default false */
  debug?: boolean;
  /** Sandbox proxy configuration */
  sandbox?: SandboxConfig;
  /** Host context for theming, viewport, locale */
  hostContext?: McpUiHostContext;
  /** Custom handler for call tool requests, overriding automatic client forwarding */
  onCallTool?: (params: ToolCallParams) => Promise<unknown>;
  /** Custom handler for resources/read */
  onReadResource?: (uri: string) => Promise<ResourceResponse>;
  /** Custom handler for fallback JSON-RPC requests */
  onFallbackRequest?: (request: any) => Promise<any>;
  
  /** Handler for open-link requests from the guest UI */
  onOpenLink?: (
    params: McpUiOpenLinkParams,
    extra: RequestHandlerExtra,
  ) => Promise<McpUiOpenLinkResult>;

  /** Handler for message requests from the guest UI */
  onMessage?: (
    params: McpUiMessageParams,
    extra: RequestHandlerExtra,
  ) => Promise<McpUiMessageResult>;

  /** Handler for logging messages from the guest UI */
  onLoggingMessage?: (params: LoggingMessageNotification['params']) => void;

  /** Handler for size change notifications from the guest UI */
  onSizeChanged?: (params: McpUiSizeChangedParams) => void;

  /** Callback invoked when an error occurs during setup or message handling */
  onError?: (error: Error) => void;

  /** Handler for display mode change requests from the guest UI */
  onRequestDisplayMode?: (
    params: McpUiRequestDisplayModeParams,
    extra: RequestHandlerExtra,
  ) => Promise<McpUiRequestDisplayModeResult>;
}

export interface AppMessageParams {
  role: string;
  content: unknown;
}

interface ToolCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

interface ResourceContent {
  blob?: string;
  text?: string;
}

interface ResourceResponse {
  contents: ResourceContent[];
}

// ============================================
// Constants
// ============================================

const HOST_INFO = APP_HOST_DEFAULTS.HOST_INFO;


/** Supported MCP App URI schemes */
const MCP_URI_SCHEMES = APP_HOST_DEFAULTS.URI_SCHEMES;

// ============================================
// AppHost Class
// ============================================

/**
 * Host for MCP Apps embedded in iframes.
 * Manages secure communication between the app and the MCP server.
 */
export class AppHost {
  private bridge: AppBridge;
  private sessionId?: string;
  private resourceCache = new Map<string, Promise<ResourceResponse | null>>();
  private debug: boolean;

  private sandboxConfig?: SandboxConfig;
  private options: AppHostOptions;
  public onAppMessage?: (params: AppMessageParams) => void;

  constructor(
    private readonly client: AppHostClient | null,
    private readonly iframe: HTMLIFrameElement,
    options?: AppHostOptions
  ) {
    this.options = options || {};
    this.debug = this.options.debug ?? false;
    this.sandboxConfig = this.options.sandbox;

    this.bridge = this.initializeBridge();
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * Start the host. This prepares the bridge handlers but doesn't connect yet.
   * The actual connection happens in launch() after HTML is loaded.
   * @returns Promise that resolves immediately (bridge connects during launch)
   */
  async start(): Promise<void> {
    // Bridge handlers are already registered in constructor.
    // Connection happens in launch() after HTML is loaded.
    this.log('Host started, ready to launch');
  }

  /**
   * Preload UI resources to enable instant app loading.
   * Call this when tools are discovered to cache their UI resources.
   */
  preload(tools: Array<{ _meta?: unknown }>): void {
    for (const tool of tools) {
      const uri = this.extractUiResourceUri(tool);
      if (!uri || this.resourceCache.has(uri)) continue;

      const promise = this.preloadResource(uri);
      this.resourceCache.set(uri, promise);
    }
  }

  /**
   * Launch an MCP App from a URL, MCP resource URI, or RAW HTML.
   * Loads the HTML first, then establishes bridge connection.
   */
  async launch(source: { uri?: string; html?: string }, sessionId?: string): Promise<void> {
    if (sessionId) this.sessionId = sessionId;

    const initializedPromise = this.onAppReady();

    let htmlToRender = source.html;

    if (!htmlToRender && source.uri) {
      if (this.isMcpUri(source.uri)) {
        htmlToRender = await this.readMcpAppHtml(source.uri);
      }
    }

    if (!htmlToRender && source.uri && !this.isMcpUri(source.uri)) {
        // Fallback for regular urls without proxy
        this.iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads');
        this.iframe.src = source.uri;
        await this.onIframeReady();
        await this.connectBridge();
    } else if (htmlToRender) {
      if (!this.sandboxConfig) {
        throw new Error("Sandbox configuration requires a proxy URL to render HTML safely.");
      }
      await this.launchSandboxedHtml(htmlToRender, this.sandboxConfig);
      await this.connectBridge();

      this.log('Sending HTML resource to sandbox proxy (MCP Apps notification)');
      await this.bridge.sendSandboxResourceReady({
        html: htmlToRender,
        csp: this.sandboxConfig.csp,
      });
    }

    this.log('Waiting for app initialization');
    await Promise.race([
      initializedPromise,
      new Promise<void>((resolve) => setTimeout(() => {
        this.log('Initialization timeout - continuing anyway', 'warn');
        resolve();
      }, 3000))
    ]);
    this.log('App launched and ready');
  }

  // Set host context manually
  setHostContext(context: McpUiHostContext): void {
    this.options.hostContext = context;
    if (this.bridge) {
      this.bridge.setHostContext(context);
    }
  }

  // Send streaming inputs manually
  sendToolInputPartial(params: any): void {
    if (this.bridge) {
      (this.bridge as any).sendToolInputPartial(params);
    }
  }

  /**
   * Wait for app to signal initialization complete
   */
  private onAppReady(): Promise<void> {
    return new Promise<void>((resolve) => {
      const originalHandler = this.bridge.oninitialized;
      this.bridge.oninitialized = (...args) => {
        this.log('App initialized');
        resolve();
        this.bridge.oninitialized = originalHandler;
        originalHandler?.(...args);
      };
    });
  }

  /**
   * Wait for iframe to finish loading
   */
  private onIframeReady(): Promise<void> {
    return new Promise((resolve) => {
      if (this.iframe.contentDocument?.readyState === 'complete') {
        resolve();
        return;
      }
      this.iframe.addEventListener('load', () => resolve(), { once: true });
    });
  }

  /**
   * Send tool input arguments to the MCP App.
   * Call this after launch() when tool input is available.
   */
  sendToolInput(args: Record<string, unknown>): void {
    this.log('Sending tool input to app');
    this.bridge.sendToolInput({ arguments: args });
  }

  /**
   * Send tool result to the MCP App.
   * Call this when the tool call completes.
   */
  sendToolResult(result: unknown): void {
    this.log('Sending tool result to app');
    this.bridge.sendToolResult(result as any);
  }

  /**
   * Send tool cancellation to the MCP App.
   * Call this when the tool call is cancelled or fails.
   */
  sendToolCancelled(reason: string): void {
    this.log('Sending tool cancellation to app');
    this.bridge.sendToolCancelled({ reason });
  }

  /**
   * Tell the guest UI the resource is being torn down (unload / cleanup).
   * Forwards to {@link AppBridge.teardownResource} on `@modelcontextprotocol/ext-apps/app-bridge`.
   */
  teardownResource(params: Record<string, unknown> = {}): void {
    this.log('Sending resource teardown to app');
    this.bridge.teardownResource(params as never);
  }

  // ============================================
  // Private: Initialization
  // ============================================


  private initializeBridge(): AppBridge {
    const bridge = new AppBridge(
      null,
      HOST_INFO,
      {
        openLinks: {},
        serverTools: {},
        logging: {},
        updateModelContext: { text: {} },
      },
      {
        hostContext: this.options.hostContext || {
          theme: 'dark',
          platform: 'web',
          containerDimensions: { maxHeight: 6000 },
          displayMode: 'inline',
          availableDisplayModes: ['inline', 'fullscreen'],
        },
      }
    );

    ;(bridge as any).fallbackRequestHandler = this.options.onFallbackRequest;
    
    bridge.oncalltool = (params) => this.handleToolCall(params);
    if (this.options.onReadResource) {
       bridge.onreadresource = async (params) => {
         const resp = await this.options.onReadResource!(params.uri);
         return { 
           contents: resp.contents.map(c => ({
            uri: params.uri,
            text: c.text as string,
            blob: c.blob as string,
           }))
         };
       };
    }

    bridge.onopenlink = async (params, extra) => {
      if (this.options.onOpenLink) {
        return await this.options.onOpenLink(params, extra as any);
      }
      return this.handleOpenLink(params);
    };
    bridge.onmessage = async (params, extra) => {
      if (this.options.onMessage) {
        return await this.options.onMessage(params, extra as any);
      }
      return this.handleMessage(params as any);
    };
    bridge.onloggingmessage = (params) => {
      this.log(`App log [${params.level}]: ${params.data}`);
      if (this.options.onLoggingMessage) {
        this.options.onLoggingMessage(params);
      }
    };
    bridge.onupdatemodelcontext = async () => ({});
    bridge.onsizechange = async (params) => {
      const { width, height } = params;
      // Guard: ignore transient 0px resize events (e.g. fired by guest during viewport transitions)
      if (height !== undefined && height > 0) {
        this.iframe.style.height = `${height}px`;
      }
      if (width !== undefined && width > 0) this.iframe.style.minWidth = `min(${width}px, 100%)`;
      if (this.options.onSizeChanged) {
        this.options.onSizeChanged(params);
      }
      return {};
    };
    bridge.onrequestdisplaymode = async (params, extra) => {
      if (this.options.onRequestDisplayMode) {
        return await this.options.onRequestDisplayMode(params, extra as any);
      }
      return { mode: params.mode === 'fullscreen' ? 'fullscreen' : 'inline' };
    };

    return bridge;
  }

  private async connectBridge(): Promise<void> {
    this.log('Connecting bridge to iframe');

    const transport = new PostMessageTransport(
      this.iframe.contentWindow!,
      this.iframe.contentWindow!
    );

    try {
      await this.bridge.connect(transport);
      this.log('Bridge connected successfully');
    } catch (error) {
      this.log('Bridge connection failed', 'error');
      if (this.options.onError) {
        this.options.onError(error instanceof Error ? error : new Error(String(error)));
      }
      throw error;
    }
  }

  // ============================================
  // Private: Bridge Event Handlers
  // ============================================

  private async handleToolCall(params: ToolCallParams) {
    if (this.options.onCallTool) {
      return await this.options.onCallTool(params);
    }
    
    if (!this.client || !this.client.isConnected()) {
      throw new Error('Client disconnected or not provided');
    }

    const sessionId = await this.getSessionId();
    if (!sessionId) {
      throw new Error('No active session');
    }

    const result = await this.client.callTool(
      sessionId,
      params.name,
      params.arguments ?? {}
    );
    return result as any;
  }

  private async handleOpenLink(params: { url: string }): Promise<Record<string, never>> {
    window.open(params.url, '_blank', 'noopener,noreferrer');
    return {};
  }

  private async handleMessage(params: AppMessageParams): Promise<Record<string, never>> {
    this.onAppMessage?.(params);
    return {};
  }

  // ============================================
  // Private: Resource Loading
  // ============================================

  private async launchSandboxedHtml(html: string, config: SandboxConfig): Promise<void> {
    const sandboxUrlString = config.url instanceof URL ? config.url.href : config.url;
    const url = new URL(sandboxUrlString, globalThis.location?.href);
    if (config.csp && Object.keys(config.csp).length > 0) {
      url.searchParams.set('csp', JSON.stringify(config.csp));
    }

    const { onReady } = await setupSandboxProxyIframe(this.iframe, url);
    await onReady;
  }


  private async readMcpAppHtml(uri: string): Promise<string> {
    const sessionId = await this.getSessionId();
    if (!sessionId && !this.options.onReadResource) {
      throw new Error('No active session.');
    }
    const response = await this.fetchResourceWithCache(sessionId, uri);
    if (!response?.contents?.length) {
      throw new Error(`Empty resource: ${uri}`);
    }
    
    const content = response.contents[0];
    const html = this.decodeContent(content);
    if (!html) {
      throw new Error(`Invalid content in resource: ${uri}`);
    }
    return html;
  }

  private async fetchResourceWithCache(sessionId: string | undefined, uri: string): Promise<ResourceResponse> {
    if (this.options.onReadResource) {
      return await this.options.onReadResource(uri);
    }
    
    if (!sessionId) {
      throw new Error('No active session');
    }

    if (!this.client) {
      throw new Error('No client to read resource from');
    }
    
    // Priority 1: SSEClient's built-in cache (best performance)
    if (this.hasClientCache()) {
      return (this.client as any).getOrFetchResource(sessionId, uri);
    }

    // Priority 2: Local preload cache
    const cached = this.resourceCache.get(uri);
    if (cached) {
      const result = await cached;
      if (result) return result;
    }

    // Priority 3: Direct fetch
    return this.client.readResource(sessionId, uri) as Promise<ResourceResponse>;
  }

  private async preloadResource(uri: string): Promise<ResourceResponse | null> {
    try {
      if (this.options.onReadResource) {
         return await this.options.onReadResource(uri);
      }
      const sessionId = await this.getSessionId();
      if (!sessionId || !this.client) return null;
      return await this.client.readResource(sessionId, uri) as ResourceResponse;
    } catch (error) {
      this.log(`Preload failed for ${uri}`, 'warn');
      return null;
    }
  }

  // ============================================
  // Private: Utilities
  // ============================================

  private async getSessionId(): Promise<string | undefined> {
    if (this.sessionId) return this.sessionId;
    if (!this.client) return undefined;
    const result = await this.client.listSessions();
    return result.sessions?.[0]?.sessionId;
  }

  private isMcpUri(url: string): boolean {
    return MCP_URI_SCHEMES.some(scheme => url.startsWith(scheme));
  }

  private hasClientCache(): boolean {
    if (!this.client) return false;
    return 'getOrFetchResource' in this.client &&
           typeof (this.client as any).getOrFetchResource === 'function';
  }

  private extractUiResourceUri(tool: { _meta?: unknown }): string | undefined {
    const meta = tool._meta as { ui?: { resourceUri?: string; uri?: string } } | undefined;
    if (!meta?.ui) return undefined;
    return meta.ui.resourceUri ?? meta.ui.uri;
  }

  private decodeContent(content: ResourceContent): string | undefined {
    if (content.blob) {
      return atob(content.blob);
    }
    return content.text;
  }

  private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (!this.debug && level === 'info') return;

    const prefix = '[AppHost]';
    switch (level) {
      case 'warn':
        console.warn(prefix, message);
        break;
      case 'error':
        console.error(prefix, message);
        break;
      default:
        console.log(prefix, message);
    }
  }
}
