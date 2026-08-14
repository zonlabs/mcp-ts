import { DurableObject } from "cloudflare:workers";

export interface OAuthCodeStoreEnv {
  OAUTH_CODES: DurableObjectNamespace<OAuthCodeStore>;
}

export const OAUTH_CODE_TTL_SECONDS = 60;

interface OAuthCodeRecord {
  token: string;
  expiresAt: number;
}

export interface OAuthSignInRecord {
  verifier: string;
  next: string;
}

/** How long a sign-in (PKCE) session stays valid before it must complete. */
export const OAUTH_SIGN_IN_TTL_SECONDS = 600;

/**
 * One-time authorization-code store.
 *
 * Codes are issued for a short TTL and consumed at most once. Backed by the
 * Durable Object SQLite storage so that issue + exchange are serialized on a
 * single instance — reliable across Vercel's serverless instances.
 */
export class OAuthCodeStore extends DurableObject<OAuthCodeStoreEnv> {
  async issue(token: string, ttlSeconds: number = OAUTH_CODE_TTL_SECONDS): Promise<string> {
    const code = crypto.randomUUID().replace(/-/g, "");
    const record: OAuthCodeRecord = {
      token,
      expiresAt: Date.now() + ttlSeconds * 1000,
    };
    await this.ctx.storage.put<OAuthCodeRecord>(code, record, {
      expirationTtl: ttlSeconds,
    } as DurableObjectPutOptions);
    return code;
  }

  async consume(code: string): Promise<OAuthCodeRecord | null> {
    const record = await this.ctx.storage.get<OAuthCodeRecord>(code);
    if (!record) return null;
    await this.ctx.storage.delete(code);
    return record;
  }

  /**
   * Create a sign-in session holding the PKCE verifier. Returns a session id
   * that is appended to the Supabase OAuth redirect so the callback can
   * correlate the returned auth code with the verifier.
   */
  async createSignIn(
    verifier: string,
    next: string,
    ttlSeconds: number = OAUTH_SIGN_IN_TTL_SECONDS,
  ): Promise<string> {
    const sessionId = crypto.randomUUID().replace(/-/g, "");
    const record: OAuthSignInRecord = { verifier, next };
    await this.ctx.storage.put<OAuthSignInRecord>(`signin:${sessionId}`, record, {
      expirationTtl: ttlSeconds,
    } as DurableObjectPutOptions);
    return sessionId;
  }

  /** Single-use retrieval of a sign-in session's PKCE verifier + return URL. */
  async takeSignIn(sessionId: string): Promise<OAuthSignInRecord | null> {
    const key = `signin:${sessionId}`;
    const record = await this.ctx.storage.get<OAuthSignInRecord>(key);
    if (!record) return null;
    await this.ctx.storage.delete(key);
    return record;
  }
}
