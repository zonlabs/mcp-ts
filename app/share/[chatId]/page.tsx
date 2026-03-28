import { loadPublicChat } from '@/lib/chat-store';
import { SharedChat } from '@/components/playground/SharedChat';

export default async function Page(props: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await props.params;
  const messages = await loadPublicChat(chatId);

  return <SharedChat messages={messages} />;
}

