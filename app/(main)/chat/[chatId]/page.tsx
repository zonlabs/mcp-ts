import { notFound } from 'next/navigation';
import { PlaygroundChat } from '@/components/chat/PlaygroundChat';
import { createClient } from '@/lib/supabase/server';
import { loadChat } from '@/lib/chat-store';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page(props: { params: Promise<{ chatId: string }>; searchParams?: Promise<{ draft?: string }> }) {
  const { chatId } = await props.params;
  const searchParams = props.searchParams ? await props.searchParams : undefined;

  if (!UUID_REGEX.test(chatId)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: chatRow, error } = await supabase
    .from('chats')
    .select('id, title, user_id')
    .eq('id', chatId)
    .maybeSingle();

  if (error || !chatRow) {
    notFound();
  }

  const initialMessages = await loadChat(chatId);
  const draft = typeof searchParams?.draft === 'string' ? searchParams.draft : undefined;

  return (
    <PlaygroundChat
      key={chatId}
      chatId={chatId}
      initialTitle={chatRow.title}
      chatUserId={chatRow.user_id}
      initialMessages={initialMessages}
      initialDraft={draft}
    />
  );
}
