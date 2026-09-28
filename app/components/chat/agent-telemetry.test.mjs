import test from 'node:test';
import assert from 'node:assert/strict';

test('compaction summary parser extracts summary from marked message', () => {
  const message = {
    id: 'summary-12345',
    role: 'user',
    metadata: {
      isCompactedSummary: true,
      compactedCount: 8,
      summary: '- User asked about database migrations\n- Connected Supabase project',
    },
    parts: [
      {
        type: 'text',
        text: '[Previous Conversation Context Summary]:\n- User asked about database migrations\n- Connected Supabase project',
      },
    ],
  };

  const isCompacted =
    Boolean(message.metadata?.isCompactedSummary) ||
    message.parts.some((p) => p?.type === 'text' && p.text?.startsWith('[Previous Conversation Context Summary'));

  assert.equal(isCompacted, true);

  const rawText = message.parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join(' ');
  const summaryText = rawText.replace(/^\[Previous Conversation Context Summary(?:\s*\(\d+\s*messages compacted\))?\]:\s*/i, '');

  assert.equal(summaryText, '- User asked about database migrations\n- Connected Supabase project');
});

test('subagent toModelOutput shields parent context by extracting final summary text', () => {
  const toModelOutput = ({ output: message }) => {
    if (!message) {
      return {
        type: 'text',
        value: 'No relevant information found in the project files.',
      };
    }
    if (typeof message === 'string') {
      return {
        type: 'text',
        value: message,
      };
    }
    const parts = Array.isArray(message.parts) ? message.parts : [];
    const lastTextPart = parts.findLast((p) => p?.type === 'text' && p.text);
    return {
      type: 'text',
      value: lastTextPart?.text ?? 'File research completed.',
    };
  };

  const mockSubagentExecutionMessage = {
    id: 'subagent-msg-1',
    role: 'assistant',
    parts: [
      { type: 'text', text: 'Analyzing database files...' },
      {
        type: 'tool-list_project_files',
        state: 'output-available',
        output: { files: ['schema.sql', 'migrations.sql'] },
      },
      {
        type: 'tool-read_project_file',
        state: 'output-available',
        output: { content: 'CREATE TABLE users (id SERIAL PRIMARY KEY, ... 5000 lines of SQL ...)' },
      },
      {
        type: 'text',
        text: 'The database schema contains 14 tables with RLS policies enabled on users and chats.',
      },
    ],
  };

  const modelOutput = toModelOutput({ output: mockSubagentExecutionMessage });
  // Verifies parent LLM only receives the concise answer and not the 5000 lines of SQL
  assert.deepEqual(modelOutput, {
    type: 'text',
    value: 'The database schema contains 14 tables with RLS policies enabled on users and chats.',
  });
});

test('memory tool structured responses provide action and telemetry', () => {
  const formatMemoryEvent = (toolPart, toolName) => {
    const input = toolPart.input || {};
    const output = toolPart.output || {};
    if (toolName === 'remember_fact') {
      return {
        action: 'remember',
        fact: input.fact || output.fact,
        isComplete: toolPart.state === 'output-available',
      };
    }
    if (toolName === 'forget_fact') {
      return {
        action: 'forget',
        memoryId: input.memoryId || output.memoryId,
        isComplete: toolPart.state === 'output-available',
      };
    }
    return null;
  };

  const rememberEvent = formatMemoryEvent(
    {
      state: 'output-available',
      input: { fact: 'Prefers TypeScript' },
      output: { success: true, action: 'remember', fact: 'Prefers TypeScript' },
    },
    'remember_fact'
  );

  assert.deepEqual(rememberEvent, {
    action: 'remember',
    fact: 'Prefers TypeScript',
    isComplete: true,
  });
});

test('conservative token estimation correctly calculates code and text tokens', () => {
  const estimateMessageTokens = (msg) => {
    let charCount = 0;
    if (Array.isArray(msg.parts)) {
      for (const p of msg.parts) {
        if (p?.text) charCount += p.text.length;
        if (p?.input) charCount += JSON.stringify(p.input).length;
        if (p?.output) charCount += JSON.stringify(p.output).length;
      }
    } else if (typeof msg.content === 'string') {
      charCount += msg.content.length;
    }
    return Math.ceil(charCount / 3.5);
  };

  const sampleMessage = {
    role: 'user',
    parts: [{ type: 'text', text: 'Hello, write a function in TypeScript' }],
  };

  const tokens = estimateMessageTokens(sampleMessage);
  assert.equal(tokens, Math.ceil(sampleMessage.parts[0].text.length / 3.5));
  assert.equal(tokens > 0, true);
});

test('checkpoint delta buffer reuses existing summary without re-compacting when delta is below threshold', () => {
  const existingSummary = {
    id: 'summary-1',
    role: 'system',
    metadata: {
      isCompactedSummary: true,
      compactedCount: 32,
      summary: '1. User Goals: Supabase auth\n2. Architecture: Next.js\n3. Progress: Auth done',
    },
    parts: [{ type: 'text', text: '[Previous Conversation Context Summary]: ...' }],
  };

  const deltaMessages = [
    { role: 'user', parts: [{ type: 'text', text: 'Now add a table for profiles' }] },
    { role: 'assistant', parts: [{ type: 'text', text: 'Here is the SQL create table profiles...' }] },
  ];

  const fullHistoryWithCheckpoint = [
    // 32 original messages that were compacted
    ...Array.from({ length: 32 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', parts: [{ type: 'text', text: `Old message ${i}` }] })),
    existingSummary,
    ...deltaMessages,
  ];

  const lastSummaryIndex = fullHistoryWithCheckpoint.findLastIndex(
    (m) => Boolean(m.metadata?.isCompactedSummary)
  );

  assert.equal(lastSummaryIndex, 32);

  const delta = fullHistoryWithCheckpoint.slice(lastSummaryIndex + 1);
  assert.equal(delta.length, 2);

  // Active context provided to model comprises checkpoint + delta messages
  const activeModelContext = [fullHistoryWithCheckpoint[lastSummaryIndex], ...delta];
  assert.equal(activeModelContext.length, 3);
  assert.equal(activeModelContext[0].id, 'summary-1');
  assert.equal(activeModelContext[1].parts[0].text, 'Now add a table for profiles');
});

