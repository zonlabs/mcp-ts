import { Memory } from 'mem0ai/oss';

export const memory = new Memory({
  version: 'v1.1',
  embedder: {
    provider: 'openai',
    config: {
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      model: 'openai/text-embedding-3-small',
      embeddingDims: 1536,
    },
  },
  vectorStore: {
    provider: 'supabase',
    config: {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_SECRET_KEY,
      tableName: 'memories',
      embeddingDims: 1536,
    },
  },
  llm: {
    provider: 'openai',
    config: {
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      model: 'openai/gpt-4o-mini',
      maxTokens: 1000,
    },
  },
  disableHistory: true,
  customInstructions: `
    Extract key user facts, preferences, background, and recurring context:
    - Personal preferences, communication style, tone, and interests.
    - Projects, work context, and active goals.
    - Important instructions, rules, or constraints the user expects to be remembered.
    Ignore ephemeral questions, greetings, temporary error outputs, and casual chit-chat.
  `.trim(),
});

// Patch Mem0's internal OpenAI client to enforce a conservative max_tokens limit (1000).
// OpenRouter defaults to the model's full 16,384 token output window when max_tokens is undefined.
// If the OpenRouter key's remaining credit cannot afford 16,384 tokens, OpenRouter rejects with HTTP 402.
try {
  const llmInstance = (memory as any)?.llm;
  if (llmInstance?.openai?.chat?.completions) {
    const originalCreate = llmInstance.openai.chat.completions.create.bind(
      llmInstance.openai.chat.completions
    );
    llmInstance.openai.chat.completions.create = (params: any, options: any) => {
      return originalCreate(
        {
          ...params,
          max_tokens: params.max_tokens ?? 1000,
        },
        options
      );
    };
  }
} catch (e) {
  console.warn('[Mem0] Failed to patch OpenAI client max_tokens:', e);
}


export interface MemoryRecord {
  id: string;
  memory: string;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, any>;
}

export interface MemoryQueryOptions {
  userId: string;
  runId?: string;
  limit?: number;
}

export interface AddMemoryOptions {
  userId: string;
  runId?: string;
  metadata?: Record<string, any>;
}

/**
 * Searches memories for a given query and filters by user ID (and optional run ID).
 */
export async function searchMemories(
  query: string,
  options: MemoryQueryOptions
): Promise<MemoryRecord[]> {
  const { userId, runId, limit = 5 } = options;
  if (!userId || !query.trim()) return [];

  try {
    const filters: Record<string, any> = { user_id: userId };
    if (runId && !runId.startsWith('chat_') && !runId.startsWith('msg_')) {
      filters.run_id = runId;
    }

    const response = await memory.search(query, {
      topK: Math.max(limit * 2, 10),
      filters,
    });

    const items = Array.isArray(response)
      ? response
      : Array.isArray((response as any)?.results)
        ? (response as any).results
        : [];

    return items
      .filter((r: any) => {
        const meta = r?.metadata || r?.payload || {};
        return !meta.entityType;
      })
      .map((r: any) => {
        const memoryText =
          typeof r?.memory === 'string'
            ? r.memory
            : typeof r?.payload?.data === 'string'
              ? r.payload.data
              : typeof r?.payload?.memory === 'string'
                ? r.payload.memory
                : '';

        return {
          id: String(r?.id || ''),
          memory: memoryText,
          metadata: r?.metadata || r?.payload || {},
        };
      })
      .filter((item: MemoryRecord) => item.memory.trim().length > 0)
      .slice(0, limit);
  } catch (error) {
    console.warn('[Mem0] searchMemories failed/skipped:', (error as any)?.message || error);
    return [];
  }
}

/**
 * Retrieves relevant memories formatted as markdown for system prompt injection.
 */
export async function retrieveMemoryContext(
  query: string,
  options: MemoryQueryOptions
): Promise<string> {
  const memories = await searchMemories(query, options);
  if (memories.length === 0) return '';

  const items = memories.map((m) => `- ${m.memory.trim()}`).join('\n');
  return `\n## Recalled User Profile & Context\n${items}\n`;
}

/**
 * Stores a conversation turn or direct statement in Mem0.
 */
export async function addMemories(
  messages: Array<{ role: string; content: string }> | string,
  options: AddMemoryOptions
): Promise<void> {
  const { userId, runId, metadata = {} } = options;
  if (!userId) return;

  try {
    const payload = typeof messages === 'string'
      ? [{ role: 'user', content: messages.trim() }]
      : messages
        .filter((m) => m.content && typeof m.content === 'string' && m.content.trim())
        .map((m) => ({ role: m.role, content: m.content.trim() }));

    if (payload.length === 0) return;

    await memory.add(payload, {
      userId,
      runId,
      metadata: {
        user_id: userId,
        ...(runId ? { run_id: runId } : {}),
        ...metadata,
      },
    });
  } catch (error) {
    console.warn('[Mem0] addMemories failed/skipped:', (error as any)?.message || error);
  }
}

/**
 * Fetches all memories for a user.
 */
export async function getAllMemories(userId: string): Promise<MemoryRecord[]> {
  if (!userId) return [];

  try {
    const response = await memory.getAll({
      topK: 100,
      filters: { user_id: userId },
    });

    const items = Array.isArray(response)
      ? response
      : Array.isArray((response as any)?.results)
        ? (response as any).results
        : [];

    return items
      .filter((r: any) => {
        const meta = r?.metadata || r?.payload || {};
        return !meta.entityType;
      })
      .map((r: any) => {
        const memoryText =
          typeof r?.memory === 'string'
            ? r.memory
            : typeof r?.payload?.data === 'string'
              ? r.payload.data
              : '';

        return {
          id: String(r?.id || ''),
          memory: memoryText,
          created_at: r?.createdAt || r?.payload?.createdAt,
          updated_at: r?.updatedAt || r?.payload?.updatedAt,
          metadata: r?.metadata || r?.payload || {},
        };
      })
      .filter((item: MemoryRecord) => item.memory.trim().length > 0);
  } catch (error) {
    console.warn('[Mem0] getAllMemories failed/skipped:', (error as any)?.message || error);
    return [];
  }
}

/**
 * Deletes a specific memory record by ID.
 */
export async function deleteMemory(memoryId: string): Promise<void> {
  if (!memoryId) return;

  try {
    await memory.delete(memoryId);
  } catch (error: any) {
    if (error?.message?.includes('not found')) {
      // Memory was already deleted or doesn't exist
      return;
    }
    console.warn('[Mem0] deleteMemory failed:', error?.message || error);
    throw error;
  }
}

/**
 * Deletes all memories belonging to a user.
 */
export async function deleteAllMemories(userId: string): Promise<void> {
  if (!userId) return;

  try {
    await memory.deleteAll({ userId });
  } catch (error: any) {
    // Mem0's deleteAll cascades linked entity store deletions; if a linked record
    // in the batch was already removed by the cascade, "not found" is harmless as records are deleted.
    if (error?.message?.includes('not found')) {
      return;
    }
    console.warn('[Mem0] deleteAllMemories failed:', error?.message || error);
    throw error;
  }
}
