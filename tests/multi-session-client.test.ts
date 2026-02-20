import { test, expect } from '@playwright/test';
import { MultiSessionClient } from '../src/server/mcp/multi-session-client';

test.describe('MultiSessionClient notification listeners', () => {
  test('preserves onNotification listeners across disconnect', () => {
    const client = new MultiSessionClient('user-1');

    const received: any[] = [];
    client.onNotification((event) => {
      received.push(event);
    });

    (client as any).clients = [
      {
        getSessionId: () => 'session-1',
        disconnect: () => undefined,
      },
    ];

    client.disconnect();

    (client as any)._onNotification.fire({
      sessionId: 'session-1',
      serverId: 'server-1',
      method: 'notifications/progress',
      timestamp: Date.now(),
    });

    expect(received).toHaveLength(1);
    expect(received[0].sessionId).toBe('session-1');
  });

  test('supports typed notification handlers via setNotificationHandlers', () => {
    const client = new MultiSessionClient('user-1');

    const progressEvents: any[] = [];
    const taskStatusEvents: any[] = [];

    const subscription = client.setNotificationHandlers({
      onProgress: (event) => {
        progressEvents.push(event);
      },
      onTaskStatus: (event) => {
        taskStatusEvents.push(event);
      },
    });

    (client as any).fireTypedNotifications({
      sessionId: 'session-1',
      serverId: 'server-1',
      method: 'notifications/progress',
      params: { progress: 3, total: 10, message: 'working' },
      timestamp: Date.now(),
    });

    (client as any).fireTypedNotifications({
      sessionId: 'session-1',
      serverId: 'server-1',
      method: 'notifications/tasks/status',
      params: { taskId: 'task-1', status: 'running' },
      timestamp: Date.now(),
    });

    expect(progressEvents).toHaveLength(1);
    expect(progressEvents[0].progress).toBe(3);
    expect(taskStatusEvents).toHaveLength(1);
    expect(taskStatusEvents[0].status).toBe('running');

    subscription.dispose();

    (client as any).fireTypedNotifications({
      sessionId: 'session-1',
      serverId: 'server-1',
      method: 'notifications/progress',
      params: { progress: 4 },
      timestamp: Date.now(),
    });

    expect(progressEvents).toHaveLength(1);
  });



  test('disconnect clears stale forwarders even without connected clients', () => {
    const client = new MultiSessionClient('user-1');

    const disposed: string[] = [];
    (client as any).notificationForwarders.set('failed-session', {
      dispose: () => {
        disposed.push('failed-session');
      },
    });

    client.disconnect();

    expect(disposed).toEqual(['failed-session']);
    expect((client as any).notificationForwarders.size).toBe(0);
  });
  test('dispose removes notification listeners', () => {
    const client = new MultiSessionClient('user-1');

    const received: any[] = [];
    client.onNotification((event) => {
      received.push(event);
    });

    client.dispose();

    (client as any)._onNotification.fire({
      sessionId: 'session-1',
      serverId: 'server-1',
      method: 'notifications/progress',
      timestamp: Date.now(),
    });

    expect(received).toHaveLength(0);
  });

});
