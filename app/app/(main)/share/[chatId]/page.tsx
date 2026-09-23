import { notFound } from 'next/navigation';
import { loadPublicChat, loadChat } from '@/lib/chat-store';
import { PlaygroundChat } from '@/components/chat/PlaygroundChat';
import { createClient } from '@/lib/supabase/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page(props: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await props.params;

  if (!UUID_REGEX.test(chatId)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Determine if the chat exists and whether current user has access
  const { data: chatData, error } = await supabase
    .from('chats')
    .select('id, user_id, visibility, title')
    .eq('id', chatId)
    .maybeSingle();

  if (error || !chatData) {
    notFound();
  }

  const isOwner = Boolean(user && chatData.user_id === user.id);
  const isPublic = chatData.visibility === 'PUBLIC';

  let collaboratorRole: 'viewer' | 'editor' | null = null;
  if (user?.email && !isOwner) {
    const { data: shareData } = await supabase
      .from('chat_shares')
      .select('role')
      .eq('chat_id', chatId)
      .eq('email', user.email.toLowerCase())
      .maybeSingle();

    if (shareData?.role) {
      collaboratorRole = shareData.role as 'viewer' | 'editor';
    }
  }

  // Access allowed if public, owner, or invited collaborator
  if (!isPublic && !isOwner && !collaboratorRole) {
    notFound();
  }

  const messages = isPublic ? await loadPublicChat(chatId) : await loadChat(chatId);

  // Read-only if viewer, or unauthenticated on a public chat
  const isReadOnly = collaboratorRole === 'viewer' || (!user && isPublic);

  return (
    <PlaygroundChat
      key={chatId}
      chatId={chatId}
      initialTitle={chatData.title}
      chatUserId={chatData.user_id}
      initialMessages={messages}
      isReadOnly={isReadOnly}
    />
  );
}
