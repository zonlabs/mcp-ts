/**
 * Next.js App Router Handler for MCP SSE
 * Provides a clean, zero-boilerplate API for Next.js applications
 */

import { SSEConnectionManager } from './sse-handler.js';
import type { McpConnectionEvent, McpObservabilityEvent } from '../shared/events.js';
import type { McpRpcResponse } from '../shared/types.js';

export interface NextMcpHandlerOptions {
  /**
   * Extract userId from request (default: from 'userId' query param)
   */
  getUserId?: (request: Request) => string | null;

  /**
   * Extract auth token from request (default: from 'token' query param or Authorization header)
   */
  getAuthToken?: (request: Request) => string | null;

  /**
   * Validate authentication (optional)
   */
  validateAuth?: (userId: string, token: string | null) => Promise<boolean> | boolean;

  /**
   * Heartbeat interval in milliseconds (default: 30000)
   */
  heartbeatInterval?: number;
}

// Global manager store - shared across requests for the same user
const managers = new Map<string, SSEConnectionManager>();

/**
 * Creates Next.js App Router handlers (GET and POST) for MCP SSE endpoint
 *
 * @example
 * ```typescript
 * // app/api/mcp/route.ts
 * import { createNextMcpHandler } from '@mcp-assistant/mcp-redis/server';
 *
 * export const { GET, POST } = createNextMcpHandler();
 * ```
 */
export function createNextMcpHandler(options: NextMcpHandlerOptions = {}) {
  const {
    getUserId = (request: Request) => new URL(request.url).searchParams.get('userId'),
    getAuthToken = (request: Request) => {
      const url = new URL(request.url);
      return url.searchParams.get('token') || request.headers.get('authorization');
    },
    validateAuth = () => true,
    heartbeatInterval = 30000,
  } = options;

  /**
   * GET handler - Establishes SSE connection
   */
  async function GET(request: Request): Promise<Response> {
    const userId = getUserId(request);
    const authToken = getAuthToken(request);

    if (!userId) {
      return new Response('Missing userId', { status: 400 });
    }

    // Validate auth
    const isAuthorized = await validateAuth(userId, authToken);
    if (!isAuthorized) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Create TransformStream for SSE
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    // Helper to send SSE events
    const sendSSE = (event: string, data: any) => {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      writer.write(encoder.encode(message)).catch(() => {
        // Client disconnected, ignore write errors
      });
    };

    // Send initial connection event
    sendSSE('connected', { timestamp: Date.now() });

    // Dispose old manager if exists
    const oldManager = managers.get(userId);
    if (oldManager) {
      oldManager.dispose();
    }

    // Create new manager
    const manager = new SSEConnectionManager(
      {
        userId,
        heartbeatInterval,
      },
      (event: McpConnectionEvent | McpObservabilityEvent | McpRpcResponse) => {
        // Determine event type and send via SSE
        if ('id' in event) {
          // RPC response
          sendSSE('rpc-response', event);
        } else if ('type' in event && 'sessionId' in event) {
          // Connection event
          sendSSE('connection', event);
        } else {
          // Observability event
          sendSSE('observability', event);
        }
      }
    );

    managers.set(userId, manager);

    // Handle client disconnect
    const abortController = new AbortController();
    request.signal?.addEventListener('abort', () => {
      manager.dispose();
      managers.delete(userId);
      writer.close().catch(() => {});
      abortController.abort();
    });

    // Return SSE response
    return new Response(stream.readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  /**
   * POST handler - Handles RPC requests
   */
  async function POST(request: Request): Promise<Response> {
    const userId = getUserId(request);
    const authToken = getAuthToken(request);

    if (!userId) {
      return Response.json({ error: { code: 'MISSING_USER_ID', message: 'Missing userId' } }, { status: 400 });
    }

    // Validate auth
    const isAuthorized = await validateAuth(userId, authToken);
    if (!isAuthorized) {
      return Response.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
    }

    try {
      const body = await request.json();

      // Get existing manager (created by GET endpoint)
      const manager = managers.get(userId);

      if (!manager) {
        return Response.json(
          {
            error: {
              code: 'NO_CONNECTION',
              message: 'No SSE connection found. Please establish SSE connection first.',
            },
          },
          { status: 400 }
        );
      }

      // Handle the request - response will be sent via SSE
      await manager.handleRequest(body);

      // Return acknowledgment (actual response goes through SSE)
      return Response.json({ acknowledged: true });
    } catch (error) {
      return Response.json(
        {
          error: {
            code: 'EXECUTION_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        },
        { status: 500 }
      );
    }
  }

  return { GET, POST };
}
