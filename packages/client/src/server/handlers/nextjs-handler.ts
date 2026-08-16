/**
 * Next.js App Router Handler for MCP
 * Stateless transport for serverless environments:
 * - POST + `Accept: text/event-stream` streams progress + rpc-response
 * - POST + JSON accepts direct RPC result response
 */

import { SSEConnectionManager, mergeClientMetadata, type ClientMetadata } from './sse-handler.js';
import type { McpConnectionEvent, McpObservabilityEvent } from '../../shared/events.js';
import { isConnectionEvent, isRpcResponseEvent } from '../../shared/event-routing.js';
import type { McpRpcResponse } from '../../shared/types.js';

/** Resolved user identity for an authenticated request. */
export interface AuthenticatedUser {
  /** User / tenant identifier. */
  userId: string;
}

export interface NextMcpHandlerOptions {
  /**
   * Resolve the authenticated user from the request.
   * Return `{ userId }` to authorize the request, or `null` to reject with 401.
   *
   * Default: trusts the client — reads the `x-mcp-user-id` header (and an optional
   * `Authorization: Bearer` token) from the request. This is convenient for local
   * development and apps without server-side auth.
   *
   * Override to make identity server-authoritative — ignore client-supplied headers
   * and resolve from your own session/cookie/JWT. Return `null` when unauthenticated.
   */
  authenticate?: (request: Request) => AuthenticatedUser | null | Promise<AuthenticatedUser | null>;

  /**
   * Heartbeat interval in milliseconds (default: 30000)
   */
  heartbeatInterval?: number;

  /**
   * Static OAuth client metadata defaults (for all connections)
   */
  clientDefaults?: ClientMetadata;

  /**
   * Dynamic OAuth client metadata getter (per-request)
   */
  getClientMetadata?: (request: Request) => ClientMetadata | Promise<ClientMetadata>;
}

export function createNextMcpHandler(options: NextMcpHandlerOptions = {}) {
  const {
    authenticate = (request: Request): AuthenticatedUser | null => {
      const userId = request.headers.get('x-mcp-user-id');
      return userId ? { userId } : null;
    },
    heartbeatInterval = 30000,
    clientDefaults,
    getClientMetadata,
  } = options;

  const toManagerOptions = (userId: string, resolvedClientMetadata?: ClientMetadata) => ({
    userId,
    heartbeatInterval,
    clientDefaults: resolvedClientMetadata,
  });

  async function resolveClientMetadata(request: Request): Promise<ClientMetadata | undefined> {
    if (!getClientMetadata) return clientDefaults;
    return mergeClientMetadata(clientDefaults ?? {}, await getClientMetadata(request));
  }

  async function GET(): Promise<Response> {
    return Response.json(
      {
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Use POST /api/mcp. For streaming use Accept: text/event-stream.',
        },
      },
      { status: 405 }
    );
  }

  async function POST(request: Request): Promise<Response> {
    const user = await authenticate(request);
    const acceptsEventStream = (request.headers.get('accept') || '').toLowerCase().includes('text/event-stream');

    if (!user?.userId) {
      return Response.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
    }

    const { userId } = user;

    let rawBody = '';
    try {
      rawBody = await request.text();
      const body = rawBody ? JSON.parse(rawBody) : null;

      if (!body || typeof body !== 'object') {
        return Response.json(
          {
            error: {
              code: 'INVALID_REQUEST',
              message: 'Invalid JSON-RPC request body',
            },
          },
          { status: 400 }
        );
      }

      const resolvedClientMetadata = await resolveClientMetadata(request);

      if (!acceptsEventStream) {
        const manager = new SSEConnectionManager(
          toManagerOptions(userId, resolvedClientMetadata),
          () => { }
        );
        try {
          const response = await manager.handleRequest(body as any);
          return Response.json(response);
        } finally {
          manager.dispose();
        }
      }

      const stream = new TransformStream();
      const writer = stream.writable.getWriter();
      const encoder = new TextEncoder();
      let streamWritable = true;

      const sendSSE = (event: string, data: unknown) => {
        if (!streamWritable) return;
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        writer.write(encoder.encode(message)).catch(() => {
          streamWritable = false;
        });
      };

      const manager = new SSEConnectionManager(
        toManagerOptions(userId, resolvedClientMetadata),
        (event: McpConnectionEvent | McpObservabilityEvent | McpRpcResponse) => {
          if (isRpcResponseEvent(event)) {
            sendSSE('rpc-response', event);
          } else if (isConnectionEvent(event)) {
            sendSSE('connection', event);
          } else {
            sendSSE('observability', event);
          }
        }
      );

      sendSSE('connected', { timestamp: Date.now() });

      void (async () => {
        try {
          await manager.handleRequest(body as any);
        } catch (error) {
          const err = error instanceof Error ? error : new Error('Unknown error');
          sendSSE('rpc-response', {
            id: (body as any).id || 'unknown',
            error: {
              code: 'EXECUTION_ERROR',
              message: err.message,
            },
          } satisfies McpRpcResponse);
        } finally {
          streamWritable = false;
          manager.dispose();
          writer.close().catch(() => { });
        }
      })();

      return new Response(stream.readable, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      console.error('[MCP Next Handler] Failed to handle RPC', {
        userId,
        message: err.message,
        stack: err.stack,
        rawBody: rawBody.slice(0, 500),
      });
      return Response.json(
        {
          error: {
            code: 'EXECUTION_ERROR',
            message: err.message,
          },
        },
        { status: 500 }
      );
    }
  }

  return { GET, POST };
}
