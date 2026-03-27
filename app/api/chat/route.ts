import { convertToModelMessages } from 'ai';
import { createMcpAgent, type McpAgentUIMessage } from '@/agent/openai-agent';
import { createClient } from '@/lib/supabase/server';
import type { GatewayServerSelection } from '@/lib/gateway-access';
import { NextResponse } from 'next/server';

interface ChatRequestBody {
  messages: McpAgentUIMessage[];
  uiMessages?: McpAgentUIMessage[];
  gatewaySelections?: GatewayServerSelection[];
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

  return result.toUIMessageStreamResponse<McpAgentUIMessage>({
    messageMetadata: ({ part }) => {
      if (part.type === 'finish-step') {
        return { usage: part.usage };
      }
      return undefined;
    },
  });
}
