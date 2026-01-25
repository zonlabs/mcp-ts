import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Read the built Vue client code
const clientDistPath = path.resolve(__dirname, '../dist/client/vue.mjs');
// Ensure build exists
if (!fs.existsSync(clientDistPath)) {
    throw new Error('Build artifact dist/client/vue.mjs not found. Run "npm run build" first.');
}
const clientCode = fs.readFileSync(clientDistPath, 'utf-8');

test.describe('Vue Client useMcp', () => {
    test.beforeEach(async ({ page }) => {
        // Mock SSE endpoint
        await page.route('**/sse*', async route => {
            console.log('Route matched: SSE');
            await route.fulfill({
                status: 200,
                contentType: 'text/event-stream',
                body: 'retry: 1000\n\n'
            });
        });

        // Mock external dependencies to avoid network issues
        await page.route('https://esm.sh/nanoid@5.1.6', async route => {
            console.log('Route matched: nanoid');
            await route.fulfill({
                status: 200,
                contentType: 'application/javascript',
                body: 'export function nanoid() { return "test-id-" + Math.random(); }'
            });
        });

        // Mock external dependencies
        await page.route('https://esm.sh/vue@3.5.27', async route => {
            console.log('Route matched: vue');
            await route.fulfill({
                status: 200,
                contentType: 'application/javascript',
                body: `
                    export function ref(v) { return { value: v }; }
                    export function reactive(o) { return o; }
                    export function computed(fn) { return { value: fn() }; }
                    export function watch() {}
                    export function onMounted(fn) { setTimeout(fn, 0); }
                    export function onUnmounted() {}
                    export function shallowRef(v) { return { value: v }; }
                    export function inject() {}
                    export function provide() {}
                    
                    // Mock createApp for component mounting
                    export function createApp(rootComponent) {
                        return {
                            mount: (selector) => {
                                // Simulate mounting by calling setup
                                if (rootComponent.setup) {
                                    rootComponent.setup();
                                }
                            }
                        };
                    }
                    export function h() {}
                `
            });
        });

        // Serve the built client code locally (polyfill not needed if we mock process in head)
        await page.route('**/pkg/vue-client.mjs', async route => {
            console.log('Route matched: vue-client.mjs');
            // We still need the process polyfill for nanoid or other libs that might use it
            const polyfill = 'globalThis.process = { env: { NODE_ENV: "test" } };\n';
            await route.fulfill({
                status: 200,
                contentType: 'application/javascript',
                body: polyfill + clientCode
            });
        });

        // Mock the root page
        await page.route('http://localhost:3000/', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'text/html',
                body: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <script>
                            window.process = {
                                env: { NODE_ENV: 'test' }
                            };
                        </script>
                        <script type="importmap">
                        {
                            "imports": {
                                "vue": "https://esm.sh/vue@3.5.27",
                                "nanoid": "https://esm.sh/nanoid@5.1.6"
                            }
                        }
                        </script>
                    </head>
                    <body>
                        <div id="app"></div>
                    </body>
                    </html>
                `
            });
        });
    });

    test('should manage connections and handle events', async ({ page }) => {
        // Navigate to the mock page
        await page.goto('http://localhost:3000/');

        page.on('console', msg => console.log(`PAGE LOG: ${msg.text()}`));
        page.on('pageerror', err => console.log(`PAGE ERROR: ${err.message}`));
        page.on('requestfailed', request => console.log(`REQUEST FAILED: ${request.url()} - ${request.failure()?.errorText}`));

        const result = await page.evaluate(async () => {
            // Mock EventSource globally
            class MockEventSource extends EventTarget {
                url: string;
                readyState: number;
                static CONNECTING = 0;
                static OPEN = 1;
                static CLOSED = 2;

                constructor(url: string | URL) {
                    super();
                    this.url = url.toString();
                    this.readyState = MockEventSource.CONNECTING;
                    setTimeout(() => {
                        this.readyState = MockEventSource.OPEN;
                        this.dispatchEvent(new Event('open'));
                        // Simulate "connected" event from server
                        this.dispatchEvent(new MessageEvent('connection', {
                            data: JSON.stringify({ socketId: 'test-socket' })
                        }));
                    }, 10);

                    // Expose this instance to window for test control
                    (window as any).lastEventSource = this;
                }
                close() {
                    this.readyState = MockEventSource.CLOSED;
                }
            }
            (window as any).EventSource = MockEventSource;

            // Import dependencies (dynamic import to ensure mocked modules are loaded)
            let vue;
            let mcpLib;
            try {
                // @ts-ignore
                vue = await import('vue');
                // @ts-ignore
                mcpLib = await import('/pkg/vue-client.mjs');
            } catch (e) {
                console.error('Import failed:', e);
                return { error: `Import failed: ${e}` };
            }

            const { createApp, ref } = vue;
            const { useMcp } = mcpLib;

            // Create a wrapper component to use the composable
            return new Promise((resolve) => {
                const TestComponent = {
                    setup() {
                        const { connections, status } = useMcp({
                            url: '/sse',
                            identity: 'test-user',
                            autoConnect: true
                        });

                        // Expose state to window for checking
                        (window as any).mcpState = { connections, status };

                        // Check status after a delay
                        setTimeout(async () => {
                            try {
                                if (status.value !== 'connected') {
                                    resolve({ error: `Status is ${status.value}, expected connected` });
                                    return;
                                }

                                // Simulate state_changed event
                                const lastSource = (window as any).lastEventSource;
                                if (lastSource) {
                                    lastSource.dispatchEvent(new MessageEvent('connection', {
                                        data: JSON.stringify({
                                            type: 'state_changed',
                                            sessionId: 's1',
                                            serverId: 'serv1',
                                            serverName: 'Server 1',
                                            state: 'CONNECTED',
                                            previousState: 'CONNECTING',
                                            timestamp: Date.now()
                                        })
                                    }));
                                }

                                await new Promise(r => setTimeout(r, 20)); // Wait for reactivity

                                if (connections.value.length !== 1) {
                                    resolve({ error: `Connections length is ${connections.value.length}, expected 1` });
                                    return;
                                }
                                if (connections.value[0].serverId !== 'serv1') {
                                    resolve({ error: `ServerId is ${connections.value[0].serverId}, expected serv1` });
                                    return;
                                }

                                resolve({ success: true });

                            } catch (err: any) {
                                resolve({ error: err.message });
                            }
                        }, 100);
                    }
                };

                // Mount the component
                createApp(TestComponent).mount('#app');
            });
        });

        expect(result).toEqual({ success: true });
    });
});
