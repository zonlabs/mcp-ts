import { createClient } from '@/lib/supabase/server';
import type { McpAgentUIMessage } from '@/agent/openai-agent';

export async function createChat(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('chats')
    .insert({ user_id: user.id, title: 'New Chat' })
    .select('id')
    .single();

  if (error) {
    console.error('[chat-store] createChat failed:', error);
    return null;
  }

  return data.id as string;
}

export async function loadChat(chatId: string): Promise<McpAgentUIMessage[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, parts, attachments, created_at, prompt_tokens, completion_tokens, total_tokens')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[chat-store] loadChat failed:', error);
    }
    return [];
  }

  if (!Array.isArray(data)) return [];
  return data.map((row) => {
    const hasUsage = row.prompt_tokens != null || row.completion_tokens != null || row.total_tokens != null;
    const usage = hasUsage
      ? {
          inputTokens: row.prompt_tokens ?? undefined,
          outputTokens: row.completion_tokens ?? undefined,
          totalTokens: row.total_tokens ?? undefined,
        }
      : undefined;
    return {
      id: row.id,
      role: row.role,
      parts: Array.isArray(row.parts) ? row.parts : [],
      attachments: Array.isArray(row.attachments) ? row.attachments : [],
      createdAt: row.created_at,
      ...(usage ? { metadata: { usage } } : {}),
    } as McpAgentUIMessage;
  });
}

export async function loadPublicChat(chatId: string): Promise<McpAgentUIMessage[]> {
  const supabase = await createClient();

  const { data: chatRow, error: chatError } = await supabase
    .from('chats')
    .select('id, visibility')
    .eq('id', chatId)
    .in('visibility', ['PUBLIC'])
    .single();

  if (chatError || !chatRow?.id) {
    if (chatError && chatError.code !== 'PGRST116') {
      console.error('[chat-store] loadPublicChat failed:', chatError);
    }
    return [];
  }

  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, parts, attachments, created_at, prompt_tokens, completion_tokens, total_tokens')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[chat-store] loadPublicChat failed:', error);
    }
    return [];
  }

  if (!Array.isArray(data)) return [];
  return data.map((row) => {
    const hasUsage = row.prompt_tokens != null || row.completion_tokens != null || row.total_tokens != null;
    const usage = hasUsage
      ? {
          inputTokens: row.prompt_tokens ?? undefined,
          outputTokens: row.completion_tokens ?? undefined,
          totalTokens: row.total_tokens ?? undefined,
        }
      : undefined;
    return {
      id: row.id,
      role: row.role,
      parts: Array.isArray(row.parts) ? row.parts : [],
      attachments: Array.isArray(row.attachments) ? row.attachments : [],
      createdAt: row.created_at,
      ...(usage ? { metadata: { usage } } : {}),
    } as McpAgentUIMessage;
  });
}

export async function saveChat(chatId: string, incomingMessages: McpAgentUIMessage[]): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: existingRows, error: existingError } = await supabase
    .from('chat_messages')
    .select('id, role, parts, attachments, created_at, prompt_tokens, completion_tokens, total_tokens')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  if (existingError) {
    console.error('[chat-store] saveChat failed to load existing messages:', existingError);
  }

  const existingMessages = Array.isArray(existingRows)
    ? existingRows.map((row) => {
        const hasUsage = row.prompt_tokens != null || row.completion_tokens != null || row.total_tokens != null;
        const usage = hasUsage
          ? {
              inputTokens: row.prompt_tokens ?? undefined,
              outputTokens: row.completion_tokens ?? undefined,
              totalTokens: row.total_tokens ?? undefined,
            }
          : undefined;
        return {
          id: row.id,
          role: row.role,
          parts: Array.isArray(row.parts) ? row.parts : [],
          attachments: Array.isArray(row.attachments) ? row.attachments : [],
          createdAt: row.created_at,
          ...(usage ? { metadata: { usage } } : {}),
        } as McpAgentUIMessage;
      })
    : [];

  const incoming = Array.isArray(incomingMessages) ? incomingMessages : [];
  const seen = new Set<string>();
  const messages: McpAgentUIMessage[] = [];

  for (const msg of existingMessages) {
    if (msg?.id && !seen.has(msg.id)) {
      seen.add(msg.id);
    }
    messages.push(msg);
  }

  for (const msg of incoming) {
    if (msg?.id) {
      if (seen.has(msg.id)) continue;
      seen.add(msg.id);
    }
    messages.push(msg);
  }

  const now = new Date().toISOString();
  const { error: upsertError } = await supabase
    .from('chats')
    .upsert({
      id: chatId,
      user_id: user.id,
      updated_at: now,
    }, { onConflict: 'id' });

  if (upsertError) {
    console.error('[chat-store] saveChat failed to upsert chat:', upsertError);
    return;
  }

  const { error: deleteError } = await supabase
    .from('chat_messages')
    .delete()
    .eq('chat_id', chatId);

  if (deleteError) {
    console.error('[chat-store] saveChat failed to clear messages:', deleteError);
    return;
  }

  if (messages.length === 0) return;

  const rows = messages.map((message) => {
    const parts = Array.isArray(message.parts)
      ? message.parts
      : typeof (message as any)?.text === 'string'
        ? [{ type: 'text', text: (message as any).text }]
        : [];
    const usage = message?.metadata?.usage as any;
    const inputTokens = usage?.inputTokens ?? usage?.promptTokens ?? null;
    const outputTokens = usage?.outputTokens ?? usage?.completionTokens ?? null;
    const totalTokens = usage?.totalTokens ?? null;
    return {
      chat_id: chatId,
      role: message.role,
      parts,
      attachments: Array.isArray((message as any)?.attachments) ? (message as any).attachments : [],
      created_at: (message as any)?.createdAt || now,
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: totalTokens,
    };
  });

  const { error: insertError } = await supabase
    .from('chat_messages')
    .insert(rows);

  if (insertError) {
    console.error('[chat-store] saveChat failed to insert messages:', insertError);
  }
}
