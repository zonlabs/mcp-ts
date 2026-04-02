import { loadPublicChat } from '@/lib/chat-store';
import { PlaygroundChat } from '@/components/chat/PlaygroundChat';
import { PlaygroundSidebar } from '@/components/chat/PlaygroundSidebar';
import AuthProvider from '@/components/providers/AuthProvider';
import { createClient } from '@/lib/supabase/server';

export default async function Page(props: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: { session } } = await supabase.auth.getSession();
  const messages = await loadPublicChat(chatId);

  const userSession = (user && session) ? session as any : null;

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
    <div className="fixed inset-0 z-50 bg-background">
      <AuthProvider userSession={userSession}>
          <div className="flex h-screen flex-col md:flex-row bg-background text-foreground">
            <PlaygroundSidebar />
            <main className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
              <PlaygroundChat
                chatId={chatId}
                initialMessages={messages}
                isReadOnly={isReadOnly}
              />
            </main>
          </div>
      </AuthProvider>
    </div>
  );
}
