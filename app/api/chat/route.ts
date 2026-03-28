import { convertToModelMessages, createIdGenerator } from 'ai';
import { createMcpAgent, type McpAgentUIMessage } from '@/agent/openai-agent';
import { createClient } from '@/lib/supabase/server';
import type { GatewayServerSelection } from '@/lib/gateway-access';
import { NextResponse } from 'next/server';
import { saveChat } from '@/lib/chat-store';

interface ChatRequestBody {
  messages: McpAgentUIMessage[];
  uiMessages?: McpAgentUIMessage[];
  gatewaySelections?: GatewayServerSelection[];
  chatId?: string;
  llmConfig?: {
    provider?: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };
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
      if (part.type === 'finish-step') {
        return { usage: part.usage };
      }
      return undefined;
    },
    onFinish: async ({ messages: finalMessages }) => {
      if (chatId) {
        await saveChat(chatId, finalMessages);
      }
    },
  });
}
