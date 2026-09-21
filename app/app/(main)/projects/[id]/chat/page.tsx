import { PlaygroundChat } from '@/components/chat/PlaygroundChat';

export default async function ProjectNewChatPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await props.params;

  return (
    <PlaygroundChat
      key={`new-chat-${projectId}`}
      projectId={projectId}
    />
  );
}
