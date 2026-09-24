import { notFound } from 'next/navigation';
import { PlaygroundChat } from '@/components/chat/PlaygroundChat';
import { createClient } from '@/lib/supabase/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProjectChatPage(props: {
  params: Promise<{ id: string; chatId: string }>;
}) {
  const { id: projectId, chatId } = await props.params;

  if (!UUID_REGEX.test(chatId)) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: chatRow } = await supabase
    .from('chats')
    .select('id, title, user_id, project_id')
    .eq('id', chatId)
    .maybeSingle();

  // If the chat row doesn't exist yet and there's no authenticated user, return 404
  if (!chatRow && !user) {
    notFound();
  }

  const effectiveProjectId = chatRow?.project_id || projectId;

  return (
    <PlaygroundChat
      key={chatId}
      chatId={chatId}
      projectId={effectiveProjectId}
      initialTitle={chatRow?.title}
      chatUserId={chatRow?.user_id || user?.id}
    />
  );
}
