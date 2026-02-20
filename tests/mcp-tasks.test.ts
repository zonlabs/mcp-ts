import { test, expect } from '@playwright/test';
import { MCPClient } from '../src/server/mcp/oauth-client';
import { MultiSessionClient } from '../src/server/mcp/multi-session-client';

test.describe('MCP task helper methods', () => {
  test('MCPClient task helpers call expected task RPC methods', async () => {
    const client = new MCPClient({
      identity: 'user-1',
      sessionId: 'session-1',
      serverId: 'server-1',
      serverUrl: 'https://example.com/mcp',
      callbackUrl: 'https://example.com/callback',
    });

    const calls: any[] = [];
    (client as any).client = {
      request: async (request: any) => {
        calls.push(request);

        if (request.method === 'tools/call') {
          return {
            task: {
              taskId: 'task-1',
              status: 'working',
              ttl: 60000,
              createdAt: '2026-01-01T00:00:00Z',
              lastUpdatedAt: '2026-01-01T00:00:01Z',
            },
          };
        }

        if (request.method === 'tasks/get') {
          return {
            taskId: request.params.taskId,
            status: 'working',
            ttl: 1000,
            createdAt: '2026-01-01T00:00:00Z',
            lastUpdatedAt: '2026-01-01T00:00:01Z',
          };
        }

        if (request.method === 'tasks/result') {
          return { content: [{ type: 'text', text: 'done' }] };
        }

        if (request.method === 'tasks/list') {
          return {
            tasks: [
              {
                taskId: 'task-1',
                status: 'working',
                ttl: 1000,
                createdAt: '2026-01-01T00:00:00Z',
                lastUpdatedAt: '2026-01-01T00:00:01Z',
              },
            ],
          };
        }

        if (request.method === 'tasks/cancel') {
          return {
            taskId: request.params.taskId,
            status: 'cancelled',
            ttl: 1000,
            createdAt: '2026-01-01T00:00:00Z',
            lastUpdatedAt: '2026-01-01T00:00:01Z',
          };
        }

        return {};
      },
    };

    const created = await client.callToolTask('long_job', { durationMs: 500 }, 60000);
    const state = await client.getTask('task-1');
    const payload = await client.getTaskResult('task-1');
    const list = await client.listTasks();
    const cancelled = await client.cancelTask('task-1');

    expect(created.task.taskId).toBe('task-1');
    expect(state.status).toBe('working');
    expect((payload as any).content[0].text).toBe('done');
    expect(list.tasks[0].taskId).toBe('task-1');
    expect(cancelled.status).toBe('cancelled');

    expect(calls.map((c) => c.method)).toEqual([
      'tools/call',
      'tasks/get',
      'tasks/result',
      'tasks/list',
      'tasks/cancel',
    ]);
  });

  test('MultiSessionClient delegates task helpers by session id', async () => {
    const multi = new MultiSessionClient('user-1');

    const delegated: any[] = [];
    (multi as any).clients = [
      {
        getSessionId: () => 'session-1',
        getTask: async (taskId: string) => {
          delegated.push(['getTask', taskId]);
          return { taskId, status: 'working' };
        },
        getTaskResult: async (taskId: string) => {
          delegated.push(['getTaskResult', taskId]);
          return { ok: true, taskId };
        },
        listTasks: async (cursor?: string) => {
          delegated.push(['listTasks', cursor]);
          return { tasks: [] };
        },
        callToolTask: async (toolName: string, args: Record<string, unknown>, ttl?: number) => {
          delegated.push(['callToolTask', toolName, args, ttl]);
          return { task: { taskId: 'task-1' } };
        },
        cancelTask: async (taskId: string) => {
          delegated.push(['cancelTask', taskId]);
          return { taskId, status: 'cancelled' };
        },
      },
    ];

    await multi.callToolTask('session-1', 'long_job', { durationMs: 500 }, 60000);
    await multi.getTask('session-1', 'task-1');
    await multi.getTaskResult('session-1', 'task-1');
    await multi.listTasks('session-1', 'cursor-1');
    await multi.cancelTask('session-1', 'task-1');

    expect(delegated).toEqual([
      ['callToolTask', 'long_job', { durationMs: 500 }, 60000],
      ['getTask', 'task-1'],
      ['getTaskResult', 'task-1'],
      ['listTasks', 'cursor-1'],
      ['cancelTask', 'task-1'],
    ]);
  });
});
