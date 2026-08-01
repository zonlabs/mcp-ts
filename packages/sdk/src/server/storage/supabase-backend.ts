import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionStore, Session, SessionCredentials, GetOptions, SessionResult } from './types.js';
import { generateSessionId } from '../../shared/utils.js';
import { encryptObject, decryptObject } from './crypto.js';
import { resolveSessionExpiresAt } from './session-lifecycle.js';
import { normalizeToolPolicy } from './tool-policy.js';
import { DORMANT_SESSION_EXPIRATION_MS } from '../../shared/constants.js';

export class SupabaseStorageBackend implements SessionStore {
    constructor(private supabase: SupabaseClient) {}

    async init(): Promise<void> {
        await this.assertTable('mcp_sessions', 'session_id');
        console.log('[mcp-ts][Storage] Supabase: storage tables verified.');
    }

    private async assertTable(table: string, column: string): Promise<void> {
        const { error } = await this.supabase
            .from(table)
            .select(column)
            .limit(0);

        if (!error) return;

        if (error.code === '42P01') {
            throw new Error(
                `[SupabaseStorage] Table "${table}" not found in your database. ` +
                'Please run "npx mcp-ts supabase-init" to set up the required storage schema.'
            );
        }

        throw new Error(`[SupabaseStorage] Initialization check failed for "${table}": ${error.message}`);
    }

    generateSessionId(): string {
        return generateSessionId();
    }

    private mapRowToSessionData(row: any): Session {
        return {
            sessionId: row.session_id,
            serverId: row.server_id,
            serverName: row.server_name,
            serverUrl: row.server_url,
            serverOptions: row.server_options ?? undefined,
            callbackUrl: row.callback_url,
            createdAt: new Date(row.created_at).getTime(),
            updatedAt: new Date(row.updated_at ?? row.created_at).getTime(),
            expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : null,
            userId: row.user_id,
            headers: decryptObject(row.headers),
            authUrl: row.auth_url,
            status: row.status ?? 'pending',
            toolPolicy: normalizeToolPolicy(row.tool_policy),
            clientInformation: decryptObject(row.client_information),
            tokens: decryptObject(row.tokens),
            codeVerifier: decryptObject(row.code_verifier),
            clientId: row.client_id,
            oauthState: row.oauth_state,
            enabled: row.enabled ?? true,
        };
    }

    private hasCredentialData(data: Partial<SessionCredentials>): boolean {
        return (
            'clientInformation' in data ||
            'tokens' in data ||
            'codeVerifier' in data ||
            'clientId' in data ||
            'oauthState' in data
        );
    }

    async create(session: Session): Promise<void> {
        const { sessionId, userId } = session;
        if (!sessionId || !userId) throw new Error('userId and sessionId required');

        const status = session.status ?? 'pending';
        const createdAt = new Date(session.createdAt || Date.now()).toISOString();
        const updatedAt = new Date(session.updatedAt ?? session.createdAt ?? Date.now()).toISOString();
        const expiresAt = resolveSessionExpiresAt(status, new Date(createdAt).getTime());

        const insertData: Record<string, unknown> = {
            session_id: sessionId,
            user_id: userId,
            server_id: session.serverId,
            server_name: session.serverName,
            server_url: session.serverUrl,
            server_options: session.serverOptions ?? null,
            callback_url: session.callbackUrl,
            created_at: createdAt,
            updated_at: updatedAt,
            headers: encryptObject(session.headers),
            auth_url: session.authUrl ?? null,
            status,
            expires_at: expiresAt === null ? null : new Date(expiresAt).toISOString(),
        };

        const toolPolicy = normalizeToolPolicy(session.toolPolicy);
        if (toolPolicy) {
            insertData.tool_policy = toolPolicy;
        }

        const { error } = await this.supabase
            .from('mcp_sessions')
            .insert(insertData);

        if (error) {
            if (error.code === '23505') {
                throw new Error(`Session ${sessionId} already exists`);
            }
            throw new Error(`Failed to create session in Supabase: ${error.message}`);
        }

    }

    async update(userId: string, sessionId: string, data: Partial<Session>): Promise<void> {
        const updateData: any = {
            updated_at: new Date().toISOString(),
        };

        if ('serverId' in data) updateData.server_id = data.serverId;
        if ('serverName' in data) updateData.server_name = data.serverName;
        if ('serverUrl' in data) updateData.server_url = data.serverUrl;
        if ('serverOptions' in data) updateData.server_options = data.serverOptions ?? null;
        if ('callbackUrl' in data) updateData.callback_url = data.callbackUrl;
        if ('status' in data) {
            const status = data.status ?? 'pending';
            const expiresAt = resolveSessionExpiresAt(status);
            updateData.status = status;
            updateData.expires_at = expiresAt === null ? null : new Date(expiresAt).toISOString();
        }
        if ('headers' in data) updateData.headers = encryptObject(data.headers);
        if ('authUrl' in data) updateData.auth_url = data.authUrl ?? null;
        if ('toolPolicy' in data) updateData.tool_policy = normalizeToolPolicy(data.toolPolicy);
        if ('enabled' in data) updateData.enabled = data.enabled;

        const shouldUpdateSession = Object.keys(updateData).some((key) => key !== 'updated_at');

        let updatedRows: any[] | null = null;
        if (shouldUpdateSession) {
            const result = await this.supabase
                .from('mcp_sessions')
                .update(updateData)
                .eq('user_id', userId)
                .eq('session_id', sessionId)
                .select('id');

            if (result.error) {
                throw new Error(`Failed to update session: ${result.error.message}`);
            }
            updatedRows = result.data;
        } else {
            const result = await this.supabase
                .from('mcp_sessions')
                .select('id')
                .eq('user_id', userId)
                .eq('session_id', sessionId);

            if (result.error) {
                throw new Error(`Failed to update session: ${result.error.message}`);
            }
            updatedRows = result.data;
        }

        if (!updatedRows || updatedRows.length === 0) {
            throw new Error(`Session ${sessionId} not found for userId ${userId}`);
        }

    }

    async patchCredentials(userId: string, sessionId: string, data: Partial<SessionCredentials>): Promise<void> {
        if (!this.hasCredentialData(data)) return;

        const updateData: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
        };

        if ('clientInformation' in data) updateData.client_information = data.clientInformation == null ? null : encryptObject(data.clientInformation);
        if ('tokens' in data) updateData.tokens = data.tokens == null ? null : encryptObject(data.tokens);
        if ('codeVerifier' in data) updateData.code_verifier = data.codeVerifier == null ? null : encryptObject(data.codeVerifier);
        if ('clientId' in data) updateData.client_id = data.clientId ?? null;
        if ('oauthState' in data) updateData.oauth_state = data.oauthState ?? null;

        const { error } = await this.supabase
            .from('mcp_sessions')
            .update(updateData)
            .eq('user_id', userId)
            .eq('session_id', sessionId);

        if (error) {
            throw new Error(`Failed to update credentials: ${error.message}`);
        }
    }

    async get(userId: string, sessionId: string, options?: GetOptions): Promise<SessionResult | null> {
        const selection = options?.includeCredentials
            ? '*'
            : 'session_id, user_id, server_id, server_name, server_url, server_options, callback_url, created_at, updated_at, expires_at, headers, auth_url, status, tool_policy, enabled, server_options';

        const { data, error } = await this.supabase
            .from('mcp_sessions')
            .select(selection)
            .eq('user_id', userId)
            .eq('session_id', sessionId)
            .maybeSingle();

        if (error) {
            console.error('[SupabaseStorage] Failed to get session:', error);
            return null;
        }

        if (!data) return null;

        return this.mapRowToSessionData(data);
    }

    async getCredentials(userId: string, sessionId: string): Promise<SessionCredentials | null> {
        const { data, error } = await this.supabase
            .from('mcp_sessions')
            .select('client_information, tokens, code_verifier, client_id, oauth_state')
            .eq('user_id', userId)
            .eq('session_id', sessionId)
            .maybeSingle();

        if (error) {
            console.error('[SupabaseStorage] Failed to get credentials:', error);
            return null;
        }

        if (!data) return null;

        return {
            sessionId,
            userId,
            clientInformation: decryptObject(data.client_information),
            tokens: decryptObject(data.tokens),
            codeVerifier: decryptObject(data.code_verifier),
            clientId: data.client_id,
            oauthState: data.oauth_state,
        };
    }

    async list(userId: string): Promise<Session[]> {
        const { data, error } = await this.supabase
            .from('mcp_sessions')
            .select('*')
            .eq('user_id', userId);

        if (error) {
            console.error(`[SupabaseStorage] Failed to get session data for ${userId}:`, error);
            return [];
        }

        return data.map(row => this.mapRowToSessionData(row));
    }

    async clearCredentials(userId: string, sessionId: string): Promise<void> {
        const { error } = await this.supabase
            .from('mcp_sessions')
            .update({
                client_information: null,
                tokens: null,
                code_verifier: null,
                client_id: null,
                oauth_state: null,
                updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
            .eq('session_id', sessionId);

        if (error) {
            throw new Error(`Failed to clear credentials: ${error.message}`);
        }
    }

    async delete(userId: string, sessionId: string): Promise<void> {
        const { error } = await this.supabase
            .from('mcp_sessions')
            .delete()
            .eq('user_id', userId)
            .eq('session_id', sessionId);

        if (error) {
            console.error('[SupabaseStorage] Failed to remove session:', error);
        }
    }

    async listIds(userId: string): Promise<string[]> {
        const { data, error } = await this.supabase
            .from('mcp_sessions')
            .select('session_id')
            .eq('user_id', userId);

        if (error) {
            console.error(`[SupabaseStorage] Failed to get sessions for ${userId}:`, error);
            return [];
        }

        return data.map(row => row.session_id);
    }

    async listAllIds(): Promise<string[]> {
        const { data, error } = await this.supabase
            .from('mcp_sessions')
            .select('session_id');

        if (error) {
            console.error('[SupabaseStorage] Failed to get all sessions:', error);
            return [];
        }

        return data.map(row => row.session_id);
    }

    async clearAll(): Promise<void> {
        const { error } = await this.supabase
            .from('mcp_sessions')
            .delete()
            .neq('session_id', '');

        if (error) {
            console.error('[SupabaseStorage] Failed to clear sessions:', error);
        }
    }

    async cleanupExpired(): Promise<void> {
        const { error: transientError } = await this.supabase
            .from('mcp_sessions')
            .delete()
            .not('expires_at', 'is', null)
            .neq('status', 'active')
            .lt('expires_at', new Date().toISOString());

        if (transientError) {
            console.error('[SupabaseStorage] Failed to cleanup expired inactive sessions:', transientError);
        }

        const dormantCutoff = new Date(Date.now() - DORMANT_SESSION_EXPIRATION_MS).toISOString();
        const { error: dormantError } = await this.supabase
            .from('mcp_sessions')
            .delete()
            .eq('status', 'active')
            .lt('updated_at', dormantCutoff);

        if (dormantError) {
            console.error('[SupabaseStorage] Failed to cleanup dormant active sessions:', dormantError);
        }
    }

    async disconnect(): Promise<void> {
        // Supabase client handles its own connection pooling over HTTP.
    }
}
