// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chat
//
// Clean AI SDK streaming endpoint with trigger-based routing.
// ─────────────────────────────────────────────────────────────────────────────

import { convertToModelMessages, createIdGenerator, generateText } from 'ai';
import { createMcpAgent, type McpAgentUIMessage } from '@/agent/chat-agent';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { saveChat, deleteAllChatMessages } from '@/lib/chat-store';
import { getTitleModel } from '@/lib/llm';
import type { UserPreferences } from '@/lib/user-preferences';
import { normalizeMessagesForModel } from '@/lib/chat-message-normalization';

interface ChatRequestBody {
  id?: string;
  trigger?: 'submit-user-message' | 'regenerate-assistant-message';
  messageId?: string;
  message?: McpAgentUIMessage;
  messages?: McpAgentUIMessage[];
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

async function handleAutoTitle(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  chatId: string | undefined,
  userId: string,
  messages: McpAgentUIMessage[],
  llmConfig?: ChatRequestBody['llmConfig']
): Promise<string | null> {
  if (!chatId) return null;
  const userText = extractUserText(messages);
  if (!userText) return null;

  const { data: chat } = await supabase.from('chats').select('title').eq('id', chatId).maybeSingle();
  if (chat?.title && chat.title !== 'New Chat') return null;

  let title: string | null = null;
  try {
    const result = await generateText({
      model: getTitleModel(llmConfig),
      prompt: `Create a concise chat title (3-6 words). Avoid quotes and punctuation.\nMessage: ${userText}`,
      maxOutputTokens: 24,
    });
    title = result.text?.trim()?.replace(/^["']|["']$/g, '') || null;
  } catch {
    title = userText.length > 50 ? userText.slice(0, 47) + '...' : userText;
  }

  if (title) {
    await supabase.from('chats').upsert({ id: chatId, user_id: userId, title, updated_at: new Date().toISOString() });
  }
  return title;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json()) as ChatRequestBody;
  const { trigger = 'submit-user-message', message, messageId, llmConfig, userPreferences } = body;
  const chatId = body.id;

  // 1. Build messages list based on standard AI SDK trigger
  let chatMessages = Array.isArray(body.messages) ? [...body.messages] : [];
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
  }

  // 3. Auto-title generation for new/untitled chats
  const newChatTitle = await handleAutoTitle(supabase, chatId, user.id, chatMessages, llmConfig);

  // 4. Stream response via MCP Agent
  const { agent, cleanup } = await createMcpAgent({ userId: user.id, userPreferences });
  req.signal.addEventListener('abort', cleanup, { once: true });

  const normalizedMessages = normalizeMessagesForModel(chatMessages);
  const generateId = createIdGenerator({ prefix: 'msg', size: 16 });

  const result = await agent.stream({
    messages: await convertToModelMessages(normalizedMessages),
    abortSignal: req.signal,
    options: { userId: user.id, llmConfig, userPreferences },
  });

  return result.toUIMessageStreamResponse<McpAgentUIMessage>({
    originalMessages: normalizedMessages,
    generateMessageId: () => generateId(),
    messageMetadata: ({ part }) => {
      const base = newChatTitle ? { isNewChat: true, chatTitle: newChatTitle } : undefined;
      return part.type === 'finish-step' ? { ...base, usage: part.usage } : base;
    },
    onFinish: async ({ responseMessage }) => {
      if (!chatId || !responseMessage) return;

      try {
        if (trigger === 'regenerate-assistant-message' && messageId) {
          await supabase.from('chat_messages').delete().eq('chat_id', chatId).eq('external_id', messageId);
        }
        await saveChat(chatId, [responseMessage]);
      } catch (err) {
        console.error('[chat:onFinish] Error saving assistant message:', err);
      }
    },
  });
}
