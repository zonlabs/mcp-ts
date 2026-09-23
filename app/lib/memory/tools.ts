import { tool } from 'ai';
import { z } from 'zod';
import { addMemories, searchMemories, deleteMemory } from './mem0';

/**
 * Creates standard Vercel AI SDK tools for agentic memory management.
 * These tools allow the agent to actively store, search, and forget user facts.
 */
export function createMemoryTools(userId: string, runId?: string) {
  return {
    remember_fact: tool({
      description:
        'Save an important user fact, preference, or instruction to long-term memory so it is remembered in future conversations.',
      inputSchema: z.object({
        thought: z.string().optional().describe('1-sentence explanation of what fact you are saving and why.'),
        fact: z.string().describe('The durable statement, rule, or preference to remember.'),
      }),
      execute: async ({ fact }) => {
        if (!userId) return { success: false, error: 'User ID missing' };
        try {
          await addMemories(fact, {
            userId,
            runId,
          });
          return {
            success: true,
            message: `Successfully remembered: "${fact}"`,
          };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to save memory' };
        }
      },
    }),

    search_memory: tool({
      description:
        'Search the user\'s long-term memory for past facts, preferences, project details, or configurations.',
      inputSchema: z.object({
        thought: z.string().optional().describe('1-sentence explanation of what memories you are looking up.'),
        query: z.string().describe('The search query to find relevant memories.'),
        limit: z.number().optional().default(4).describe('Maximum number of memories to return.'),
      }),
      execute: async ({ query, limit }) => {
        if (!userId) return { memories: [] };
        try {
          const results = await searchMemories(query, {
            userId,
            limit: limit || 5,
          });
          return {
            memories: results.map((r) => ({
              id: r.id,
              fact: r.memory,
            })),
          };
        } catch (err: any) {
          return { error: err?.message || 'Failed to search memory', memories: [] };
        }
      },
    }),

    forget_fact: tool({
      description:
        'Delete or forget a specific user fact from long-term memory using its memory ID.',
      inputSchema: z.object({
        thought: z.string().optional().describe('1-sentence explanation of what memory is being removed.'),
        memoryId: z.string().describe('The ID of the memory to delete.'),
      }),
      execute: async ({ memoryId }) => {
        if (!userId || !memoryId) return { success: false, error: 'Parameters missing' };
        try {
          await deleteMemory(memoryId);
          return {
            success: true,
            message: `Memory with ID "${memoryId}" was forgotten.`,
          };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to delete memory' };
        }
      },
    }),
  };
}
