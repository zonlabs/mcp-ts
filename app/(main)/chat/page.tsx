import { PlaygroundChat } from '@/components/chat/PlaygroundChat';

export const dynamic = 'force-dynamic';

export default function Page() {
  const newChatId = crypto.randomUUID();
  return <PlaygroundChat key={newChatId} chatId={newChatId} />;
}
