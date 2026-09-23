import { generateText } from 'ai';
import { getTitleModel, type LlmConfig } from '@/lib/llm';

export type CompactableMessage = {
  id?: string;
  role?: string;
  parts?: any[];
  content?: any;
  [key: string]: any;
};

const COMPACTION_THRESHOLD_MESSAGES = 14;
const PRESERVE_RECENT_MESSAGES = 6;

function toSummaryTranscript(messages: CompactableMessage[]): string {
  return messages
    .map((m) => {
      const role = (m.role || 'user').toUpperCase();
      let text = '';

      if (Array.isArray(m.parts)) {
        text = m.parts
          .map((p: any) => {
            if (p.type === 'text' && p.text) return p.text;
            if (p.type === 'tool-invocation') return `[Tool: ${p.toolInvocation?.toolName}]`;
            if (typeof p.type === 'string' && p.type.startsWith('tool-')) {
              return `[Tool: ${p.type.replace(/^tool-/, '')}]`;
            }
            return '';
          })
          .filter(Boolean)
          .join(' ');
      } else if (typeof (m as any).content === 'string') {
        text = (m as any).content;
      }

      // Truncate individual message text to avoid blowing up the summary prompt itself
      return `${role}: ${text.slice(0, 400).trim()}`;
    })
    .filter((line) => line.length > 5)
    .join('\n');
}

/**
 * Performs sliding-window auto-compaction on conversation history.
 *
 * If the message history exceeds `COMPACTION_THRESHOLD_MESSAGES` (14 turns):
 * 1. Takes older messages (indices 0 to N-6).
 * 2. Uses a fast lightweight model to summarize key decisions, context, and tool actions.
 * 3. Replaces the older messages with a single synthetic summary message.
 * 4. Preserves the most recent 6 messages verbatim for short-term continuity.
 */
export async function autoCompactChatHistory<T extends CompactableMessage = any>(
  messages: T[],
  llmConfig?: LlmConfig
): Promise<T[]> {
  if (!Array.isArray(messages) || messages.length <= COMPACTION_THRESHOLD_MESSAGES) {
    return messages;
  }

  const splitIndex = messages.length - PRESERVE_RECENT_MESSAGES;
  const olderMessages = messages.slice(0, splitIndex);
  const recentMessages = messages.slice(splitIndex);

  const formattedHistory = toSummaryTranscript(olderMessages);
  if (!formattedHistory) {
    return messages;
  }

  try {
    const { text: summary } = await generateText({
      model: getTitleModel(llmConfig),
      system:
        'You are a conversation summarizer. Summarize the user goals, decisions, configurations, and progress from these earlier messages into 3 to 5 concise bullet points. Be direct, factual, and compact.',
      prompt: `Conversation turns to summarize:\n${formattedHistory}\n\nConcise Summary:`,
      maxOutputTokens: 300,
    });

    const cleanedSummary = summary.trim();
    if (!cleanedSummary) {
      return messages;
    }

    const summaryMessage: T = {
      id: `summary-${Date.now()}`,
      role: 'user',
      parts: [
        {
          type: 'text',
          text: `[Previous Conversation Context Summary]:\n${cleanedSummary}`,
        },
      ],
    } as any;

    return [summaryMessage, ...recentMessages];
  } catch (error) {
    console.warn('[AutoCompaction] Summarization failed, falling back to full history:', error);
    return messages;
  }
}
