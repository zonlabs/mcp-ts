import { convertToModelMessages, createIdGenerator, generateText } from 'ai';
import { createMcpAgent, type McpAgentUIMessage } from '@/agent/openai-agent';
import { createClient } from '@/lib/supabase/server';
import type { GatewayServerSelection } from '@/lib/gateway-access';
import { NextResponse } from 'next/server';
import { saveChat } from '@/lib/chat-store';
import { getModelFromConfig } from '@/lib/llm';

interface ChatRequestBody {
  messages: McpAgentUIMessage[];
  uiMessages?: McpAgentUIMessage[];
  gatewaySelections?: GatewayServerSelection[];
  chatId?: string;
  action?: string;
  llmConfig?: {
    provider?: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };
}

function getLastUserMessage(messages: McpAgentUIMessage[]): McpAgentUIMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') return messages[i];
  }
  return null;
}

function getNewAssistantMessages(
  streamed: McpAgentUIMessage[],
  requestMessages: McpAgentUIMessage[]
): McpAgentUIMessage[] {
  const existingIds = new Set(
    requestMessages
      .map((msg: any) => msg?.id)
      .filter((id): id is string => Boolean(id))
  );
  return (Array.isArray(streamed) ? streamed : []).filter((msg: any) => {
    if (msg?.role === 'user') return false;
    const id = msg?.id;
    return !id || !existingIds.has(id);
  });
}

function getLastAssistantMessage(messages: McpAgentUIMessage[]): McpAgentUIMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'assistant') return messages[i];
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

export async function POST(req: Request) {
  const supabase = await createClient();
  const body = (await req.json()) as Partial<ChatRequestBody>;
  const messages = Array.isArray(body.messages)
    ? body.messages
    : Array.isArray(body.uiMessages)
      ? body.uiMessages
      : [];
  const chatId = typeof body.chatId === 'string' ? body.chatId : undefined;
  if (messages.length === 0) {
    return NextResponse.json(
      { error: 'messages parameter must be provided' },
      { status: 400 }
    );
  }
  
  const { data: { user } } = await supabase.auth.getUser();
  const shouldRegenerate = body.action === 'regenerate-message';
  const regenTarget = shouldRegenerate ? getLastAssistantMessage(messages)?.id : null;
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

  if (chatId) {
    const lastUserMessage = getLastUserMessage(messages);
    if (lastUserMessage) {
      await saveChat(chatId, [lastUserMessage]);
    }
  }
  const { agent, cleanup } = await createMcpAgent();
  req.signal.addEventListener('abort', cleanup, { once: true });

  const result = await agent.stream({
    messages: await convertToModelMessages(messages),
    abortSignal: req.signal,
    options: {
      userId: user?.id,
      llmConfig: body.llmConfig,
      gatewaySelections: Array.isArray(body.gatewaySelections) ? body.gatewaySelections : [],
    },
  });

  result.consumeStream();

  return result.toUIMessageStreamResponse<McpAgentUIMessage>({
    generateMessageId: createIdGenerator({
      prefix: 'msg',
      size: 16,
    }),
    messageMetadata: ({ part }) => {
      const base = isNewChat && newChatTitle
        ? { isNewChat: true, chatTitle: newChatTitle }
        : undefined;
      if (part.type === 'finish-step') {
        return base ? { ...base, usage: part.usage } : { usage: part.usage };
      }
      return base;
    },
    onFinish: async ({ messages: finalMessages }) => {
      if (chatId) {
        if (shouldRegenerate) {
          const { data: latestAssistant, error: latestError } = await supabase
            .from('chat_messages')
            .select('external_id')
            .eq('chat_id', chatId)
            .eq('role', 'assistant')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestError) {
            console.error('[chat] failed to load assistant message for regenerate:', latestError);
          } else if (latestAssistant?.external_id) {
            const { error: deleteError } = await supabase
              .from('chat_messages')
              .delete()
              .eq('chat_id', chatId)
              .eq('external_id', latestAssistant.external_id);
            if (deleteError) {
              console.error('[chat] failed to delete regenerated assistant message:', deleteError);
            }
          }
        }
        const assistantMessages = getNewAssistantMessages(finalMessages, messages);
        if (assistantMessages.length > 0) {
          await saveChat(chatId, assistantMessages);
        }
      }
      if (!chatId || !user?.id) return;
      const userText = extractUserText(messages);
      if (!userText) return;

      const { data: chatRow, error: chatError } = await supabase
        .from('chats')
        .select('title')
        .eq('id', chatId)
        .eq('user_id', user.id)
        .single();
      if (chatError || (chatRow?.title && chatRow.title !== 'New Chat')) return;

      const title = await generateChatTitle({ prompt: userText, llmConfig: body.llmConfig });
      if (!title) return;
      await supabase
        .from('chats')
        .update({ title })
        .eq('id', chatId)
        .eq('user_id', user.id);
    },
  });
}
