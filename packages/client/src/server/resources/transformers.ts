import { nanoid } from 'nanoid';
import type { Session } from '../storage/types.js';
import { normalizeToolPolicy } from '../storage/tool-policy.js';
import type {
  McpServer,
  McpServerAuth,
  McpServerConnectionStatus,
  McpServersCreateParameters,
  McpServersUpdateParameters,
} from '../../shared/types.js';

/**
 * Derives the connection status of an MCP server.
 * Returns a discriminated union following Smithery convention.
 */
export function deriveStatus(session: Session): McpServerConnectionStatus {
  if (session.enabled === false) {
    return { state: 'disconnected' };
  }

  if (session.metadata?.lastError) {
    return {
      state: 'error',
      message: session.metadata.lastError,
    };
  }

  const isOAuth =
    session.metadata?.authType !== 'none' &&
    (session.metadata?.authType === 'oauth' ||
      Boolean(session.tokens) ||
      Boolean(session.discoveryState) ||
      Boolean(session.authUrl));

  if (isOAuth) {
    const isConnected = session.status === 'active' && Boolean(session.tokens);
    if (!isConnected) {
      return {
        state: 'auth_required',
        ...(session.authUrl ? { authorizationUrl: session.authUrl } : {}),
      };
    }
    return { state: 'connected' };
  }

  return { state: 'connected' };
}

/**
 * Derives authentication configuration from a stored session.
 * Secrets (tokens and header values) are redacted from public responses.
 */
export function deriveAuth(session: Session): McpServerAuth {
  const isOAuth =
    session.metadata?.authType !== 'none' &&
    (session.metadata?.authType === 'oauth' ||
      Boolean(session.tokens) ||
      Boolean(session.discoveryState) ||
      Boolean(session.authUrl));

  if (isOAuth) {
    let existingConfig: any = {};
    if (session.metadata?.oauthConfig) {
      try {
        existingConfig = JSON.parse(session.metadata.oauthConfig);
      } catch {
        // ignore
      }
    }

    const clientMetadataUrl =
      existingConfig.clientMetadataUrl ||
      session.serverOptions?.clientMetadataUrl;

    const scopes =
      existingConfig.scopes ||
      (session.tokens as any)?.scope?.split(' ').filter(Boolean);

    const config: NonNullable<Extract<McpServerAuth, { type: 'oauth' }>['config']> = {
      ...(clientMetadataUrl ? { clientMetadataUrl } : {}),
      ...(scopes && scopes.length > 0 ? { scopes } : {}),
    };

    return {
      type: 'oauth',
      ...(Object.keys(config).length > 0 ? { config } : {}),
    };
  }

  const headers = session.headers || {};
  const authHeader = Object.entries(headers).find(([k]) => k.toLowerCase() === 'authorization')?.[1];

  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return {
      type: 'bearer',
      // Secret token redacted for security
    };
  }

  const headerKeys = Object.keys(headers);
  if (headerKeys.length > 0) {
    const redactedHeaders: Record<string, string> = {};
    for (const key of headerKeys) {
      redactedHeaders[key] = '';
    }
    return {
      type: 'custom-headers',
      headers: redactedHeaders,
    };
  }

  return { type: 'none' };
}

/**
 * Transforms an internal storage Session into a public McpServer entity.
 */
export function toMcpServer(session: Session): McpServer {
  const id = session.serverId || session.sessionId;

  let publicMetadata: Record<string, unknown> | undefined;
  if (session.metadata) {
    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(session.metadata)) {
      if (
        key !== 'description' &&
        key !== 'authType' &&
        key !== 'oauthConfig' &&
        key !== 'lastError'
      ) {
        try {
          cleaned[key] = typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))
            ? JSON.parse(val)
            : val;
        } catch {
          cleaned[key] = val;
        }
      }
    }
    if (Object.keys(cleaned).length > 0) {
      publicMetadata = cleaned;
    }
  }

  const createdAt = session.createdAt ? new Date(session.createdAt).toISOString() : new Date().toISOString();
  const updatedAt = session.updatedAt ? new Date(session.updatedAt).toISOString() : undefined;

  return {
    id,
    object: 'mcp_server',
    name: session.serverName || session.serverId || 'MCP Server',
    url: session.serverUrl,
    description: session.metadata?.description,
    enabled: session.enabled !== false,
    status: deriveStatus(session),
    auth: deriveAuth(session),
    toolPolicy: session.toolPolicy
      ? (normalizeToolPolicy(session.toolPolicy) ?? session.toolPolicy)
      : { mode: 'all', toolIds: [] as string[] },
    metadata: publicMetadata,
    createdAt,
    updatedAt,
  };
}

/**
 * Transforms create parameters into an internal Session record.
 */
export function toSession(params: McpServersCreateParameters): Session {
  const serverId = params.serverId || nanoid(12);
  const sessionId = `sess_${serverId}_${nanoid(8)}`;

  const headers: Record<string, string> = {};
  if (params.auth?.type === 'bearer' && params.auth.token) {
    headers['Authorization'] = `Bearer ${params.auth.token.trim()}`;
  } else if (params.auth?.type === 'custom-headers' && params.auth.headers) {
    Object.assign(headers, params.auth.headers);
  }

  const metadata: Record<string, string> = {};
  if (params.description) {
    metadata.description = params.description;
  }
  if (params.metadata) {
    for (const [k, v] of Object.entries(params.metadata)) {
      metadata[k] = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
    }
  }

  let clientId: string | undefined = undefined;

  if (params.auth?.type) {
    metadata.authType = params.auth.type;
    if (params.auth.type === 'oauth') {
      const oauthConfig = params.auth.config;
      if (oauthConfig) {
        const { clientSecret: _omitSecret, ...publicOAuthConfig } = oauthConfig;
        metadata.oauthConfig = JSON.stringify(publicOAuthConfig);
        if (oauthConfig.clientId) clientId = oauthConfig.clientId;
      }
    }
  }

  const now = Date.now();

  const clientMetadataUrl =
    params.auth?.type === 'oauth' ? params.auth.config?.clientMetadataUrl : undefined;

  const clientInformation =
    params.auth?.type === 'oauth' && params.auth.config?.clientId
      ? {
          client_id: params.auth.config.clientId,
          ...(params.auth.config.clientSecret ? { client_secret: params.auth.config.clientSecret } : {}),
        }
      : undefined;

    return {
      sessionId,
      serverId,
      serverName: params.name,
      serverUrl: params.url,
      callbackUrl: params.callbackUrl || 'http://localhost/oauth/callback',
      userId: params.userId,
      enabled: params.enabled !== false,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      status: params.auth?.type === 'oauth' ? 'pending' : 'active',
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      clientId,
      createdAt: now,
      updatedAt: now,
      ...(clientInformation ? { clientInformation } : {}),
      ...(clientMetadataUrl ? { serverOptions: { clientMetadataUrl } } : {}),
      ...(params.toolPolicy ? { toolPolicy: normalizeToolPolicy(params.toolPolicy) } : {}),
    };
}

/**
 * Transforms update parameters into a partial Session patch.
 */
export function toSessionPatch(
  params: McpServersUpdateParameters,
  existingSession: Session
): Partial<Session> {
  const patch: Partial<Session> = {
    updatedAt: Date.now(),
  };

  if (params.name !== undefined) patch.serverName = params.name;
  if (params.url !== undefined) patch.serverUrl = params.url;
  if (params.enabled !== undefined) patch.enabled = params.enabled;
  if (params.toolPolicy !== undefined) patch.toolPolicy = normalizeToolPolicy(params.toolPolicy);

  const clientMetadataUrl =
    params.auth?.type === 'oauth' ? params.auth.config?.clientMetadataUrl : undefined;

  if (clientMetadataUrl !== undefined) {
    patch.serverOptions = {
      ...(existingSession.serverOptions || {}),
      clientMetadataUrl: clientMetadataUrl || undefined,
    };
  }

  const metadata = { ...(existingSession.metadata || {}) };

  if (params.auth !== undefined) {
    const headers = { ...(existingSession.headers || {}) };
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === 'authorization') {
        delete headers[k];
      }
    }

    metadata.authType = params.auth.type;

    if (params.auth.type === 'bearer' && params.auth.token) {
      headers['Authorization'] = `Bearer ${params.auth.token.trim()}`;
      patch.headers = headers;
      delete metadata.oauthConfig;
    } else if (params.auth.type === 'custom-headers' && params.auth.headers) {
      patch.headers = { ...params.auth.headers };
      delete metadata.oauthConfig;
    } else if (params.auth.type === 'oauth') {
      const oauthConfig = params.auth.config;
      if (oauthConfig) {
        const { clientSecret: _omitSecret, ...publicOAuthConfig } = oauthConfig;
        metadata.oauthConfig = JSON.stringify(publicOAuthConfig);
        if (oauthConfig.clientId) {
          patch.clientId = oauthConfig.clientId;
          patch.clientInformation = {
            client_id: oauthConfig.clientId,
            ...(oauthConfig.clientSecret ? { client_secret: oauthConfig.clientSecret } : {}),
          };
        }
      }
      patch.headers = Object.keys(headers).length > 0 ? headers : undefined;
    } else if (params.auth.type === 'none') {
      delete metadata.oauthConfig;
      patch.headers = Object.keys(headers).length > 0 ? headers : undefined;
    }
  }

  if (params.metadata !== undefined || params.description !== undefined || params.auth !== undefined) {
    if (params.description !== undefined) {
      metadata.description = params.description;
    }
    if (params.metadata) {
      for (const [k, v] of Object.entries(params.metadata)) {
        metadata[k] = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
      }
    }
    patch.metadata = metadata;
  }

  return patch;
}
