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
  requestMessages: McpAgentUIMessage[],
  resumeId?: string
): McpAgentUIMessage[] {
  const existingIds = new Set(
    requestMessages
      .map((msg: any) => msg?.id)
      .filter((id): id is string => Boolean(id))
  );
  return (Array.isArray(streamed) ? streamed : []).filter((msg: any) => {
    if (msg?.role === 'user') return false;
    const id = msg?.id;
    if (resumeId && id === resumeId) return true;
    return !id || !existingIds.has(id);
  }).map((msg: any) => {
    const id = msg?.id;
    if (resumeId && id === resumeId) {
      const originalMsg = requestMessages.find((m: any) => m?.id === id);
      if (originalMsg && Array.isArray(originalMsg.parts)) {
        // Merge parts: keep all previous parts, and append/update with new parts from the stream
        const oldParts = originalMsg.parts;
        const newParts = Array.isArray(msg.parts) ? msg.parts : [];
        
        // Simple merge: append new parts that aren't already represented by a toolCallId in oldParts,
        // or replace parts with same toolCallId.
        const mergedParts = [...oldParts];
        for (const newPart of newParts) {
          const newToolCallId = (newPart as any).toolCallId || (newPart as any).toolInvocation?.toolCallId;
          const existingIndex = newToolCallId 
            ? mergedParts.findIndex(p => ((p as any).toolCallId === newToolCallId) || ((p as any).toolInvocation?.toolCallId === newToolCallId))
            : -1;
            
          if (existingIndex >= 0) {
            // Replace old part with new part while preserving any important properties
            mergedParts[existingIndex] = {
              ...mergedParts[existingIndex],
              ...newPart,
            };
          } else {
            // Append new part if it's not a duplicate text/file
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
  const { agent, cleanup } = await createMcpAgent({
    userId: user?.id,
    gatewaySelections: Array.isArray(body.gatewaySelections) ? body.gatewaySelections : undefined
  });
  req.signal.addEventListener('abort', cleanup, { once: true });

  // Next.js AI SDK strips assistant messages if tool invocations aren't exactly 'result'
  // We must normalize custom UI approval states so the LLM retains chat history.
  const normalizedMessages = messages.map(msg => {
    const newMsg = { ...msg };
    if (Array.isArray((newMsg as any).toolInvocations)) {
      (newMsg as any).toolInvocations = (newMsg as any).toolInvocations.map((ti: any) => {
        if (ti.state !== 'result' && ti.state !== 'output-available' && ti.toolName.startsWith('MCPASSISTANT_')) {
          return {
            ...ti,
            state: 'result',
            result: ti.output || { success: true, message: "Action verified by user." }
          };
        }
        return ti;
      });
    }
    // DeepSeek/OpenAI strict validation mapping for the incoming parts array
    if (Array.isArray(newMsg.parts)) {
      newMsg.parts = newMsg.parts.map((p: any) => {
        // Standard shape mapping
        if (p.type === 'tool-invocation' && p.toolInvocation) {
          if (p.toolInvocation.state !== 'result' && p.toolInvocation.toolName === 'MCPASSISTANT_INITIATE_CONNECTION') {
            return {
              ...p,
              toolInvocation: {
                ...p.toolInvocation,
                state: 'result',
                result: { success: true, message: "Connection verified actively by user." }
              }
            };
          }
        }
        // Custom UI shape mapping
        if (typeof p.type === 'string' && p.type.startsWith('tool-') && (p.state === 'approval-responded' || p.state === 'output-available' || p.state === 'ready')) {
          if (p.type.startsWith('tool-MCPASSISTANT_')) {
            return {
              ...p,
              state: 'output-available',
              output: p.output || { success: true, message: "Action verified by user." }
            };
          }
        }
        return p;
      });
    }
    return newMsg;
  });

  const lastMessage = normalizedMessages[normalizedMessages.length - 1];
  const isResuming = lastMessage?.role === 'assistant';
  const initialResumeId = isResuming ? (lastMessage as any)?.id : undefined;
  let resumeId = initialResumeId;

  const generateId = createIdGenerator({
    prefix: 'msg',
    size: 16,
  });

  const result = await agent.stream({
    messages: await convertToModelMessages(normalizedMessages),
    abortSignal: req.signal,
    options: {
      userId: user?.id,
      llmConfig: body.llmConfig,
      gatewaySelections: Array.isArray(body.gatewaySelections) ? body.gatewaySelections : [],
    },
  });

  // result.consumeStream();

  return result.toUIMessageStreamResponse<McpAgentUIMessage>({
    generateMessageId: () => {
      if (resumeId) {
        const id = resumeId;
        resumeId = undefined; // Only reuse once per stream
        return id;
      }
      return generateId();
    },
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
        const assistantMessages = getNewAssistantMessages(finalMessages, normalizedMessages, initialResumeId);

        if (assistantMessages.length > 0) {
          await saveChat(chatId, assistantMessages);
        }
      }
    },
  });
}
