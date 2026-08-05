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
   * Authenticate user and verify access (optional)
   * Return true if user is authenticated, false otherwise
   */
  authenticate?: (userId: string, token: string | null) => Promise<boolean> | boolean;

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
    getUserId = (request: Request) => request.headers.get('x-mcp-user-id'),
    getAuthToken = (request: Request) => {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.toLowerCase().startsWith('bearer ')) {
        return authHeader.slice(7);
      }
      return authHeader;
    },
    authenticate = () => true,
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
    const userId = getUserId(request);
    const authToken = getAuthToken(request);
    const acceptsEventStream = (request.headers.get('accept') || '').toLowerCase().includes('text/event-stream');

    if (!userId) {
      return Response.json({ error: { code: 'MISSING_userId', message: 'Missing userId' } }, { status: 400 });
    }

    const isAuthorized = await authenticate(userId, authToken);
    if (!isAuthorized) {
      return Response.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
    }

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
