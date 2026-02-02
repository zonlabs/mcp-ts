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
        bridge.onmessage = async (p) => { this.onAppMessage?.(p); return {}; };

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
     */
    public async start() {
        if (!this.iframe.contentWindow) throw new Error('Iframe not ready');

        const transport = new PostMessageTransport(
            this.iframe.contentWindow,
            this.iframe.contentWindow
        );
        try {
            await this.bridge.connect(transport);
        } catch (error) {
            console.error('[AppHost] Bridge connection failed:', error);
            throw error;
        }
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
     */
    public async launch(url: string, sessionId?: string) {
        if (sessionId) this.sessionId = sessionId;

        // MCP Apps are typically referenced via `ui://...` resource URIs.
        // We also support legacy/custom `mcp-app://...` schemes.
        if (url.startsWith('ui://') || url.startsWith('mcp-app://')) {
            await this.launchMcpApp(url);
        } else {
            this.iframe.src = url;
        }
    }

    private async launchMcpApp(uri: string) {
        if (!this.client.isConnected()) throw new Error('Client must be connected');

        const sessionId = await this._getSessionId();
        if (!sessionId) throw new Error('No active session');

        // Check cache first, then fetch
        let response;
        if (this.resourceCache.has(uri)) {
            response = await this.resourceCache.get(uri);
        } else {
            response = await this.client.readResource(sessionId, uri) as any;
        }

        if (!response?.contents?.length) throw new Error('Empty resource');

        const content = response.contents[0];
        const html = content.blob ? atob(content.blob) : content.text;

        if (!html) throw new Error('Invalid content');

        // Render via Blob URL for isolation cleanliness
        const blob = new Blob([html], { type: 'text/html' });
        this.iframe.src = URL.createObjectURL(blob);
    }

    private async _getSessionId(): Promise<string | undefined> {
        if (this.sessionId) return this.sessionId;
        const result = await this.client.getSessions();
        return result.sessions?.[0]?.sessionId;
    }
}
