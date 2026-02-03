import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
import type { AppHostClient } from './types';

/**
 * Host for generic MCP Apps.
 * Bridges the gap between an iframe (App) and the SSEClient (Server).
 */
export class AppHost {
    private bridge: AppBridge;
    private sessionId?: string;
    private resourceCache = new Map<string, Promise<any>>();
    private bridgeConnected: Promise<void> | null = null;

    /** Callback for app messages (e.g. chat) */
    public onAppMessage?: (params: { role: string; content: unknown }) => void;

    constructor(
        private client: AppHostClient,
        private iframe: HTMLIFrameElement
    ) {
        this.enforceSandbox();
        this.bridge = this.initializeBridge();
    }

    private enforceSandbox() {
        // Essential sandbox directives for functionality + security
        // 'allow-same-origin' is needed for Blob URL correctness in some envs
        const required = [
            'allow-scripts',
            'allow-forms',
            'allow-same-origin',
            'allow-modals',
            'allow-popups',
            'allow-downloads'
        ].join(' ');

        if (this.iframe.sandbox.value !== required) {
            this.iframe.sandbox.value = required;
        }
    }

    private initializeBridge(): AppBridge {
        const bridge = new AppBridge(
            null,
            { name: 'mcp-ts-host', version: '1.0.0' },
            { openLinks: {}, serverTools: {}, logging: {} }
        );

        bridge.oncalltool = this.handleToolCall.bind(this);
        bridge.onopenlink = async (p) => { window.open(p.url, '_blank'); return {}; };
        bridge.onmessage = async (p) => {
            try {
                this.onAppMessage?.(p);
            } catch (err: any) {
                // Ignore initial handshake/setup messages that might confuse transport
                if (err.message && err.message.includes('unknown message ID') && err.message.includes('"id":0')) {
                    console.debug('[AppHost] Ignored benign message ID error', err);
                    return {};
                }
                throw err;
            }
            return {};
        };

        return bridge;
    }

    private async handleToolCall(params: any) {
        if (!this.client.isConnected()) throw new Error('Client disconnected');

        const sessionId = await this._getSessionId();
        if (!sessionId) throw new Error('No active session');

        try {
            const result = await this.client.callTool(sessionId, params.name, params.arguments);
            return result as any;
        } catch (error) {
            console.error('[AppHost] Tool error:', error);
            throw error;
        }
    }

    /**
     * Start listening for App messages.
     * Returns a promise that resolves when the bridge is connected.
     */
    public async start() {
        if (!this.iframe.contentWindow) throw new Error('Iframe not ready');

        // Create connection promise so launch() can wait if needed
        this.bridgeConnected = (async () => {
            const transport = new PostMessageTransport(
                this.iframe.contentWindow!,
                this.iframe.contentWindow!
            );
            try {
                await this.bridge.connect(transport);
            } catch (error) {
                console.error('[AppHost] Bridge connection failed:', error);
                throw error;
            }
        })();

        return this.bridgeConnected;
    }

    /**
     * Preload UI resources to cache.
     */
    public preload(tools: any[]) {
        for (const tool of tools) {
            const meta = tool._meta || {};
            const uiUri = meta?.ui?.resourceUri || meta?.['ui/resourceUri'];

            if (uiUri && !this.resourceCache.has(uiUri)) {
                const promise = this._getSessionId().then(sessionId => {
                    if (!sessionId) return null;
                    return this.client.readResource(sessionId, uiUri);
                }).catch(err => {
                    console.warn(`[AppHost] Preload failed: ${uiUri}`, err);
                    return null;
                });
                this.resourceCache.set(uiUri, promise);
            }
        }
    }

    /**
     * Launch an App from URL or MCP URI.
     * Waits for bridge connection if start() was called but not yet complete.
     */
    public async launch(url: string, sessionId?: string) {
        const launchStart = Date.now();
        console.log(`[AppHost] launch() called for: ${url}`);

        if (sessionId) this.sessionId = sessionId;

        // Ensure bridge is connected before launching
        // This allows launch() to be called immediately after start()
        if (this.bridgeConnected) {
            console.log(`[AppHost] Waiting for bridge connection...`);
            await this.bridgeConnected;
            console.log(`[AppHost] Bridge connected after ${Date.now() - launchStart}ms`);
        }

        // MCP Apps are typically referenced via `ui://...` resource URIs.
        // We also support legacy/custom `mcp-app://...` schemes.
        if (url.startsWith('ui://') || url.startsWith('mcp-app://')) {
            await this.launchMcpApp(url);
        } else {
            this.iframe.src = url;
        }

        console.log(`[AppHost] launch() completed in ${Date.now() - launchStart}ms`);
    }

    private async launchMcpApp(uri: string) {
        const fetchStart = Date.now();
        console.log(`[AppHost] launchMcpApp() starting for: ${uri}`);

        if (!this.client.isConnected()) throw new Error('Client must be connected');

        const sessionId = await this._getSessionId();
        if (!sessionId) throw new Error('No active session');

        console.log(`[AppHost] Got sessionId: ${sessionId} (${Date.now() - fetchStart}ms)`);

        // Use SSEClient's cache-aware fetch (checks preloaded resources first)
        // This enables instant loading if resource was preloaded during tool discovery
        let response;
        if ('getOrFetchResource' in this.client && typeof this.client.getOrFetchResource === 'function') {
            // Use the cache-aware method from SSEClient
            console.log(`[AppHost] Using SSEClient.getOrFetchResource()`);
            response = await (this.client as any).getOrFetchResource(sessionId, uri);
        } else if (this.resourceCache.has(uri)) {
            // Fallback to local cache
            console.log(`[AppHost] Using local cache`);
            response = await this.resourceCache.get(uri);
        } else {
            // Final fallback to direct fetch
            console.log(`[AppHost] Direct fetch (no cache)`);
            response = await this.client.readResource(sessionId, uri) as any;
        }

        console.log(`[AppHost] Resource fetched in ${Date.now() - fetchStart}ms`);

        if (!response?.contents?.length) throw new Error('Empty resource');

        const content = response.contents[0];
        const html = content.blob ? atob(content.blob) : content.text;

        if (!html) throw new Error('Invalid content');

        // Render via Blob URL for isolation cleanliness
        const blob = new Blob([html], { type: 'text/html' });
        this.iframe.src = URL.createObjectURL(blob);
        console.log(`[AppHost] iframe.src set, total launchMcpApp time: ${Date.now() - fetchStart}ms`);
    }

    private async _getSessionId(): Promise<string | undefined> {
        if (this.sessionId) return this.sessionId;
        const result = await this.client.getSessions();
        return result.sessions?.[0]?.sessionId;
    }
}
