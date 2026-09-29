import { notFound } from 'next/navigation';
import { Chat } from '@/components/chat/Chat';
import { createClient } from '@/lib/supabase/server';
import {
  UUID_REGEX,
  resolveChatAccess,
  resolveEffectiveProjectId,
} from '@/lib/chat-auth.server';

export default async function Page(props: {
  params: Promise<{ chatId: string }>;
  searchParams?: Promise<{ draft?: string; projectId?: string }>;
}) {
  const { chatId } = await props.params;
  const searchParams = props.searchParams ? await props.searchParams : undefined;

  if (!UUID_REGEX.test(chatId)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const access = await resolveChatAccess(supabase, chatId, user);

  // New draft chat requires an authenticated user; existing chat must be accessible
  if (!access.chat) {
    if (!user) notFound();
  } else if (!access.canView) {
    notFound();
  }

  const effectiveProjectId = await resolveEffectiveProjectId(
    supabase,
    access.chat?.project_id,
    searchParams?.projectId,
    user
  );

  return (
    <Chat
      key={chatId}
      chatId={chatId}
      projectId={effectiveProjectId}
      initialTitle={access.chat?.title ?? undefined}
      chatUserId={access.chat?.user_id || user?.id}
      isReadOnly={access.isReadOnly}
    />
  );
}
