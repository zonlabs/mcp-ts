import { DurableObject } from "cloudflare:workers";

export interface OAuthCodeStoreEnv {
  OAUTH_CODES: DurableObjectNamespace<OAuthCodeStore>;
}

export const OAUTH_CODE_TTL_SECONDS = 60;

interface OAuthCodeRecord {
  token: string;
  expiresAt: number;
}

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
}
