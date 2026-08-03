import { test, expect } from '@playwright/test';
import {
    sessions,
    onSessionMutation,
    _setStorageInstanceForTesting,
    _resetSessionMutationListenersForTesting,
    MemoryStorageBackend,
} from '../src/server/storage';
import { createMockSession } from './test-utils';

test.describe('session mutation events', () => {
    test.beforeEach(() => {
        _setStorageInstanceForTesting(new MemoryStorageBackend());
        _resetSessionMutationListenersForTesting();
    });

    test.afterEach(async () => {
        try {
            await sessions.disconnect();
        } catch {
            // No-op for tests.
        }
        _resetSessionMutationListenersForTesting();
        _setStorageInstanceForTesting(null);
    });

    test('emits create, update, and delete events after successful mutations', async () => {
        const session = createMockSession();
        const events: Array<{ type: string; userId: string; sessionId: string; patch?: unknown }> = [];

        const unsubscribe = onSessionMutation((event) => {
            events.push({
                type: event.type,
                userId: event.userId,
                sessionId: event.sessionId,
                patch: event.patch,
            });
        });

        await sessions.create(session);
        await sessions.update(session.userId, session.sessionId, { status: 'pending' });
        await sessions.delete(session.userId, session.sessionId);
        unsubscribe();

        expect(events).toEqual([
            {
                type: 'create',
                userId: session.userId,
                sessionId: session.sessionId,
                patch: undefined,
            },
            {
                type: 'update',
                userId: session.userId,
                sessionId: session.sessionId,
                patch: { status: 'pending' },
            },
            {
                type: 'delete',
                userId: session.userId,
                sessionId: session.sessionId,
                patch: undefined,
            },
        ]);
    });

    test('does not emit when the mutation fails', async () => {
        const session = createMockSession();
        const events: string[] = [];

        onSessionMutation((event) => {
            events.push(event.type);
        });

        await sessions.create(session);
        await expect(sessions.create(session)).rejects.toThrow(/already exists/);
        await expect(sessions.update('missing-user', 'missing-session', { status: 'active' })).rejects.toThrow(/not found/);

        expect(events).toEqual(['create']);
    });

    test('unsubscribe stops future delivery and listener errors do not break writes', async () => {
        const session = createMockSession();
        const events: string[] = [];

        const unsubscribe = onSessionMutation((event) => {
            events.push(`first:${event.type}`);
        });

        onSessionMutation(() => {
            throw new Error('listener failed');
        });

        await sessions.create(session);
        unsubscribe();
        await sessions.update(session.userId, session.sessionId, { status: 'pending' });

        expect(events).toEqual(['first:create']);
        const stored = await sessions.get(session.userId, session.sessionId);
        expect(stored?.status).toBe('pending');
    });
});
