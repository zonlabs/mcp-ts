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
    .select('id, external_id, role, parts, attachments, created_at, prompt_tokens, completion_tokens, total_tokens')
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
      id: row.external_id ?? row.id,
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
    .select('id, external_id, role, parts, attachments, created_at, prompt_tokens, completion_tokens, total_tokens')
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
      id: row.external_id ?? row.id,
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
  const incoming = Array.isArray(incomingMessages) ? incomingMessages : [];
  const now = new Date().toISOString();
  if (user) {
    const { data: existingChat } = await supabase
      .from('chats')
      .select('user_id')
      .eq('id', chatId)
      .maybeSingle();
      
    if (!existingChat || existingChat.user_id === user.id) {
      // Create or update full record if owner
      await supabase
        .from('chats')
        .upsert({ id: chatId, user_id: user.id, updated_at: now }, { onConflict: 'id' });
    } else {
      // Shared chat: only update the timestamp
      await supabase
        .from('chats')
        .update({ updated_at: now })
        .eq('id', chatId);
    }
  }

  if (incoming.length === 0) return;

  const rows = incoming.map((message, index) => {
    const parts = Array.isArray(message.parts)
      ? message.parts
      : typeof (message as any)?.text === 'string'
        ? [{ type: 'text', text: (message as any).text }]
        : [];
    const usage = message?.metadata?.usage as any;
    const inputTokens = usage?.inputTokens ?? usage?.promptTokens ?? null;
    const outputTokens = usage?.outputTokens ?? usage?.completionTokens ?? null;
    const totalTokens = usage?.totalTokens ?? null;
    const externalId = (message as any)?.id;
    const createdAt = (message as any)?.createdAt || now;
    return {
      ...(externalId ? { external_id: externalId } : {}),
      chat_id: chatId,
      role: message.role,
      parts,
      attachments: Array.isArray((message as any)?.attachments) ? (message as any).attachments : [],
      created_at: createdAt,
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: totalTokens,
    };
  });

  const hasAnyMessage = rows.some((row) => row.external_id || row.role || row.created_at);
  if (!hasAnyMessage) return;
  const rowsWithExternalId = rows.filter((row) => row.external_id);
  const rowsWithoutExternalId = rows.filter((row) => !row.external_id);

  if (rowsWithExternalId.length > 0) {
    const { error: upsertError } = await supabase
      .from('chat_messages')
      .upsert(rowsWithExternalId, { onConflict: 'chat_id,external_id' });
    
    if (upsertError) {
      console.error('[chat-store] saveChat failed to upsert messages:', upsertError);
    }
  }

  if (rowsWithoutExternalId.length === 0) return;

  const { error: insertError } = await supabase
    .from('chat_messages')
    .insert(rowsWithoutExternalId);

  if (insertError) {
    console.error('[chat-store] saveChat failed to insert messages:', insertError);
  }
}
