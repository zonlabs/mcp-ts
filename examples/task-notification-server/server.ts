import { randomUUID } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { InMemoryTaskStore, InMemoryTaskMessageQueue } from '@modelcontextprotocol/sdk/experimental';

type ProgressToken = string | number;

const app = express();
app.use(express.json());

const taskStore = new InMemoryTaskStore();
const messageQueue = new InMemoryTaskMessageQueue();

const mcpServer = new McpServer(
  {
    name: 'mcp-ts-task-notifier-example',
    version: '0.1.0',
  },
  {
    capabilities: {
      logging: {},
      tasks: {
        list: {},
        cancel: {},
        requests: {
          tools: { call: {} },
        },
      },
    },
    taskStore,
    taskMessageQueue: messageQueue,
  },
);

mcpServer.experimental.tasks.registerToolTask(
  'long_job',
  {
    description: 'Simulates a long job with progress and task status notifications',
    inputSchema: {
      durationMs: z.number().int().positive().default(5000),
    },
  },
  {
    async createTask({ durationMs }, extra) {
      const task = await extra.taskStore.createTask({ ttl: extra.taskRequestedTtl });
      const progressToken: ProgressToken = `task-${task.taskId}`;

      void (async () => {
        const steps = 5;
        const stepMs = Math.max(100, Math.floor(durationMs / steps));

        for (let i = 1; i <= steps; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, stepMs));

          await extra.sendNotification({
            method: 'notifications/progress',
            params: {
              progressToken,
              progress: i,
              total: steps,
              message: `Step ${i}/${steps}`,
            },
          });

          await extra.sendNotification({
            method: 'notifications/tasks/status',
            params: {
              taskId: task.taskId,
              status: i === steps ? 'completed' : 'working',
              createdAt: task.createdAt,
              lastUpdatedAt: new Date().toISOString(),
              ttl: task.ttl,
              pollInterval: 1000,
              statusMessage: i === steps ? 'Task completed' : `Task progress ${i}/${steps}`,
            },
          });
        }

        await extra.taskStore.storeTaskResult(task.taskId, 'completed', {
          content: [
            {
              type: 'text',
              text: `long_job completed after ${durationMs}ms`,
            },
          ],
        });
      })();

      return { task };
    },

    async getTask(_args, extra) {
      return await extra.taskStore.getTask(extra.taskId);
    },

    async getTaskResult(_args, extra) {
      return await extra.taskStore.getTaskResult(extra.taskId);
    },
  },
);

app.all('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const port = Number(process.env.PORT ?? 3007);
app.listen(port, () => {
  console.log(`MCP task notification example server listening at http://localhost:${port}/mcp`);
});
