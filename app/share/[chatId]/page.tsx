import { loadPublicChat } from '@/lib/chat-store';
import { PlaygroundChat } from '@/components/playground/PlaygroundChat';
import { PlaygroundProvider } from '@/components/providers/PlaygroundProvider';
import { PlaygroundSidebar } from '@/components/playground/PlaygroundSidebar';
import AuthProvider from '@/components/providers/AuthProvider';
import { createClient } from '@/lib/supabase/server';

export default async function Page(props: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await props.params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const messages = await loadPublicChat(chatId);

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <AuthProvider userSession={session}>
        <PlaygroundProvider>
          <div className="flex h-screen flex-col md:flex-row bg-background text-foreground">
            <PlaygroundSidebar />
            <main className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
              <PlaygroundChat
                chatId={chatId}
                initialMessages={messages}
              />
            </main>
          </div>
        </PlaygroundProvider>
      </AuthProvider>
    </div>
  );
}
