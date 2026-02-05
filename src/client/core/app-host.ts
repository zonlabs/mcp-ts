/**
 * MCP App Host
 *
 * Bridges the gap between an iframe (MCP App) and the SSEClient (MCP Server).
 * Handles secure iframe sandboxing, resource loading, and bi-directional
 * communication via the AppBridge protocol.
 *
 * Key features:
 * - Secure iframe sandboxing with minimal permissions
 * - Resource preloading for instant MCP App UI loading
 * - Cache-aware resource fetching (SSEClient cache → local cache → direct fetch)
 * - Support for ui:// and mcp-app:// resource URIs
 */

import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
import type { AppHostClient } from './types';

// ============================================
// Types & Interfaces
// ============================================

export interface AppHostOptions {
  /** Enable debug logging @default false */
  debug?: boolean;
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

const HOST_INFO = { name: 'mcp-ts-host', version: '1.0.0' };

/** Sandbox permissions - minimal set required for MCP Apps to function */
const SANDBOX_PERMISSIONS = [
  'allow-scripts',      // Required for app JavaScript execution
  'allow-forms',        // Required for form submissions
  'allow-same-origin',  // Required for Blob URL correctness
  'allow-modals',       // Required for dialogs/alerts
  'allow-popups',       // Required for opening links
  'allow-downloads'     // Required for file downloads
].join(' ');

/** Supported MCP App URI schemes */
const MCP_URI_SCHEMES = ['ui://', 'mcp-app://'] as const;

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

  /** Callback for app messages (e.g., chat messages from the app) */
  public onAppMessage?: (params: AppMessageParams) => void;

  constructor(
    private readonly client: AppHostClient,
    private readonly iframe: HTMLIFrameElement,
    options?: AppHostOptions
  ) {
    this.debug = options?.debug ?? false;
    this.configureSandbox();
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
   * Launch an MCP App from a URL or MCP resource URI.
   * Loads the HTML first, then establishes bridge connection.
   */
  async launch(url: string, sessionId?: string): Promise<void> {
    if (sessionId) this.sessionId = sessionId;

    // Set up initialization promise BEFORE connecting
    const initializedPromise = this.onAppReady();

    // Load HTML into iframe first
    if (this.isMcpUri(url)) {
      await this.launchMcpApp(url);
    } else {
      this.iframe.src = url;
    }

    // Wait for iframe to load before connecting bridge
    await this.onIframeReady();

    // Connect the bridge (HTML is loaded, contentWindow is ready)
    await this.connectBridge();

    // Wait for app to signal it's initialized (with timeout)
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

  // ============================================
  // Private: Initialization
  // ============================================

  private configureSandbox(): void {
    if (this.iframe.sandbox.value !== SANDBOX_PERMISSIONS) {
      this.iframe.sandbox.value = SANDBOX_PERMISSIONS;
    }
  }

  private initializeBridge(): AppBridge {
    const bridge = new AppBridge(
      null,
      HOST_INFO,
      {
        openLinks: {},
        serverTools: {},
        logging: {},
        // Declare support for model context updates
        updateModelContext: { text: {} },
      },
      {
        // Initial host context
        hostContext: {
          theme: 'dark',
          platform: 'web',
          containerDimensions: { maxHeight: 6000 },
          displayMode: 'inline',
          availableDisplayModes: ['inline', 'fullscreen'],
        },
      }
    );

    // Register handlers - must be done BEFORE connect()
    bridge.oncalltool = (params) => this.handleToolCall(params);
    bridge.onopenlink = this.handleOpenLink.bind(this);
    bridge.onmessage = this.handleMessage.bind(this);
    bridge.onloggingmessage = (params) => this.log(`App log [${params.level}]: ${params.data}`);
    bridge.onupdatemodelcontext = async () => ({});
    bridge.onsizechange = async ({ width, height }) => {
      if (height !== undefined) this.iframe.style.height = `${height}px`;
      if (width !== undefined) this.iframe.style.minWidth = `min(${width}px, 100%)`;
      return {};
    };
    bridge.onrequestdisplaymode = async (params) => ({
      mode: params.mode === 'fullscreen' ? 'fullscreen' : 'inline'
    });

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
      throw error;
    }
  }

  // ============================================
  // Private: Bridge Event Handlers
  // ============================================

  private async handleToolCall(params: ToolCallParams) {
    if (!this.client.isConnected()) {
      throw new Error('Client disconnected');
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

  private async launchMcpApp(uri: string): Promise<void> {
    if (!this.client.isConnected()) {
      throw new Error('Client must be connected');
    }

    const sessionId = await this.getSessionId();
    if (!sessionId) {
      throw new Error('No active session');
    }

    // Fetch resource using cache hierarchy: SSEClient cache → local cache → direct fetch
    const response = await this.fetchResourceWithCache(sessionId, uri);
    if (!response?.contents?.length) {
      throw new Error(`Empty resource: ${uri}`);
    }

    const content = response.contents[0];
    const html = this.decodeContent(content);
    if (!html) {
      throw new Error(`Invalid content in resource: ${uri}`);
    }

    // Render via Blob URL for clean isolation
    const blob = new Blob([html], { type: 'text/html' });
    this.iframe.src = URL.createObjectURL(blob);
  }

  private async fetchResourceWithCache(sessionId: string, uri: string): Promise<ResourceResponse> {
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
      const sessionId = await this.getSessionId();
      if (!sessionId) return null;
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
    const result = await this.client.getSessions();
    return result.sessions?.[0]?.sessionId;
  }

  private isMcpUri(url: string): boolean {
    return MCP_URI_SCHEMES.some(scheme => url.startsWith(scheme));
  }

  private hasClientCache(): boolean {
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
