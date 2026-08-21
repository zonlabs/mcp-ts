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

  // If the chat is not public and current user is not the owner, show 404
  if (!isPublic && !isOwner) {
    notFound();
  }

  const messages = isPublic ? await loadPublicChat(chatId) : await loadChat(chatId);

  // It's read-only only if no user is logged in (unauthenticated users cannot participate)
  const isReadOnly = !user;

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
