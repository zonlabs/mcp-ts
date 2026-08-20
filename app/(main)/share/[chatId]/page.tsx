import { loadPublicChat } from '@/lib/chat-store';
import { PlaygroundChat } from '@/components/chat/PlaygroundChat';
import { createClient } from '@/lib/supabase/server';

export default async function Page(props: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const messages = await loadPublicChat(chatId);

  // Determine if the current user owns this chat
  const { data: chatData } = await supabase
    .from('chats')
    .select('user_id, visibility')
    .eq('id', chatId)
    .single();

  // It's read-only if no user is logged in (unauthenticated users cannot collaborate)
  // or if for some reason the chat is PRIVATE and they are not the owner.
  const isReadOnly = !user || (chatData?.visibility !== 'PUBLIC' && chatData?.user_id !== user.id);

  return (
    <PlaygroundChat
      chatId={chatId}
      initialMessages={messages}
      isReadOnly={isReadOnly}
    />
  );
}
