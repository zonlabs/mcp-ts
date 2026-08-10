import {
    DORMANT_SESSION_EXPIRATION_MS,
    DORMANT_SESSION_EXPIRATION_SECONDS,
    STATE_EXPIRATION_MS,
} from '../../shared/constants.js';
import type { Session, SessionStatus } from './types.js';
import { normalizeToolPolicy } from './tool-policy.js';

export function resolveSessionExpiresAt(status: SessionStatus = 'pending', referenceTime = Date.now()): number | null {
    return status === 'active' ? null : referenceTime + STATE_EXPIRATION_MS;
}

export function resolveSessionRedisTtlSeconds(session: Pick<Session, 'status'>): number {
    return session.status === 'active'
        ? DORMANT_SESSION_EXPIRATION_SECONDS
        : Math.floor(STATE_EXPIRATION_MS / 1000);
}

export function normalizeNewSession(session: Session, now = Date.now()): Session {
    const createdAt = session.createdAt || now;
    const updatedAt = session.updatedAt ?? createdAt;
    const status = session.status ?? 'pending';

    return {
        ...session,
        status,
        createdAt,
        updatedAt,
        expiresAt: resolveSessionExpiresAt(status, status === 'active' ? updatedAt : createdAt),
        toolPolicy: normalizeToolPolicy(session.toolPolicy, updatedAt),
    };
}

export function mergeSessionUpdate(
    current: Session,
    data: Partial<Session>,
    now = Date.now()
): Session {
    const updatedAt = data.updatedAt ?? now;
    const updated = {
        ...current,
        ...data,
        updatedAt,
    };
    const status = updated.status ?? 'pending';

    return {
        ...updated,
        status,
        expiresAt: resolveSessionExpiresAt(status, updatedAt),
        toolPolicy: normalizeToolPolicy(updated.toolPolicy, updatedAt),
    };
}

export function normalizeStoredSession(session: Session): Session {
    const createdAt = session.createdAt || Date.now();
    const updatedAt = session.updatedAt ?? createdAt;
    const status = session.status ?? 'pending';
    const expiresAt = status === 'active'
        ? null
        : session.expiresAt ?? resolveSessionExpiresAt(status, createdAt);

    return {
        ...session,
        status,
        createdAt,
        updatedAt,
        expiresAt,
        toolPolicy: normalizeToolPolicy(session.toolPolicy, updatedAt),
    };
}

export function isSessionExpired(session: Session, now = Date.now()): boolean {
    const hydrated = normalizeStoredSession(session);

    if (hydrated.status === 'active') {
        return hydrated.updatedAt !== undefined &&
            hydrated.updatedAt < now - DORMANT_SESSION_EXPIRATION_MS;
    }

    return typeof hydrated.expiresAt === 'number' && hydrated.expiresAt < now;
}

