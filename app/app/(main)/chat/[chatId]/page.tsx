import { notFound } from 'next/navigation';
import { PlaygroundChat } from '@/components/chat/PlaygroundChat';
import { createClient } from '@/lib/supabase/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page(props: { params: Promise<{ chatId: string }>; searchParams?: Promise<{ draft?: string; projectId?: string }> }) {
  const { chatId } = await props.params;
  const searchParams = props.searchParams ? await props.searchParams : undefined;

  if (!UUID_REGEX.test(chatId)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: chatRow } = await supabase
    .from('chats')
    .select('id, title, user_id, project_id, visibility')
    .eq('id', chatId)
    .maybeSingle();

  // If the chat row doesn't exist yet and there's no authenticated user, return 404
  if (!chatRow && !user) {
    notFound();
  }

  let isReadOnly = false;
  if (chatRow && user && chatRow.user_id !== user.id) {
    let collaboratorRole: 'viewer' | 'editor' | null = null;
    if (user.email) {
      const { data: shareData } = await supabase
        .from('chat_shares')
        .select('role')
        .eq('chat_id', chatId)
        .eq('email', user.email.toLowerCase())
        .maybeSingle();

      if (shareData?.role) {
        collaboratorRole = shareData.role as 'viewer' | 'editor';
      }
    }

    if (collaboratorRole === 'viewer') {
      isReadOnly = true;
    } else if (chatRow.visibility !== 'PUBLIC' && collaboratorRole !== 'editor') {
      notFound();
    }
  }

  const projectIdParam = typeof searchParams?.projectId === 'string' ? searchParams.projectId : undefined;
  const effectiveProjectId = chatRow?.project_id || projectIdParam;

  return (
    <PlaygroundChat
      key={chatId}
      chatId={chatId}
      projectId={effectiveProjectId}
      initialTitle={chatRow?.title}
      chatUserId={chatRow?.user_id || user?.id}
      isReadOnly={isReadOnly}
    />
  );
}
