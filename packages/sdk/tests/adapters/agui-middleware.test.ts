import { expect, test } from '@playwright/test';
import { Observable, type Subscriber } from 'rxjs';
import { EventType, type AbstractAgent, type BaseEvent, type RunAgentInput } from '@ag-ui/client';
import { createMcpMiddleware } from '../../src/adapters/agui-middleware';
import { type AguiTool } from '../../src/adapters/agui-adapter';

type RunHandler = (input: RunAgentInput, subscriber: Subscriber<BaseEvent>) => void | (() => void);

function createAgent(handlers: RunHandler[], onRunInput?: (input: RunAgentInput) => void): AbstractAgent {
  let callIndex = 0;

  return {
    run(input: RunAgentInput) {
      onRunInput?.(input);
      const handler = handlers[callIndex++];
      if (!handler) {
        throw new Error(`Unexpected agent run ${callIndex}`);
      }

      return new Observable<BaseEvent>((subscriber) => handler(input, subscriber));
    },
  } as AbstractAgent;
}

function collectEvents(events$: Observable<BaseEvent>): Promise<BaseEvent[]> {
  return new Promise((resolve, reject) => {
    const events: BaseEvent[] = [];

    events$.subscribe({
      next: (event) => events.push(event),
      error: reject,
      complete: () => resolve(events),
    });
  });
}

function createInput(content: string): RunAgentInput {
  return {
    threadId: 'thread-1',
    runId: 'run-1',
    messages: [{ id: 'user-1', role: 'user', content }],
    tools: [],
    context: [],
    state: {},
  };
}

function startToolRun(
  input: RunAgentInput,
  subscriber: Subscriber<BaseEvent>,
  toolCallId: string,
  toolName: string,
  query: string
) {
  subscriber.next({
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'assistant-1',
    delta: 'Let me search for tools.',
  } as BaseEvent);
  subscriber.next({
    type: EventType.TOOL_CALL_START,
    toolCallId,
    toolCallName: toolName,
  } as BaseEvent);
  subscriber.next({
    type: EventType.TOOL_CALL_ARGS,
    toolCallId,
    delta: JSON.stringify({ query }),
  } as BaseEvent);
  subscriber.next({
    type: EventType.TOOL_CALL_END,
    toolCallId,
  } as BaseEvent);
  subscriber.next({
    type: EventType.RUN_FINISHED,
    threadId: 'thread-1',
    runId: input.runId,
  } as BaseEvent);
}

test.describe('McpMiddleware', () => {
  test('waits for continuation terminal event after a fast MCP tool result', async () => {
    const tools: AguiTool[] = [
      {
        name: 'mcp_search_tools',
        description: 'Search available tools',
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
        handler: () => 'No tools found matching your query. Try different keywords.',
      },
    ];
    const input = createInput('which ipl match will be help today ?');
    const completionTimes: number[] = [];
    const finalRunFinishedAt = { value: 0 };
    const seenRunIds: string[] = [];
    const next = createAgent(
      [
        (agentInput, subscriber) => {
          startToolRun(agentInput, subscriber, 'call-1', 'mcp_search_tools', 'IPL match today cricket');
          setTimeout(() => subscriber.complete(), 10);
        },
        (agentInput, subscriber) => {
          setTimeout(() => {
            subscriber.next({
              type: EventType.TEXT_MESSAGE_CONTENT,
              messageId: 'assistant-2',
              delta: 'I could not find a matching tool.',
            } as BaseEvent);
            finalRunFinishedAt.value = Date.now();
            subscriber.next({
              type: EventType.RUN_FINISHED,
              threadId: 'thread-1',
              runId: agentInput.runId,
            } as BaseEvent);
            subscriber.complete();
          }, 40);
        },
      ],
      (agentInput) => seenRunIds.push(agentInput.runId)
    );

    const events$ = createMcpMiddleware({ tools })(input, next);
    const events = await new Promise<BaseEvent[]>((resolve, reject) => {
      const seen: BaseEvent[] = [];
      events$.subscribe({
        next: (event) => seen.push(event),
        error: reject,
        complete: () => {
          completionTimes.push(Date.now());
          resolve(seen);
        },
      });
    });

    expect(events.map((event) => event.type)).toContain(EventType.TOOL_CALL_RESULT);
    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
    expect(completionTimes[0]).toBeGreaterThanOrEqual(finalRunFinishedAt.value);
    expect(seenRunIds).toEqual(['run-1', 'run-1']);
  });

  test('continues through multiple MCP tool rounds before completing', async () => {
    const toolResults: string[] = [];
    const tools: AguiTool[] = [
      {
        name: 'mcp_search_tools',
        description: 'Search available tools',
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
        handler: ({ query }) => {
          const result = `result for ${query}`;
          toolResults.push(result);
          return result;
        },
      },
    ];
    const input = createInput('find tools');
    const seenRunIds: string[] = [];
    const next = createAgent(
      [
        (agentInput, subscriber) => {
          startToolRun(agentInput, subscriber, 'call-1', 'mcp_search_tools', 'first search');
          setTimeout(() => subscriber.complete(), 10);
        },
        (agentInput, subscriber) => {
          startToolRun(agentInput, subscriber, 'call-2', 'mcp_search_tools', 'second search');
          setTimeout(() => subscriber.complete(), 10);
        },
        (agentInput, subscriber) => {
          subscriber.next({
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: 'assistant-3',
            delta: 'Done searching.',
          } as BaseEvent);
          subscriber.next({
            type: EventType.RUN_FINISHED,
            threadId: 'thread-1',
            runId: agentInput.runId,
          } as BaseEvent);
          subscriber.complete();
        },
      ],
      (agentInput) => seenRunIds.push(agentInput.runId)
    );

    const events = await collectEvents(createMcpMiddleware({ tools })(input, next));

    expect(toolResults).toEqual(['result for first search', 'result for second search']);
    expect(events.filter((event) => event.type === EventType.TOOL_CALL_RESULT)).toHaveLength(2);
    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
    expect(seenRunIds).toEqual(['run-1', 'run-1', 'run-1']);
  });

  test('preserves normalized text content in assistant history for continuation', async () => {
    const tools: AguiTool[] = [
      {
        name: 'mcp_search_tools',
        description: 'Search available tools',
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
        handler: () => 'No tools found matching your query. Try different keywords.',
      },
    ];
    const input = createInput('find tools');
    let continuationInput: RunAgentInput | undefined;
    const seenRunIds: string[] = [];
    const next = createAgent(
      [
        (agentInput, subscriber) => {
          startToolRun(agentInput, subscriber, 'call-1', 'mcp_search_tools', 'IPL match today cricket');
          setTimeout(() => subscriber.complete(), 10);
        },
        (nextInput, subscriber) => {
          continuationInput = nextInput;
          subscriber.next({
            type: EventType.RUN_FINISHED,
            threadId: 'thread-1',
            runId: nextInput.runId,
          } as BaseEvent);
          subscriber.complete();
        },
      ],
      (agentInput) => seenRunIds.push(agentInput.runId)
    );

    await collectEvents(createMcpMiddleware({ tools })(input, next));

    const assistantMessage = continuationInput?.messages.at(-2) as any;
    const toolMessage = continuationInput?.messages.at(-1) as any;
    expect(assistantMessage).toMatchObject({
      role: 'assistant',
      content: 'Let me search for tools.',
      toolCalls: [
        expect.objectContaining({
          id: 'call-1',
          function: expect.objectContaining({ name: 'mcp_search_tools' }),
        }),
      ],
    });
    expect(toolMessage).toMatchObject({
      role: 'tool',
      toolCallId: 'call-1',
      content: 'No tools found matching your query. Try different keywords.',
    });
    expect(seenRunIds).toEqual(['run-1', 'run-1']);
  });

  test('normalizes duplicated streamed tool args in assistant history', async () => {
    const toolResults: string[] = [];
    const tools: AguiTool[] = [
      {
        name: 'mcp_search_tools',
        description: 'Search available tools',
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
        handler: ({ query }) => {
          toolResults.push(query);
          return `result for ${query}`;
        },
      },
    ];
    const input = createInput('find tools');
    let continuationInput: RunAgentInput | undefined;
    const next = createAgent([
      (agentInput, subscriber) => {
        subscriber.next({
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'assistant-1',
          delta: 'Let me search.',
        } as BaseEvent);
        subscriber.next({
          type: EventType.TOOL_CALL_START,
          toolCallId: 'call-1',
          toolCallName: 'mcp_search_tools',
        } as BaseEvent);
        subscriber.next({
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: 'call-1',
          delta: JSON.stringify({ query: 'copilotkit' }),
        } as BaseEvent);
        subscriber.next({
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: 'call-1',
          delta: JSON.stringify({ query: 'copilotkit' }),
        } as BaseEvent);
        subscriber.next({
          type: EventType.TOOL_CALL_END,
          toolCallId: 'call-1',
        } as BaseEvent);
        subscriber.next({
          type: EventType.RUN_FINISHED,
          threadId: 'thread-1',
          runId: agentInput.runId,
        } as BaseEvent);
        subscriber.complete();
      },
      (agentInput, subscriber) => {
        continuationInput = agentInput;
        subscriber.next({
          type: EventType.RUN_FINISHED,
          threadId: 'thread-1',
          runId: agentInput.runId,
        } as BaseEvent);
        subscriber.complete();
      },
    ]);

    await collectEvents(createMcpMiddleware({ tools })(input, next));

    const assistantMessage = continuationInput?.messages.at(-2) as any;
    const argsString = assistantMessage.toolCalls[0].function.arguments;
    expect(JSON.parse(argsString)).toEqual({ query: 'copilotkit' });
    expect(toolResults).toEqual(['copilotkit']);
  });

  test('does not rediscover resolved LangGraph snapshot tool calls', async () => {
    let handlerCalls = 0;
    const tools: AguiTool[] = [
      {
        name: 'mcp_execute_tool',
        description: 'Execute selected MCP tool',
        parameters: { type: 'object', properties: {} },
        handler: () => {
          handlerCalls++;
          return 'stale result';
        },
      },
    ];
    const input = createInput('find current data');
    const next = createAgent([
      (agentInput, subscriber) => {
        subscriber.next({
          type: EventType.MESSAGES_SNAPSHOT,
          messages: [
            ...agentInput.messages,
            {
              id: 'assistant-tool',
              role: 'assistant',
              content: 'Let me search the web.',
              toolCalls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: {
                    name: 'mcp_execute_tool',
                    arguments: JSON.stringify({ toolName: 'web_search_exa' }),
                  },
                },
              ],
            },
            {
              id: 'tool-result',
              role: 'tool',
              toolCallId: 'call-1',
              content: 'already resolved',
            },
            {
              id: 'assistant-final',
              role: 'assistant',
              content: 'Here is the final answer.',
            },
          ],
        } as BaseEvent);
        subscriber.next({
          type: EventType.RUN_FINISHED,
          threadId: 'thread-1',
          runId: agentInput.runId,
        } as BaseEvent);
        subscriber.complete();
      },
    ]);

    const events = await collectEvents(createMcpMiddleware({ tools })(input, next));

    expect(handlerCalls).toBe(0);
    expect(events.filter((event) => event.type === EventType.TOOL_CALL_RESULT)).toHaveLength(0);
    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
  });

  test('executes unresolved LangGraph snapshot tool calls once', async () => {
    let continuationInput: RunAgentInput | undefined;
    const tools: AguiTool[] = [
      {
        name: 'mcp_search_tools',
        description: 'Search available tools',
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
        handler: ({ query }) => `result for ${query}`,
      },
    ];
    const input = createInput('find tools');
    const next = createAgent([
      (agentInput, subscriber) => {
        subscriber.next({
          type: EventType.MESSAGES_SNAPSHOT,
          messages: [
            ...agentInput.messages,
            {
              id: 'assistant-tool',
              role: 'assistant',
              content: 'Let me search for tools.',
              toolCalls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: {
                    name: 'mcp_search_tools',
                    arguments: JSON.stringify({ query: 'first search' }),
                  },
                },
              ],
            },
          ],
        } as BaseEvent);
        subscriber.next({
          type: EventType.RUN_FINISHED,
          threadId: 'thread-1',
          runId: agentInput.runId,
        } as BaseEvent);
        subscriber.complete();
      },
      (agentInput, subscriber) => {
        continuationInput = agentInput;
        subscriber.next({
          type: EventType.RUN_FINISHED,
          threadId: 'thread-1',
          runId: agentInput.runId,
        } as BaseEvent);
        subscriber.complete();
      },
    ]);

    const events = await collectEvents(createMcpMiddleware({ tools })(input, next));

    expect(events.filter((event) => event.type === EventType.TOOL_CALL_RESULT)).toHaveLength(1);
    expect(continuationInput?.messages.at(-2)).toMatchObject({
      id: 'assistant-tool',
      role: 'assistant',
      content: 'Let me search for tools.',
    });
    expect(continuationInput?.messages.at(-1)).toMatchObject({
      role: 'tool',
      toolCallId: 'call-1',
      content: 'result for first search',
    });
  });

  test('does not re-execute tool calls already completed by middleware when snapshots omit tool messages', async () => {
    let handlerCalls = 0;
    const tools: AguiTool[] = [
      {
        name: 'mcp_execute_tool',
        description: 'Execute selected MCP tool',
        parameters: { type: 'object', properties: {} },
        handler: () => {
          handlerCalls++;
          return 'web result';
        },
      },
    ];
    const input = createInput('find current data');
    const assistantToolCall = {
      id: 'call-1',
      type: 'function',
      function: {
        name: 'mcp_execute_tool',
        arguments: JSON.stringify({ toolName: 'web_search_exa' }),
      },
    };
    const next = createAgent([
      (agentInput, subscriber) => {
        subscriber.next({
          type: EventType.MESSAGES_SNAPSHOT,
          messages: [
            ...agentInput.messages,
            {
              id: 'assistant-tool',
              role: 'assistant',
              content: 'Let me search the web.',
              toolCalls: [assistantToolCall],
            },
          ],
        } as BaseEvent);
        subscriber.next({
          type: EventType.RUN_FINISHED,
          threadId: 'thread-1',
          runId: agentInput.runId,
        } as BaseEvent);
        subscriber.complete();
      },
      (agentInput, subscriber) => {
        subscriber.next({
          type: EventType.MESSAGES_SNAPSHOT,
          messages: [
            ...agentInput.messages.filter((message: any) => message.role !== 'tool'),
            {
              id: 'assistant-final',
              role: 'assistant',
              content: 'Here is the final answer.',
            },
          ],
        } as BaseEvent);
        subscriber.next({
          type: EventType.RUN_FINISHED,
          threadId: 'thread-1',
          runId: agentInput.runId,
        } as BaseEvent);
        subscriber.complete();
      },
    ]);

    const events = await collectEvents(createMcpMiddleware({ tools })(input, next));

    expect(handlerCalls).toBe(1);
    expect(events.filter((event) => event.type === EventType.TOOL_CALL_RESULT)).toHaveLength(1);
    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
  });

  test('filters final full-history snapshots after MCP continuations to preserve streamed UI order', async () => {
    const tools: AguiTool[] = [
      {
        name: 'mcp_search_tools',
        description: 'Search available tools',
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
        handler: () => 'catalog result',
      },
    ];
    const input = createInput('what tools do you have?');
    const next = createAgent([
      (agentInput, subscriber) => {
        subscriber.next({
          type: EventType.MESSAGES_SNAPSHOT,
          messages: [
            ...agentInput.messages,
            {
              id: 'assistant-tool',
              role: 'assistant',
              content: 'Let me search for all available tools.',
              toolCalls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: {
                    name: 'mcp_search_tools',
                    arguments: JSON.stringify({ query: 'all tools' }),
                  },
                },
              ],
            },
          ],
        } as BaseEvent);
        subscriber.next({
          type: EventType.RUN_FINISHED,
          threadId: 'thread-1',
          runId: agentInput.runId,
        } as BaseEvent);
        subscriber.complete();
      },
      (agentInput, subscriber) => {
        subscriber.next({
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'assistant-final',
          delta: 'Here is a complete list of all available tools.',
        } as BaseEvent);
        subscriber.next({
          type: EventType.MESSAGES_SNAPSHOT,
          messages: [
            ...agentInput.messages,
            {
              id: 'assistant-final',
              role: 'assistant',
              content: 'Here is a complete list of all available tools.',
            },
          ],
        } as BaseEvent);
        subscriber.next({
          type: EventType.RUN_FINISHED,
          threadId: 'thread-1',
          runId: agentInput.runId,
        } as BaseEvent);
        subscriber.complete();
      },
    ]);

    const events = await collectEvents(createMcpMiddleware({ tools })(input, next));

    const snapshotEvents = events.filter((event) => event.type === EventType.MESSAGES_SNAPSHOT);
    expect(snapshotEvents).toHaveLength(1);
    expect((snapshotEvents[0] as any).messages.at(-1).id).toBe('assistant-tool');
    expect(events.filter((event) => event.type === EventType.TOOL_CALL_RESULT)).toHaveLength(1);
    expect(events.at(-2)).toMatchObject({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'assistant-final',
    });
    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
  });

  test('keeps snapshot-only final answers after MCP continuations', async () => {
    let handlerCalls = 0;
    const tools: AguiTool[] = [
      {
        name: 'mcp_search_tools',
        description: 'Search available tools',
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
        handler: () => {
          handlerCalls++;
          return 'catalog result';
        },
      },
    ];
    const input = createInput('what tools do you have?');
    const next = createAgent([
      (agentInput, subscriber) => {
        subscriber.next({
          type: EventType.MESSAGES_SNAPSHOT,
          messages: [
            ...agentInput.messages,
            {
              id: 'assistant-tool',
              role: 'assistant',
              content: 'Let me search for all available tools.',
              toolCalls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: {
                    name: 'mcp_search_tools',
                    arguments: JSON.stringify({ query: 'all tools' }),
                  },
                },
              ],
            },
          ],
        } as BaseEvent);
        subscriber.next({
          type: EventType.RUN_FINISHED,
          threadId: 'thread-1',
          runId: agentInput.runId,
        } as BaseEvent);
        subscriber.complete();
      },
      (agentInput, subscriber) => {
        subscriber.next({
          type: EventType.MESSAGES_SNAPSHOT,
          messages: [
            ...agentInput.messages,
            {
              id: 'assistant-final',
              role: 'assistant',
              content: 'Here is a complete list of all available tools.',
            },
          ],
        } as BaseEvent);
        subscriber.next({
          type: EventType.RUN_FINISHED,
          threadId: 'thread-1',
          runId: agentInput.runId,
        } as BaseEvent);
        subscriber.complete();
      },
    ]);

    const events = await collectEvents(createMcpMiddleware({ tools })(input, next));

    const snapshotEvents = events.filter((event) => event.type === EventType.MESSAGES_SNAPSHOT);
    expect(handlerCalls).toBe(1);
    expect(snapshotEvents).toHaveLength(2);
    expect((snapshotEvents.at(-1) as any).messages.at(-1)).toMatchObject({
      id: 'assistant-final',
      role: 'assistant',
      content: 'Here is a complete list of all available tools.',
    });
    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
  });
});
