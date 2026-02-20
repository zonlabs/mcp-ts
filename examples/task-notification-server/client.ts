import { MCPClient } from '../../src/server/mcp/oauth-client';

async function main() {
  const client = new MCPClient({
    identity: 'example-user',
    sessionId: 'example-session',
    serverId: 'example-server',
    serverUrl: 'http://localhost:3007/mcp',
    callbackUrl: 'http://localhost:3007/oauth/callback',
    transportType: 'streamable_http',
  });

  client.onServerNotification((event) => {
    console.log('[notification]', event.method, event.params);
  });

  await client.connect();

  // Trigger tool task (tool is declared as task-enabled on server side)
  const created = await client.callToolTask('long_job', { durationMs: 2500 }, 60000);
  const taskId = created.task.taskId;

  const tasks = await client.listTasks();
  console.log('[tasks/list count]', tasks.tasks.length);

  let state = await client.getTask(taskId);
  while (state.status === 'working' || state.status === 'input_required') {
    console.log('[task state]', state.status, state.statusMessage);
    await new Promise((resolve) => setTimeout(resolve, state.pollInterval ?? 1000));
    state = await client.getTask(taskId);
  }

  const result = await client.getTaskResult(taskId);
  console.log('[task result]', result);

  client.disconnect();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
