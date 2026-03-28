import { loadChat } from '@/lib/chat-store';
import { PlaygroundChat } from '@/components/playground/PlaygroundChat';

export default async function Page(props: { params: Promise<{ chatId: string }>; searchParams?: Promise<{ draft?: string }> }) {
  const { chatId } = await props.params;
  const searchParams = props.searchParams ? await props.searchParams : undefined;
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
