import { redirect } from 'next/navigation';

export default function Page() {
  const newChatId = crypto.randomUUID();
  redirect(`/chat/${newChatId}`);
}
