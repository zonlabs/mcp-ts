import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const authCodeMessage = 'MCP_AUTH_CODE';
const authChannelName = 'mcp-auth-channel';

async function loadHarness(page: Page): Promise<void> {
  const id = Math.random().toString(36).slice(2, 10);
  const fixtureDir = path.join(process.cwd(), 'test-results', `oauth-popup-harness-${id}`);
  await mkdir(fixtureDir, { recursive: true });

  const entryFile = path.join(fixtureDir, 'entry.tsx');
  const bundleFile = path.join(fixtureDir, 'bundle.js');
  const popupSource = path.resolve(process.cwd(), 'src/client/react/oauth-popup.tsx').replace(/\\/g, '/');

  await writeFile(
    entryFile,
    `
      import React, { useEffect, useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { McpOAuthCallbackContent, useMcpOAuthPopup } from ${JSON.stringify(popupSource)};

      function Harness() {
        const [connections, setConnections] = useState(window.__initialConnections || []);

        useEffect(() => {
          window.__setConnections = setConnections;
        }, []);

        useMcpOAuthPopup(connections, async (state, code) => {
          window.__finishAuthCalls.push({ state, code });
          if (window.__finishAuthErrorMessage) {
            throw new Error(window.__finishAuthErrorMessage);
          }
        });

        return null;
      }

      window.__finishAuthCalls = [];
      window.__finishAuthErrorMessage = undefined;
      window.__renderOAuthHarness = (connections = []) => {
        window.__initialConnections = connections;
        createRoot(document.getElementById('root')).render(React.createElement(Harness));
      };
      window.__renderOAuthCallback = ({ code, sessionId }) => {
        createRoot(document.getElementById('root')).render(
          React.createElement(McpOAuthCallbackContent, { code, sessionId })
        );
      };
    `
  );

  await build({
    entryPoints: [entryFile],
    outfile: bundleFile,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
  });

  await page.route('http://oauth-popup.test/', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: '<div id="root"></div>',
    });
  });
  await page.goto('http://oauth-popup.test/');
  await page.addScriptTag({ path: bundleFile });
}

async function renderHarness(page: Page, connections: Array<{ sessionId: string; state: string }>): Promise<void> {
  await page.evaluate((initialConnections) => {
    window.__renderOAuthHarness(initialConnections);
  }, connections);
  await expect.poll(() => page.evaluate(() => typeof window.__setConnections)).toBe('function');
}

async function sendAuthCode(page: Page, sessionId: string, code: string): Promise<void> {
  await page.evaluate(
    ({ channelName, type, sessionId, code }) => {
      const payload = { type, sessionId, code };

      window.dispatchEvent(
        new MessageEvent('message', {
          data: payload,
          origin: window.location.origin,
          source: window,
        })
      );

      const channel = new BroadcastChannel(channelName);
      channel.postMessage(payload);
      channel.close();
    },
    { channelName: authChannelName, type: authCodeMessage, sessionId, code }
  );
}

async function sendAuthCodeWindowMessage(
  page: Page,
  data: { sessionId?: string; code?: string; origin?: string }
): Promise<void> {
  await page.evaluate(
    ({ type, sessionId, code, origin }) => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type, sessionId, code },
          origin,
          source: window,
        })
      );
    },
    {
      type: authCodeMessage,
      sessionId: data.sessionId,
      code: data.code,
      origin: data.origin,
    }
  );
}

async function sendAuthCodeFromPopupFrame(
  page: Page,
  data: { sessionId?: string; code?: string }
): Promise<void> {
  await page.evaluate(
    ({ type, sessionId, code }) => {
      const frame = document.createElement('iframe');
      frame.src = 'about:blank';
      document.body.appendChild(frame);
      frame.contentWindow?.addEventListener('message', (event) => {
        if (event.data?.type === 'MCP_AUTH_RESULT') {
          window.__authResults.push(event.data);
        }
      });

      const payload = { type, sessionId, code };
      (frame.contentWindow as (Window & { eval: (script: string) => unknown }) | null)?.eval(
        `parent.postMessage(${JSON.stringify(payload)}, ${JSON.stringify(window.location.origin)})`
      );
    },
    {
      type: authCodeMessage,
      sessionId: data.sessionId,
      code: data.code,
    }
  );
}

async function captureAuthResults(page: Page): Promise<void> {
  await page.evaluate(
    ({ channelName }) => {
      window.__authResults = [];

      window.addEventListener('message', (event) => {
        if (event.data?.type === 'MCP_AUTH_RESULT') {
          window.__authResults.push(event.data);
        }
      });

      const channel = new BroadcastChannel(channelName);
      channel.addEventListener('message', (event) => {
        if (event.data?.type === 'MCP_AUTH_RESULT') {
          window.__authResults.push(event.data);
        }
      });
      window.__authResultChannel = channel;
    },
    { channelName: authChannelName }
  );
}

async function captureAuthCodeMessages(page: Page): Promise<void> {
  await page.evaluate(
    ({ channelName }) => {
      window.__authCodeMessages = [];

      const channel = new BroadcastChannel(channelName);
      channel.addEventListener('message', (event) => {
        if (event.data?.type === 'MCP_AUTH_CODE') {
          window.__authCodeMessages.push(event.data);
        }
      });
      window.__authCodeChannel = channel;
    },
    { channelName: authChannelName }
  );
}

test.describe('useMcpOAuthPopup', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      window.__authCodeChannel?.close();
      window.__authResultChannel?.close();
    }).catch(() => undefined);
  });

  test('processes duplicate popup and broadcast auth code messages once', async ({ page }) => {
    await loadHarness(page);
    await renderHarness(page, [{ sessionId: 'session-1', state: 'AUTHORIZING' }]);

    await sendAuthCode(page, 'session-1', 'code-1');

    await expect.poll(() => page.evaluate(() => window.__finishAuthCalls.length)).toBe(1);
    await expect(page.evaluate(() => window.__finishAuthCalls)).resolves.toEqual([
      { state: 'session-1', code: 'code-1' },
    ]);
  });

  test('does not mark an auth code processed before its session exists', async ({ page }) => {
    await loadHarness(page);
    await renderHarness(page, []);

    await sendAuthCode(page, 'session-2', 'code-2');
    await page.waitForTimeout(100);
    await expect(page.evaluate(() => window.__finishAuthCalls)).resolves.toEqual([]);

    await page.evaluate(() => {
      window.__setConnections([{ sessionId: 'session-2', state: 'AUTHORIZING' }]);
    });
    await sendAuthCode(page, 'session-2', 'code-2');

    await expect.poll(() => page.evaluate(() => window.__finishAuthCalls.length)).toBe(1);
    await expect(page.evaluate(() => window.__finishAuthCalls)).resolves.toEqual([
      { state: 'session-2', code: 'code-2' },
    ]);
  });

  test('ignores auth code messages from another origin', async ({ page }) => {
    await loadHarness(page);
    await renderHarness(page, [{ sessionId: 'session-3', state: 'AUTHORIZING' }]);

    await sendAuthCodeWindowMessage(page, {
      sessionId: 'session-3',
      code: 'code-3',
      origin: 'https://evil.example',
    });
    await page.waitForTimeout(100);

    await expect(page.evaluate(() => window.__finishAuthCalls)).resolves.toEqual([]);
  });

  test('reports missing session identifiers back to the popup', async ({ page }) => {
    await loadHarness(page);
    await renderHarness(page, [{ sessionId: 'session-4', state: 'AUTHORIZING' }]);
    await captureAuthResults(page);

    await sendAuthCodeFromPopupFrame(page, {
      code: 'code-4',
    });

    await expect.poll(() => page.evaluate(() => window.__authResults.length)).toBeGreaterThan(0);
    await expect(page.evaluate(() => window.__authResults)).resolves.toContainEqual(
      expect.objectContaining({
        type: 'MCP_AUTH_RESULT',
        success: false,
        error: 'Missing OAuth session identifier',
      })
    );
  });

  test('reports finishAuth errors back to the popup', async ({ page }) => {
    await loadHarness(page);
    await renderHarness(page, [{ sessionId: 'session-5', state: 'AUTHORIZING' }]);
    await captureAuthResults(page);
    await page.evaluate(() => {
      window.__finishAuthErrorMessage = 'Authorization code already used';
    });

    await sendAuthCodeFromPopupFrame(page, {
      sessionId: 'session-5',
      code: 'code-5',
    });

    await expect.poll(() => page.evaluate(() => window.__authResults.length)).toBeGreaterThan(0);
    await expect(page.evaluate(() => window.__authResults)).resolves.toContainEqual(
      expect.objectContaining({
        type: 'MCP_AUTH_RESULT',
        sessionId: 'session-5',
        success: false,
        error: 'Authorization code already used',
      })
    );
  });

  test('reports success when the authenticated connection becomes ready', async ({ page }) => {
    await loadHarness(page);
    await renderHarness(page, [{ sessionId: 'session-6', state: 'AUTHORIZING' }]);
    await captureAuthResults(page);

    await sendAuthCodeFromPopupFrame(page, {
      sessionId: 'session-6',
      code: 'code-6',
    });
    await expect.poll(() => page.evaluate(() => window.__finishAuthCalls.length)).toBe(1);

    await page.evaluate(() => {
      window.__setConnections([{ sessionId: 'session-6', state: 'CONNECTED' }]);
    });

    await expect.poll(() => page.evaluate(() => window.__authResults.length)).toBeGreaterThan(0);
    await expect(page.evaluate(() => window.__authResults)).resolves.toContainEqual(
      expect.objectContaining({
        type: 'MCP_AUTH_RESULT',
        sessionId: 'session-6',
        success: true,
      })
    );
  });

  test('reports success back to a popup that identified itself with full OAuth state', async ({ page }) => {
    await loadHarness(page);
    await renderHarness(page, [{ sessionId: 'session-7', state: 'AUTHORIZING' }]);
    await captureAuthResults(page);

    await sendAuthCodeFromPopupFrame(page, {
      sessionId: 'nonce-7.session-7',
      code: 'code-7',
    });
    await expect.poll(() => page.evaluate(() => window.__finishAuthCalls.length)).toBe(1);

    await page.evaluate(() => {
      window.__setConnections([{ sessionId: 'session-7', state: 'READY' }]);
    });

    await expect.poll(() => page.evaluate(() => window.__authResults.length)).toBeGreaterThan(0);
    await expect(page.evaluate(() => window.__authResults)).resolves.toContainEqual(
      expect.objectContaining({
        type: 'MCP_AUTH_RESULT',
        sessionId: 'nonce-7.session-7',
        success: true,
      })
    );
  });
});

test.describe('McpOAuthCallbackContent', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      window.__authCodeChannel?.close();
      window.__authResultChannel?.close();
    }).catch(() => undefined);
  });

  test('broadcasts the auth code when COOP removes the opener reference', async ({ page }) => {
    await loadHarness(page);
    await captureAuthCodeMessages(page);

    await page.evaluate(() => {
      window.__renderOAuthCallback({ code: 'code-without-opener', sessionId: 'session-without-opener' });
    });

    await expect.poll(() => page.evaluate(() => window.__authCodeMessages.length)).toBe(1);
    await expect(page.evaluate(() => window.__authCodeMessages)).resolves.toEqual([
      {
        type: 'MCP_AUTH_CODE',
        code: 'code-without-opener',
        state: 'session-without-opener',
        sessionId: 'session-without-opener',
      },
    ]);
  });
});

declare global {
  interface Window {
    __authCodeChannel?: BroadcastChannel;
    __authCodeMessages: Array<{ type: string; sessionId?: string; state?: string; code?: string }>;
    __authResultChannel?: BroadcastChannel;
    __authResults: Array<{ type: string; sessionId?: string; state?: string; success: boolean; error?: string }>;
    __finishAuthErrorMessage?: string;
    __finishAuthCalls: Array<{ state: string; code: string }>;
    __initialConnections?: Array<{ sessionId: string; state: string }>;
    __renderOAuthCallback: (props: { code?: string | null; sessionId?: string | null }) => void;
    __renderOAuthHarness: (connections?: Array<{ sessionId: string; state: string }>) => void;
    __setConnections: (connections: Array<{ sessionId: string; state: string }>) => void;
  }
}
