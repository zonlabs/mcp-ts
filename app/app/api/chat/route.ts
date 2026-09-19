// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chat
//
// Clean AI SDK streaming endpoint with trigger-based routing.
// ─────────────────────────────────────────────────────────────────────────────

import { convertToModelMessages, createIdGenerator, generateText } from 'ai';
import { createChatAgent, type ChatUIMessage } from '@/agent/chat-agent';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { saveChat, deleteAllChatMessages } from '@/lib/chat-store';
import { getTitleModel } from '@/lib/llm';
import type { UserPreferences } from '@/lib/user-preferences';
import { normalizeMessagesForModel, sanitizeModelMessages } from '@/lib/chat-message-normalization';

interface ChatRequestBody {
  id?: string;
  trigger?: 'submit-user-message' | 'regenerate-assistant-message';
  messageId?: string;
  message?: ChatUIMessage;
  messages?: ChatUIMessage[];
  llmConfig?: {
    provider?: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };
  userPreferences?: Partial<UserPreferences>;
}

async function assertChatPermission(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  chatId: string,
  userId: string
): Promise<NextResponse | null> {
  const { data: chat, error } = await supabase
    .from('chats')
    .select('user_id, visibility')
    .eq('id', chatId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 });
  if (chat && chat.user_id !== userId && chat.visibility !== 'PUBLIC') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

function extractUserText(messages: ChatUIMessage[]): string {
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
    const content = (message as any)?.content;
    if (typeof content === 'string' && content.trim()) return content.trim();
    if (Array.isArray(content)) {
      const text = content
        .filter((c: any) => c?.type === 'text' && c.text)
        .map((c: any) => c.text)
        .join(' ')
        .trim();
      if (text) return text;
    }
    const raw = (message as any)?.text;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return '';
}

const TITLE_SYSTEM_PROMPT = `You are a chat title generator. Output ONLY a concise title (3 to 6 words) summarizing the user's message. Do NOT answer the question. Do NOT use quotes or punctuation at the start/end.`;
const NEW_CHAT_TITLE = 'New Chat';

function fallbackTitleFromUserMessage(userText: string): string {
  return userText.length > 50 ? `${userText.slice(0, 47)}...` : userText;
}

async function generateTitleFromUserMessage(
  userText: string,
  llmConfig?: ChatRequestBody['llmConfig']
): Promise<string | null> {
  try {
    const { text } = await generateText({
      system: TITLE_SYSTEM_PROMPT,
      model: getTitleModel(llmConfig),
      prompt: `User message: "${userText}"\n\nTitle:`,
      maxOutputTokens: 64,
    });
    const cleaned = text
      .replace(/^[#*"\s]+/, '')
      .replace(/["]+$/, '')
      .trim();
    return cleaned || null;
  } catch (err) {
    console.error('[generateTitleFromUserMessage] Failed:', err);
    return null;
  }
}

async function claimTitleGeneration(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  chatId: string,
  userId: string,
  userText: string
): Promise<boolean> {
  const fallbackTitle = fallbackTitleFromUserMessage(userText);
  const { data, error } = await supabase
    .from('chats')
    .update({ title: fallbackTitle, updated_at: new Date().toISOString() })
    .eq('id', chatId)
    .eq('user_id', userId)
    .or(`title.is.null,title.eq.${NEW_CHAT_TITLE}`)
    .select('id');

  if (error) {
    console.error('[claimTitleGeneration] Failed:', error);
    return false;
  }

  return (data?.length ?? 0) === 1;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const {
    id: chatId,
    trigger = 'submit-user-message',
    message,
    messageId,
    messages,
    llmConfig,
    userPreferences,
  } = (await req.json()) as ChatRequestBody;

  // 1. Build messages list based on standard AI SDK trigger
  let chatMessages = Array.isArray(messages) ? [...messages] : [];
  if (trigger === 'submit-user-message' && message) {
    chatMessages = [...chatMessages.filter((m) => m.id !== message.id), message];
  } else if (trigger === 'regenerate-assistant-message' && messageId) {
    const idx = chatMessages.findIndex((m) => m.id === messageId);
    if (idx !== -1) chatMessages = chatMessages.slice(0, idx);
  }

  if (chatMessages.length === 0) {
    return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
  }

  // 2. Permission check and pre-stream database sync
  let titlePromise: Promise<string | null> | null = null;

  if (chatId) {
    const denied = await assertChatPermission(supabase, chatId, user.id);
    if (denied) return denied;

    const isEditSync = trigger === 'regenerate-assistant-message' && chatMessages[chatMessages.length - 1]?.role === 'user';
    if (isEditSync) {
      await deleteAllChatMessages(chatId);
      await saveChat(chatId, chatMessages);
    } else if (trigger === 'submit-user-message' && message) {
      await saveChat(chatId, [message]);
    }

    // Auto-title generation kick-off (runs in background without blocking TTFT, matching chatbot)
    const userMessages = chatMessages.filter((m) => m.role === 'user');
    if (userMessages.length === 1 && trigger === 'submit-user-message') {
      const userText = extractUserText(userMessages);
      if (userText && await claimTitleGeneration(supabase, chatId, user.id, userText)) {
        titlePromise = generateTitleFromUserMessage(userText, llmConfig);
      }
    }
  }

  // 3. Stream response via Chat Agent
  const { agent, cleanup } = await createChatAgent({ userId: user.id, userPreferences });
  req.signal.addEventListener('abort', cleanup, { once: true });

  const normalizedMessages = normalizeMessagesForModel(chatMessages);
  const generateId = createIdGenerator({ prefix: 'msg', size: 16 });
  const modelMessages = sanitizeModelMessages(await convertToModelMessages(normalizedMessages));

  const result = await agent.stream({
    messages: modelMessages,
    abortSignal: req.signal,
    options: { userId: user.id, llmConfig, userPreferences },
  });

  let resolvedTitle: string | undefined;
  if (titlePromise) {
    titlePromise.then((t) => {
      if (t) resolvedTitle = t;
    });
  }

  return result.toUIMessageStreamResponse<ChatUIMessage>({
    originalMessages: normalizedMessages,
    generateMessageId: () => generateId(),
    messageMetadata: ({ part }) => {
      const base = resolvedTitle ? { isNewChat: true, chatTitle: resolvedTitle } : {};
      if (part.type === 'finish-step') {
        const responseModel =
          (part as any)?.response?.modelId ||
          (part as any)?.modelId ||
          llmConfig?.model ||
          'openrouter/auto';
        return {
          ...base,
          usage: part.usage,
          model: responseModel,
        };
      }
      return Object.keys(base).length > 0 ? base : undefined;
    },
    onFinish: async ({ responseMessage }) => {
      if (!chatId || !responseMessage) return;

      try {
        if (trigger === 'regenerate-assistant-message' && messageId) {
          await supabase.from('chat_messages').delete().eq('chat_id', chatId).eq('external_id', messageId);
        }

        const resolvedModel =
          (responseMessage as any)?.metadata?.model ||
          llmConfig?.model ||
          'openrouter/auto';
        (responseMessage as any).metadata = {
          ...((responseMessage as any).metadata || {}),
          model: resolvedModel,
        };

        await saveChat(chatId, [responseMessage]);

        if (titlePromise) {
          try {
            const title = await titlePromise;
            if (title) {
              await supabase.from('chats').upsert({ id: chatId, title, user_id: user.id, updated_at: new Date().toISOString() });
            }
          } catch (err) {
            console.error('[chat:onFinish] Error saving title:', err);
          }
        }
      } catch (err) {
        console.error('[chat:onFinish] Error saving assistant message / title:', err);
      }
    },
  });
}
