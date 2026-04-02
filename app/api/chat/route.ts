// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chat
//
// This is the core AI streaming endpoint. It handles:
//   • Chat message streaming via the AI SDK
//   • Chat persistence (save user messages before stream, save assistant after)
//   • Auto-generating chat titles for new conversations
//   • History normalization (mapping custom MCP states to SDK-compatible ones)
//   • Edit-message: replacing DB history with truncated client history
//   • Regenerate-message: deleting the last assistant reply and regenerating
// ─────────────────────────────────────────────────────────────────────────────

import { convertToModelMessages, createIdGenerator, generateText } from 'ai';
import { createMcpAgent, type McpAgentUIMessage } from '@/agent/openai-agent';
import { createClient } from '@/lib/supabase/server';
import type { GatewayServerSelection } from '@/lib/gateway-access';
import { NextResponse } from 'next/server';
import { saveChat, deleteAllChatMessages } from '@/lib/chat-store';
import { getModelFromConfig } from '@/lib/llm';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ChatRequestBody {
  /** The full UI message history from the client */
  messages: McpAgentUIMessage[];
  /** Legacy alias for `messages` */
  uiMessages?: McpAgentUIMessage[];
  /** MCP gateway server selections the user has configured */
  gatewaySelections?: GatewayServerSelection[];
  /** The chat record ID in the database */
  chatId?: string;
  /**
   * Optional action flag:
   *   - "regenerate-message" → delete last assistant reply and re-generate
   *   - "edit-message"       → replace all DB records with truncated client history
   */
  action?: string;
  /** LLM provider/model configuration (overrides user defaults) */
  llmConfig?: {
    provider?: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };
  /** Compaction state for conversation summarization */
  conversationSummary?: string | null;
  compactedUpToIndex?: number;
  /** Total session tokens for auto-compaction trigger */
  totalSessionTokens?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the last user message in the array, or null if none exists. */
function getLastUserMessage(messages: McpAgentUIMessage[]): McpAgentUIMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') return messages[i];
  }
  return null;
}

/**
 * Verifies that the requesting user is allowed to read/write `chatId`.
 *
 * Rules:
 *  • If the chat doesn't exist yet → only authenticated users may create it.
 *  • If the chat exists and is PRIVATE → only its owner may modify it.
 *  • If the chat exists and is PUBLIC → any authenticated user may participate.
 *  • Unauthenticated users may never write to any chat.
 *
 * @returns A `NextResponse` error response when access is denied, or `null` when permitted.
 */
async function assertChatPermission(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  chatId: string,
  userId: string | undefined
): Promise<NextResponse | null> {
  const { data: chat, error } = await supabase
    .from('chats')
    .select('user_id, visibility')
    .eq('id', chatId)
    .maybeSingle();

  if (error) {
    console.error('[chat] Failed to fetch chat ownership:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  if (!chat) {
    // Chat doesn't exist yet – only authenticated users may create it
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in to create chats.' },
        { status: 401 }
      );
    }
    return null; // allowed – will be created on first save
  }

  // Chat exists – unauthenticated users can never participate
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized: You must be logged in to participate in chats.' },
      { status: 401 }
    );
  }

  // Authenticated but not the owner of a private chat
  if (chat.user_id !== userId && chat.visibility !== 'PUBLIC') {
    return NextResponse.json(
      { error: 'Forbidden: You do not have permission to modify this private chat.' },
      { status: 403 }
    );
  }

  return null; // allowed
}

/**
 * Extracts the first meaningful text string from a list of user messages.
 * Used for auto-generating a chat title.
 */
function extractUserText(messages: McpAgentUIMessage[]): string {
  for (const message of messages) {
    if (message?.role !== 'user') continue;
    if (Array.isArray((message as any)?.parts)) {
      const text = (message as any).parts
        .filter((p: any) => p?.type === 'text' && p.text)
        .map((p: any) => p.text)
        .join(' ')
        .trim();
      if (text) return text;
    }
    const raw = (message as any)?.text;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return '';
}

/**
 * After a stream finishes, identifies only the *new* assistant messages that
 * weren't already in the original request. Also handles the special "resume"
 * case where we merge new streamed parts into an existing message to avoid data loss.
 *
 * @param streamed        - The full message list returned by the AI SDK after streaming.
 * @param requestMessages - The messages that were sent *in* the request (before streaming).
 * @param resumeId        - If resuming a partially-streamed message, its ID.
 */
function getNewAssistantMessages(
  streamed: McpAgentUIMessage[],
  requestMessages: McpAgentUIMessage[],
  resumeId?: string
): McpAgentUIMessage[] {
  const existingIds = new Set(
    requestMessages
      .map((msg: any) => msg?.id)
      .filter((id): id is string => Boolean(id))
  );

  return (Array.isArray(streamed) ? streamed : [])
    .filter((msg: any) => {
      if (msg?.role === 'user') return false;        // never persist user messages here
      const id = msg?.id;
      if (resumeId && id === resumeId) return true;  // always include the resumed message
      return !id || !existingIds.has(id);            // include only new messages
    })
    .map((msg: any) => {
      const id = msg?.id;
      // For a resumed message, merge new parts into the existing ones to avoid data loss
      if (resumeId && id === resumeId) {
        const originalMsg = requestMessages.find((m: any) => m?.id === id);
        if (originalMsg && Array.isArray(originalMsg.parts)) {
          const oldParts = originalMsg.parts;
          const newParts = Array.isArray(msg.parts) ? msg.parts : [];
          const mergedParts = [...oldParts];

          for (const newPart of newParts) {
            const newToolCallId =
              (newPart as any).toolCallId || (newPart as any).toolInvocation?.toolCallId;
            const existingIndex = newToolCallId
              ? mergedParts.findIndex(
                  p =>
                    (p as any).toolCallId === newToolCallId ||
                    (p as any).toolInvocation?.toolCallId === newToolCallId
                )
              : -1;

            if (existingIndex >= 0) {
              // Replace – keep old properties but apply new ones on top
              mergedParts[existingIndex] = { ...mergedParts[existingIndex], ...newPart };
            } else {
              // Append – but skip exact-duplicate text parts
              if (newPart.type === 'text' && mergedParts.some(p => p.type === 'text' && p.text === newPart.text)) continue;
              mergedParts.push(newPart);
            }
          }
          return { ...msg, parts: mergedParts };
        }
      }
      return msg;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Title Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a short, descriptive chat title (3-6 words) using the LLM.
 * Called once per new or untitled chat on the first message.
 */
async function generateChatTitle(input: {
  prompt: string;
  llmConfig?: {
    provider?: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };
}): Promise<string | null> {
  const model = getModelFromConfig(input.llmConfig);
  try {
    const result = await generateText({
      model,
      prompt: `Create a concise chat title (3-6 words). Avoid quotes and punctuation.\nMessage: ${input.prompt}`,
      maxOutputTokens: 16,
    });
    const raw = result.text?.trim() || '';
    if (!raw) return null;
    return raw.replace(/^["']|["']$/g, '').trim();
  } catch (error) {
    console.error('[chat] title generation failed:', error);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const supabase = await createClient();
  const body = (await req.json()) as Partial<ChatRequestBody>;

  // Support both `messages` and legacy `uiMessages` field names
  const messages = Array.isArray(body.messages)
    ? body.messages
    : Array.isArray(body.uiMessages)
      ? body.uiMessages
      : [];

  const chatId = typeof body.chatId === 'string' ? body.chatId : undefined;

  if (messages.length === 0) {
    return NextResponse.json({ error: 'messages parameter must be provided' }, { status: 400 });
  }

  // ── Authentication & Authorization ──────────────────────────────────────────
  // We use getSession() here (not getUser()) because this runs inside a
  // long-lived streaming context where an extra auth round-trip would add latency.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;

  if (chatId) {
    const denied = await assertChatPermission(supabase, chatId, user?.id);
    if (denied) return denied;
  }

  // ── Action Flags ────────────────────────────────────────────────────────────
  const shouldRegenerate  = body.action === 'regenerate-message';
  const shouldEditReplace = body.action === 'edit-message';

  // ── Edit-Message: Sync DB to Client State ───────────────────────────────────
  // When the user edits a previous message, the client sends the truncated history.
  // We wipe the existing DB records and re-insert just what the client sent,
  // making the DB the authoritative source of truth once again.
  if (shouldEditReplace && chatId) {
    await deleteAllChatMessages(chatId);
    await saveChat(chatId, messages);
  }

  // ── Auto-Title Generation ───────────────────────────────────────────────────
  // If this chat is new or still has the default "New Chat" title,
  // generate a meaningful title from the user's first meaningful message.
  let newChatTitle: string | null = null;
  let isNewChat = false;

  if (chatId && user?.id) {
    const { data: chatRow, error: chatError } = await supabase
      .from('chats')
      .select('title')
      .eq('id', chatId)
      .eq('user_id', user.id)
      .single();

    if (!chatError && (!chatRow?.title || chatRow.title === 'New Chat')) {
      const userText = extractUserText(messages);
      if (userText) {
        newChatTitle = await generateChatTitle({ prompt: userText, llmConfig: body.llmConfig });
        if (newChatTitle) {
          isNewChat = true;
          await supabase
            .from('chats')
            .update({ title: newChatTitle })
            .eq('id', chatId)
            .eq('user_id', user.id);
        }
      }
    }
  }

  // ── Pre-Stream Persistence ──────────────────────────────────────────────────
  // Persist the latest user message before the stream begins so it appears in
  // the sidebar even if the stream fails mid-way.
  // Skip for edit-message as we already re-saved the entire history above.
  if (chatId && !shouldEditReplace) {
    const lastUserMessage = getLastUserMessage(messages);
    if (lastUserMessage) {
      await saveChat(chatId, [lastUserMessage]);
    }
  }

  // ── MCP Agent Setup ─────────────────────────────────────────────────────────
  const { agent, cleanup } = await createMcpAgent({
    userId: user?.id,
    gatewaySelections: Array.isArray(body.gatewaySelections) ? body.gatewaySelections : undefined,
    conversationSummary: body.conversationSummary,
    compactedUpToIndex: body.compactedUpToIndex,
    totalSessionTokens: body.totalSessionTokens,
  });
  // Ensure tool connections are properly cleaned up if the client disconnects
  req.signal.addEventListener('abort', cleanup, { once: true });

  // ── History Normalization ───────────────────────────────────────────────────
  // The AI SDK expects all tool states to be in a "completed" form.
  // We map our custom MCP approval states (approval-responded, output-available)
  // to the SDK-compatible "result" state before sending the history to the model.
  const normalizedMessages = messages.map(msg => {
    const newMsg = { ...msg };

    // 1. Handle legacy toolInvocations array format
    if (Array.isArray((newMsg as any).toolInvocations)) {
      (newMsg as any).toolInvocations = (newMsg as any).toolInvocations.map((ti: any) => {
        if (
          ti.state !== 'result' &&
          ti.state !== 'output-available' &&
          ti.toolName.startsWith('MCPASSISTANT_')
        ) {
          return {
            ...ti,
            state: 'result',
            result: ti.output || { success: true, message: 'Action verified by user.' },
          };
        }
        return ti;
      });
    }

    // 2. Handle parts-based format (newer AI SDK)
    if (Array.isArray(newMsg.parts)) {
      newMsg.parts = newMsg.parts.map((p: any) => {
        // Map INITIATE_CONNECTION tool-invocation parts to a completed state
        if (
          p.type === 'tool-invocation' &&
          p.toolInvocation &&
          p.toolInvocation.state !== 'result' &&
          p.toolInvocation.toolName === 'MCPASSISTANT_INITIATE_CONNECTION'
        ) {
          return {
            ...p,
            toolInvocation: {
              ...p.toolInvocation,
              state: 'result',
              result: { success: true, message: 'Connection verified actively by user.' },
            },
          };
        }

        // Map custom MCPASSISTANT approval-flow parts to output-available
        if (
          typeof p.type === 'string' &&
          p.type.startsWith('tool-MCPASSISTANT_') &&
          (p.state === 'approval-responded' || p.state === 'output-available' || p.state === 'ready')
        ) {
          return {
            ...p,
            state: 'output-available',
            output: p.output || { success: true, message: 'Action verified by user.' },
          };
        }

        return p;
      });

      // Deduplicate tool parts with the same toolCallId (keep first occurrence)
      const seenToolCallIds = new Set<string>();
      newMsg.parts = newMsg.parts.filter((p: any) => {
        const toolCallId = p.toolCallId || p.toolInvocation?.toolCallId;
        if (!toolCallId) return true;
        if (seenToolCallIds.has(toolCallId)) return false;
        seenToolCallIds.add(toolCallId);
        return true;
      });
    }

    return newMsg;
  });

  // ── Stream Setup ────────────────────────────────────────────────────────────
  // If the last message is an assistant message (partial/interrupted stream),
  // reuse its ID so the SDK resumes it rather than starting a brand-new message.
  const lastMessage = normalizedMessages[normalizedMessages.length - 1];
  const initialResumeId = lastMessage?.role === 'assistant' ? (lastMessage as any)?.id : undefined;
  let resumeId = initialResumeId;

  const generateId = createIdGenerator({ prefix: 'msg', size: 16 });

  const result = await agent.stream({
    messages: await convertToModelMessages(normalizedMessages),
    abortSignal: req.signal,
    options: {
      userId: user?.id,
      llmConfig: body.llmConfig,
      gatewaySelections: Array.isArray(body.gatewaySelections) ? body.gatewaySelections : [],
    },
  });

  // ── Response Stream ─────────────────────────────────────────────────────────
  return result.toUIMessageStreamResponse<McpAgentUIMessage>({
    // Reuse the existing ID for resumed streams; generate a fresh one otherwise
    generateMessageId: () => {
      if (resumeId) {
        const id = resumeId;
        resumeId = undefined;
        return id;
      }
      return generateId();
    },

    // Attach metadata (new title, token usage) to the relevant stream events
    messageMetadata: ({ part }) => {
      const base = isNewChat && newChatTitle ? { isNewChat: true, chatTitle: newChatTitle } : undefined;
      if (part.type === 'finish-step') {
        return base ? { ...base, usage: part.usage } : { usage: part.usage };
      }
      return base;
    },

    // ── onFinish: Post-Stream Persistence ──────────────────────────────────────
    onFinish: async ({ messages: finalMessages }) => {
      if (!chatId) return;

      // For regenerate-message: delete the stale last assistant reply first,
      // then save the freshly generated one in its place.
      if (shouldRegenerate) {
        const { data: latestAssistant } = await supabase
          .from('chat_messages')
          .select('external_id')
          .eq('chat_id', chatId)
          .eq('role', 'assistant')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestAssistant?.external_id) {
          await supabase
            .from('chat_messages')
            .delete()
            .eq('chat_id', chatId)
            .eq('external_id', latestAssistant.external_id);
        }
      }

      // Persist only the newly generated assistant messages.
      // This avoids duplicating messages that were already saved pre-stream.
      const assistantMessages = getNewAssistantMessages(finalMessages, normalizedMessages, initialResumeId);
      if (assistantMessages.length > 0) {
        await saveChat(chatId, assistantMessages);
      }
    },
  });
}
