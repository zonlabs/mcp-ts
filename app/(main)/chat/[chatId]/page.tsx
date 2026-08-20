import { redirect } from 'next/navigation';
import { PlaygroundChat } from '@/components/chat/PlaygroundChat';
import { createClient } from '@/lib/supabase/server';
import { loadChat } from '@/lib/chat-store';

export default async function Page(props: { params: Promise<{ chatId: string }>; searchParams?: Promise<{ draft?: string }> }) {
  const { chatId } = await props.params;
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const supabase = await createClient();
  const { data: chatRow } = await supabase
    .from('chats')
    .select('id')
    .eq('id', chatId)
    .maybeSingle();

  const initialMessages = chatRow?.id ? await loadChat(chatId) : [];
  const draft = typeof searchParams?.draft === 'string' ? searchParams.draft : undefined;

  return (
    <PlaygroundChat
      key={chatId}
      chatId={chatId}
      initialMessages={initialMessages}
      initialDraft={draft}
    />
  );
}
