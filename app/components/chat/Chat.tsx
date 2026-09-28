'use client';

import { useChat } from '@ai-sdk/react';
import { lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { DefaultChatTransport, getToolName, type ToolUIPart, type DynamicToolUIPart, isToolUIPart } from 'ai';
import { useRef, useEffect, useMemo, useState, useCallback, memo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ChatInput } from '@/components/chat/ChatInput';
import { UserMessage, AssistantMessage } from '@/components/chat/ChatMessage';
import { cn } from '@/lib/utils';
import { ChatSkeleton } from '@/components/chat/ChatSkeleton';
import { LoadingSpinner } from '@/components/chat/LoadingSpinner';
import { ChatEmptyState } from '@/components/chat/ChatEmptyState';
import { ActiveMcpAppOverlay, type ActiveMcpApp } from '@/components/chat/ActiveMcpAppOverlay';
import { MessagePartsRenderer } from '@/components/chat/MessagePartsRenderer';
import { readUserPreferencesFromStorage } from '@/lib/user-preferences';
import { normalizeLlmConfig, readLlmConfigFromStorage } from '@/components/chat/llmConfig';
import type { ChatUIMessage } from '@/agent/chat-agent';
import { useI18n } from '@/lib/web-i18n';
import { useQueryClient } from '@tanstack/react-query';
import { useSidebarChats, useStoredChat } from '@/lib/hooks/use-chats';
import { useChatPagination, CHAT_PAGE_LIMIT } from '@/lib/hooks/use-chat-pagination';
import { useProject } from '@/lib/hooks/use-projects';

import {
  Conversation,
  ConversationContent,
} from '@/components/ai-elements/conversation';
import { getNextSelectedThoughtMessageId } from '@/components/chat/chain-of-thought-utils';

export const PENDING_CHAT_MESSAGE_STORAGE_KEY = "linkos:pending-chat-message:v1";

export interface ChatProps {
  chatId?: string;
  projectId?: string;
  initialMessages?: ChatUIMessage[];
  initialTitle?: string | null;
  chatUserId?: string | null;
  isReadOnly?: boolean;
  renderEmptyState?: (props: {
    sendChatInput: (data: { text?: string; parts?: any[] }) => void;
    status: 'ready' | 'submitted' | 'streaming' | 'error';
    stop: () => void;
  }) => React.ReactNode;
}

interface MessageRowProps {
  m: ChatUIMessage;
  isLastMessage: boolean;
  thoughtOpen: boolean;
  onEdit: (id: string, text: string) => void;
  renderParts: (m: ChatUIMessage, isLast: boolean, thoughtOpen: boolean) => React.ReactNode;
}

const MessageRow = memo(function MessageRow({ m, isLastMessage, thoughtOpen, onEdit, renderParts }: MessageRowProps) {
  const text = m.parts
    .filter((p: any) => p.type === 'text')
    .map((p: any) => p.text)
    .join(' ');
  return (
    <div className={cn('group flex flex-col gap-1.5 w-full', m.role === 'user' ? 'items-end' : 'items-start')}>
      {m.role === 'user' ? (
        <UserMessage
          message={{ text }}
          parts={m.parts.filter((p: any) => p.type === 'file')}
          onEdit={(newText) => onEdit(m.id, newText)}
        />
      ) : (
        renderParts(m, isLastMessage, thoughtOpen)
      )}
    </div>
  );
}, (prev, next) => {
  if (prev.isLastMessage !== next.isLastMessage) return false;
  if (next.isLastMessage) return false;
  return prev.m === next.m && prev.onEdit === next.onEdit && prev.thoughtOpen === next.thoughtOpen;
});

function extractChatId(pathname: string): string | null {
  const match = pathname.match(/\/chat\/([^/]+)/);
  return match ? match[1] : null;
}

function getOptimisticChatTitle(promptText: string, existingMessageCount: number): string | null {
  if (existingMessageCount > 0) return null;
  return promptText.length > 50 ? `${promptText.slice(0, 47)}...` : promptText;
}

export function Chat({
  chatId: propChatId,
  projectId: propProjectId,
  initialMessages = [],
  initialTitle,
  chatUserId,
  isReadOnly = false,
  renderEmptyState,
}: ChatProps) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeProjectId = propProjectId || searchParams?.get('projectId') || (pathname.startsWith('/projects/') ? pathname.split('/')[2] : undefined);
  const { project: activeProject } = useProject(activeProjectId);
  const projectInfo = useMemo(() => {
    if (!activeProject) return null;
    return { id: activeProject.id, name: activeProject.name };
  }, [activeProject]);

  const chatIdFromUrl = propChatId || extractChatId(pathname);
  const isNewChat = !chatIdFromUrl && !propChatId;
  const newChatIdRef = useRef(typeof crypto !== 'undefined' ? crypto.randomUUID() : `chat-${Date.now()}`);
  const prevPathnameRef = useRef(pathname);

  if (isNewChat && prevPathnameRef.current !== pathname) {
    newChatIdRef.current = typeof crypto !== 'undefined' ? crypto.randomUUID() : `chat-${Date.now()}`;
  }
  prevPathnameRef.current = pathname;

  const chatId = propChatId || chatIdFromUrl || newChatIdRef.current;

  const [chatInput, setChatInput] = useState("");
  const [activeMcpApp, setActiveMcpApp] = useState<ActiveMcpApp | null>(null);

  const [selectedThoughtMessageId, setSelectedThoughtMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastTitleRef = useRef<string | null>(null);

  const chatContentWidthClass = "w-full max-w-2xl mx-auto px-4 sm:px-6";
  const queryClient = useQueryClient();
  const cachedMessages = useMemo(() => {
    if (!chatId || isNewChat) return undefined;
    const cached = queryClient.getQueryData<{ messages: any[] }>(["chat", chatId]);
    return Array.isArray(cached?.messages) && cached.messages.length > 0 ? cached.messages : undefined;
  }, [chatId, isNewChat, queryClient]);

  const safeInitialMessages = Array.isArray(initialMessages) && initialMessages.length > 0
    ? initialMessages
    : (cachedMessages ?? []);

  const getCurrentLlmConfig = () => {
    const normalized = normalizeLlmConfig(readLlmConfigFromStorage());
    return {
      ...normalized,
      baseUrl: normalized.baseUrl || undefined,
    };
  };

  const { error, status, sendMessage, messages, addToolApprovalResponse, setMessages, regenerate, stop } = useChat<ChatUIMessage>({
    id: chatId,
    messages: safeInitialMessages,
    onError: (err) => {
      console.error('[useChat onError] Chat error:', err);
    },
    transport: new DefaultChatTransport({
      api: '/api/chat',
      prepareSendMessagesRequest: ({ id, messages: chatMessages, trigger, messageId, body }) => {
        const bodyConfig = (body as any)?.llmConfig;
        const currentConfig = bodyConfig ?? getCurrentLlmConfig();
        const userPreferences = readUserPreferencesFromStorage();

        const baseBody = {
          id,
          projectId: activeProjectId,
          llmConfig: currentConfig,
          userPreferences: {
            timezone: userPreferences.timezone,
            toolApprovalMode: userPreferences.toolApprovalMode,
            enableMemory: userPreferences.enableMemory,
          },
          ...(body ?? {}),
        };

        if (trigger === 'submit-message' || (trigger as string) === 'submit-user-message') {
          return {
            body: {
              ...baseBody,
              trigger: 'submit-user-message',
              message: chatMessages[chatMessages.length - 1],
              messages: chatMessages,
              messageId,
            },
          };
        } else if (trigger === 'regenerate-message' || (trigger as string) === 'regenerate-assistant-message') {
          return {
            body: {
              ...baseBody,
              trigger: 'regenerate-assistant-message',
              messages: chatMessages,
              messageId,
            },
          };
        }

        throw new Error(`Unsupported trigger: ${trigger}`);
      },
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  const { upsertChat } = useSidebarChats();

  const sendChatInput = (data: { text?: string; parts?: any[] }) => {
    if (status !== 'ready') return;

    if (typeof window !== 'undefined') {
      if (activeProjectId && window.location.pathname.startsWith('/projects/')) {
        window.history.replaceState(null, '', `/projects/${activeProjectId}/chat/${chatId}`);
      } else if (window.location.pathname === '/chat' || window.location.pathname === '/chat/') {
        window.history.replaceState(null, '', `/chat/${chatId}`);
      }
    }

    const currentConfig = getCurrentLlmConfig();
    const promptText = data.text || (data.parts?.find((p: any) => p.type === 'text')?.text) || "New Chat";
    const optimisticTitle = getOptimisticChatTitle(promptText, messages.length);

    upsertChat({ id: chatId, ...(optimisticTitle ? { title: optimisticTitle } : {}), user_id: chatUserId, project_id: activeProjectId });
    if (data.parts && data.parts.length > 0) {
      sendMessage({
        role: 'user',
        parts: data.parts,
      }, {
        body: { llmConfig: currentConfig },
      });
      return;
    }
    if (data.text) {
      sendMessage({ text: data.text }, { body: { llmConfig: currentConfig } });
    }
  };

  const handlePrependOlderMessages = useCallback((older: ChatUIMessage[]) => {
    setMessages((currentMessages) => {
      const existingIds = new Set(currentMessages.map((m) => m.id));
      const uniqueOlder = older.filter((m) => !existingIds.has(m.id));
      return [...uniqueOlder, ...currentMessages];
    });
  }, [setMessages]);

  const {
    hasMoreOlder,
    setHasMoreOlder,
    setOldestCursor,
    isFetchingOlder,
    topSentinelRef,
  } = useChatPagination({
    chatId,
    isNewChat,
    limit: CHAT_PAGE_LIMIT,
    onPrependMessages: handlePrependOlderMessages,
  });

  const shouldFetchChat = Boolean(chatId && !isNewChat && safeInitialMessages.length === 0 && messages.length === 0);
  const { data: chatData, isLoading: isChatLoading } = useStoredChat(chatId, {
    enabled: shouldFetchChat,
    limit: CHAT_PAGE_LIMIT,
  });

  useEffect(() => {
    if (chatData?.messages && Array.isArray(chatData.messages) && chatData.messages.length > 0 && messages.length === 0) {
      setMessages(chatData.messages);
      setHasMoreOlder(chatData.hasMore ?? false);
      setOldestCursor(chatData.oldestCursor ?? null);
    }
  }, [chatData, messages.length, setMessages, setHasMoreOlder, setOldestCursor]);

  const isLoadingMessages =
    shouldFetchChat &&
    (isChatLoading || (Boolean(chatData?.messages && chatData.messages.length > 0) && messages.length === 0));

  const prevChatIdRef = useRef(chatId);
  useEffect(() => {
    if (prevChatIdRef.current !== chatId) {
      prevChatIdRef.current = chatId;
      if (isNewChat) {
        setMessages([]);
      }
    }
  }, [chatId, isNewChat, setMessages]);

  // Only sync initialTitle if this is an existing saved chat (has propChatId and initialTitle)
  useEffect(() => {
    if (initialTitle && propChatId) {
      upsertChat({ id: propChatId, title: initialTitle, user_id: chatUserId, project_id: activeProjectId });
    }
  }, [initialTitle, propChatId, chatUserId, activeProjectId, upsertChat]);

  useEffect(() => {
    if (status === 'streaming') return;
    for (const message of messages) {
      const meta = (message as any)?.metadata;
      const title = meta?.chatTitle;
      if (!title) continue;
      if (lastTitleRef.current === title) return;
      lastTitleRef.current = title;
      upsertChat({ id: chatId, title, user_id: chatUserId, project_id: activeProjectId });
      return;
    }
  }, [messages, status, chatId, chatUserId, activeProjectId, upsertChat]);

  useEffect(() => {
    if (status === 'ready' && messages.length > 0) {
      upsertChat({ id: chatId, user_id: chatUserId, project_id: activeProjectId });
      queryClient.setQueryData(["chat", chatId], { messages });
    }
  }, [status, messages, chatId, chatUserId, activeProjectId, upsertChat, queryClient]);

  const contextUsage = useMemo(
    () => [...messages].reverse().find((m: any) => m?.role === 'assistant' && m?.metadata?.usage)?.metadata?.usage,
    [messages]
  );





  useEffect(() => {
    if (!selectedThoughtMessageId) return;
    if (messages.some((message) => message.id === selectedThoughtMessageId)) return;
    setSelectedThoughtMessageId(null);
  }, [messages, selectedThoughtMessageId]);



  const hasMessages = messages.length > 0;

  const handleRegenerate = () => {
    if (isReadOnly) return;
    const lastUserIndex = [...messages].reverse().findIndex((m: any) => m?.role === 'user');
    if (lastUserIndex < 0) return;
    const userIndex = messages.length - 1 - lastUserIndex;
    const lastAssistant = messages
      .slice(userIndex + 1)
      .reverse()
      .find((m: any) => m?.role === 'assistant' && m?.id);
    const currentConfig = getCurrentLlmConfig();
    upsertChat({ id: chatId });
    if (!lastAssistant) {
      regenerate({ body: { llmConfig: currentConfig } });
      return;
    }

    const trimmed = [...messages.slice(0, userIndex + 1), lastAssistant];
    setMessages(trimmed);
    regenerate({
      messageId: lastAssistant.id,
      body: {
        llmConfig: currentConfig,
      },
    });
  };

  const handleEditMessage = useCallback((messageId: string, newText: string) => {
    if (isReadOnly) return;
    const mIndex = messages.findIndex(m => m.id === messageId);
    if (mIndex === -1) return;

    const updatedMessages = messages.slice(0, mIndex + 1).map((m, idx) => {
      if (idx === mIndex) {
        return {
          ...m,
          parts: [{ type: 'text', text: newText }]
        };
      }
      return m;
    });

    setMessages(updatedMessages as ChatUIMessage[]);

    const currentConfig = getCurrentLlmConfig();
    upsertChat({ id: chatId });
    regenerate({
      body: {
        llmConfig: currentConfig,
      }
    });
  }, [isReadOnly, messages, setMessages, regenerate, chatId, upsertChat]);

  const formatErrorMessage = (err: any) => {
    const raw = err?.message || "An error occurred";
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.error?.message) return parsed.error.message;
        if (parsed?.message) return parsed.message;
      } catch {
      }
      return raw;
    }
    if (err?.error?.message) return err.error.message;
    return "An error occurred";
  };

  const handleApproveTool = useCallback((approvalId: string) => {
    upsertChat({ id: chatId });
    addToolApprovalResponse?.({
      id: approvalId,
      approved: true,
    });
  }, [upsertChat, chatId, addToolApprovalResponse]);

  const handleDenyTool = useCallback((approvalId: string, reason: string) => {
    upsertChat({ id: chatId });
    addToolApprovalResponse?.({
      id: approvalId,
      approved: false,
      reason,
    });
  }, [upsertChat, chatId, addToolApprovalResponse]);

  const renderMessageParts = useCallback((m: ChatUIMessage, isLastMessage: boolean, isThoughtOpen: boolean) => (
    <MessagePartsRenderer
      message={m}
      isLastMessage={isLastMessage}
      status={status}
      allMessages={messages}
      isThoughtOpen={isThoughtOpen}
      onToggleThought={() => setSelectedThoughtMessageId((current) => getNextSelectedThoughtMessageId(current, m.id))}
      onRegenerate={handleRegenerate}
      onApproveTool={handleApproveTool}
      onDenyTool={handleDenyTool}
      onExpandMcpApp={setActiveMcpApp}
    />
  ), [
    status,
    messages,
    handleRegenerate,
    handleApproveTool,
    handleDenyTool,
    setActiveMcpApp,
  ]);

  if (isLoadingMessages) {
    return <ChatSkeleton />;
  }

  return (
    <div className="flex flex-col h-full w-full flex-1 min-h-0 min-w-0 bg-background">
      {!hasMessages ? (
        renderEmptyState ? (
          renderEmptyState({ sendChatInput, status, stop })
        ) : (
          <ChatEmptyState
            projectInfo={projectInfo}
            isReadOnly={isReadOnly}
            chatInput={chatInput}
            setChatInput={setChatInput}
            sendChatInput={sendChatInput}
            stop={stop}
            status={status}
            contextUsage={contextUsage}
          />
        )
      ) : (
        <div className="relative flex flex-1 min-h-0 min-w-0 overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col relative">
            {activeMcpApp ? (
              <ActiveMcpAppOverlay
                app={activeMcpApp}
                onClose={() => setActiveMcpApp(null)}
              />
            ) : (
              <Conversation className="flex-1 min-h-0 w-full" initial="instant">
                <ConversationContent className={cn(chatContentWidthClass, "py-4 sm:py-6 flex flex-col gap-4 sm:gap-5")}>

                  {/* Top sentinel & loading earlier messages indicator */}
                  {hasMoreOlder && (
                    <div ref={topSentinelRef} className="w-full flex items-center justify-center py-2 min-h-8">
                      {isFetchingOlder && (
                        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground animate-in fade-in duration-200">
                          <LoadingSpinner />
                          <span>Loading earlier messages...</span>
                        </div>
                      )}
                    </div>
                  )}

                  {messages.map((m, index) => {
                    const isLastMessage = index === messages.length - 1;
                    return (
                      <MessageRow
                        key={m.id || index}
                        m={m}
                        isLastMessage={isLastMessage}
                        thoughtOpen={selectedThoughtMessageId === m.id}
                        onEdit={handleEditMessage}
                        renderParts={renderMessageParts}
                      />
                    );
                  })}

                  {status === 'submitted' && messages[messages.length - 1]?.role === 'user' && (
                    <div className="flex items-start gap-2 w-full text-muted-foreground animate-in fade-in duration-200">
                      <LoadingSpinner />
                    </div>
                  )}

                  {error && (
                    <AssistantMessage
                      text={formatErrorMessage(error)}
                      parts={[]}
                      onRegenerate={handleRegenerate}
                    />
                  )}
                  <div ref={messagesEndRef} className="h-2" />
                </ConversationContent>
              </Conversation>
            )}

            <div className="sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:pb-8 w-full flex justify-center">
              <div className={chatContentWidthClass}>
                {isReadOnly ? (
                  <div className="w-full text-center p-3 sm:p-4 text-sm text-muted-foreground bg-secondary/50 rounded-lg border border-border/50 backdrop-blur-sm shadow-sm max-w-2xl mx-auto">
                    {t("readOnlySharedChat")}
                  </div>
                ) : (
                  <ChatInput
                    onSend={sendChatInput}
                    onStop={stop}
                    status={status}
                    disabled={status === 'submitted' || status === 'streaming'}
                    contextUsage={contextUsage}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
