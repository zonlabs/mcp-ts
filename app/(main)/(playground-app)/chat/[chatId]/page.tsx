import { redirect } from 'next/navigation';
import { PlaygroundChat } from '@/components/chat/PlaygroundChat';
import { createClient } from '@/lib/supabase/server';
import { loadChat } from '@/lib/chat-store';

export default async function Page(props: { params: Promise<{ chatId: string }>; searchParams?: Promise<{ draft?: string }> }) {
  const { chatId } = await props.params;
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const supabase = await createClient();
  const { data: chatRow, error: chatError } = await supabase
    .from('chats')
    .select('id')
    .eq('id', chatId)
    .single();

  if (chatError || !chatRow?.id) {
    redirect('/chat');
  }
  const initialMessages = await loadChat(chatId);
  const draft = typeof searchParams?.draft === 'string' ? searchParams.draft : undefined;

  return (
    <PlaygroundChat
      chatId={chatId}
      initialMessages={initialMessages}
      initialDraft={draft}
    />
  );
}
