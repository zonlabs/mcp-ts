import { createClient } from '@/lib/supabase/server';
import type { ChatUIMessage } from '@/agent/chat-agent';

/**
 * Creates a new chat session for the current user.
 * @returns The ID of the newly created chat, or null on failure.
 */
export async function createChat(options?: { projectId?: string; title?: string }): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const insertData: Record<string, any> = {
    user_id: user.id,
    title: options?.title || 'New Chat',
  };
  if (options?.projectId) {
    insertData.project_id = options.projectId;
  }

  const { data, error } = await supabase
    .from('chats')
    .insert(insertData)
    .select('id')
    .single();

  if (error) {
    console.error('[chat-store] createChat failed:', error);
    return null;
  }

  return data.id as string;
}

function mapRowToUIMessage(row: any): ChatUIMessage {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: row.message_id ?? row.id,
    role: row.role,
    parts: Array.isArray(row.parts) ? row.parts : [],
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    createdAt: row.created_at,
    ...(Object.keys(meta).length > 0 ? { metadata: meta } : {}),
  } as ChatUIMessage;
}

/**
 * Loads the complete message history for a specific chat ID.
 * Returns empty array if user is not authorized or chat is private.
 */
export async function loadChat(chatId: string): Promise<ChatUIMessage[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, message_id, role, parts, attachments, created_at, metadata')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[chat-store] loadChat failed:', error);
    }
    return [];
  }

  return Array.isArray(data) ? data.map(mapRowToUIMessage) : [];
}

/**
 * Loads a shared chat that has PUBLIC visibility.
 * Does not require an authenticated user.
 */
export async function loadPublicChat(chatId: string): Promise<ChatUIMessage[]> {
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
    .select('id, message_id, role, parts, attachments, created_at, metadata')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[chat-store] loadPublicChat failed:', error);
    }
    return [];
  }

  return Array.isArray(data) ? data.map(mapRowToUIMessage) : [];
}

/**
 * Deletes ALL messages for a given chatId.
 * Used when a user edits a message, so the entire history can be
 * replaced with the truncated version from the client.
 */
export async function deleteAllChatMessages(chatId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('chat_messages')
    .delete()
    .eq('chat_id', chatId);

  if (error) {
    console.error('[chat-store] deleteAllChatMessages failed:', error);
  }
}

/**
 * Recursively strips null bytes (\u0000) from strings, arrays, and objects.
 */
export function stripNullBytes<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(/\u0000/g, '') as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripNullBytes(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      cleaned[k] = stripNullBytes(v);
    }
    return cleaned as T;
  }
  return value;
}

/**
 * Persists chat messages to the database.
 * Handles both own chats (upsert metadata) and shared chats (update timestamp only).
 */
export async function saveChat(
  chatId: string, 
  incomingMessages: ChatUIMessage[], 
  options?: { projectId?: string }
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const incoming = Array.isArray(incomingMessages) ? incomingMessages : [];
  const now = new Date().toISOString();

  if (user) {
    // Determine chat ownership before updating metadata
    const { data: existingChat } = await supabase
      .from('chats')
      .select('user_id, project_id')
      .eq('id', chatId)
      .maybeSingle();
      
    if (!existingChat || existingChat.user_id === user.id) {
      const upsertData: Record<string, any> = {
        id: chatId,
        user_id: user.id,
        updated_at: now,
      };
      if (options?.projectId) {
        upsertData.project_id = options.projectId;
      } else if (existingChat?.project_id) {
        upsertData.project_id = existingChat.project_id;
      }
      // Create or update full record if we are the owner
      await supabase
        .from('chats')
        .upsert(upsertData, { onConflict: 'id' });
    } else {
      // If shared chat, only refresh the timestamp to keep it active in sidebar
      await supabase
        .from('chats')
        .update({ updated_at: now })
        .eq('id', chatId);
    }
  }

  if (incoming.length === 0) return;

  const rows = incoming.map((message) => {
    const parts = Array.isArray(message.parts)
      ? message.parts
      : typeof (message as any)?.text === 'string'
        ? [{ type: 'text', text: (message as any).text }]
        : [];
        
    const usage = message?.metadata?.usage as any;
    const meta = message?.metadata && typeof message.metadata === 'object'
      ? { ...message.metadata }
      : {};

    if (usage) {
      meta.usage = usage;
    }

    const messageId = (message as any)?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
    
    return {
      message_id: messageId,
      chat_id: chatId,
      role: message.role,
      parts,
      attachments: Array.isArray((message as any)?.attachments) ? (message as any).attachments : [],
      created_at: (message as any)?.createdAt || now,
      metadata: meta,
    };
  });

  const hasAnyMessage = rows.some((row) => row.message_id || row.role || row.created_at);
  if (!hasAnyMessage) return;

  const sanitizedRows = stripNullBytes(rows);
  const { error: upsertError } = await supabase
    .from('chat_messages')
    .upsert(sanitizedRows, { onConflict: 'chat_id,message_id' });

  if (upsertError) {
    console.error('[chat-store] failed to upsert messages:', upsertError);
  }
}
