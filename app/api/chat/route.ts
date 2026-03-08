import { UIMessage, createAgentUIStreamResponse } from 'ai';
import { createMcpAgent } from '@/agent/openai-agent';
import { createClient } from '@/lib/supabase/server';
import type { GatewayServerSelection } from '@/lib/gateway-access';
import { NextResponse } from 'next/server';

interface ChatRequestBody {
  messages: UIMessage[];
  uiMessages?: UIMessage[];
  gatewaySelections?: GatewayServerSelection[];
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
  const { agent, cleanup } = await createMcpAgent(user?.id, {
    gatewaySelections: Array.isArray(body.gatewaySelections) ? body.gatewaySelections : [],
  });
  req.signal.addEventListener('abort', cleanup, { once: true });

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
  });
}
