import { UIMessage, createAgentUIStreamResponse } from 'ai';
import { createMcpAgent } from '@/agent/openai-agent';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { messages }: { messages: UIMessage[] } = await req.json();
  
  const { data: { user } } = await supabase.auth.getUser();
  const agent = await createMcpAgent(user?.id);

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
  });
}
