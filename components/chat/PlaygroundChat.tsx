'use client';

import { useChat } from '@ai-sdk/react';
import { lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { DefaultChatTransport, getToolName, type ToolUIPart, type DynamicToolUIPart, isToolUIPart } from 'ai';
import { Fragment, useRef, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { MCPConnectionApproval } from '@/components/chat/MCPConnectionApproval';
import { ServerIcon } from '@/components/common/ServerIcon';
import { ChatInput } from '@/components/chat/ChatInput';
import { UserMessage, AssistantMessage } from '@/components/chat/ChatMessage';
import { cn } from '@/lib/utils';
import { useMcpStore } from '@/lib/stores/mcp-store';
import { normalizeServerUrl } from '@/lib/url';
import { LoadingSpinner } from '@/components/chat/LoadingSpinner';
import { RecipeComponent } from '@/components/chat/RecipeComponent';
import { AlertCircle, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { readGatewaySelectionsFromStorage } from '@/lib/gateway-access';
import { normalizeLlmConfig, readLlmConfigFromStorage } from '@/components/chat/llmConfig';
import type { McpAgentUIMessage } from '@/agent/chat-agent';

import {
  Conversation,
  ConversationContent,
} from '@/components/ai-elements/conversation';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning';
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool';
import { McpAppRenderer } from '@/components/chat/McpAppRenderer';

interface PlaygroundChatProps {
  chatId: string;
  initialMessages: McpAgentUIMessage[];
  initialDraft?: string;
  isReadOnly?: boolean;
}

function MCPConnectionApprovedStatus({ input }: { input: any }) {
  const connections = useMcpStore(state => state.connections);
  const normalizedTargetUrl = normalizeServerUrl(input.serverUrl);

  const existingConnection = Object.values(connections).find((conn) => {
    if (input.serverId && conn.serverId === input.serverId) return true;
    if (!normalizedTargetUrl) return false;
    return normalizeServerUrl(conn.url) === normalizedTargetUrl;
  });

  const connectionStatus = existingConnection?.connectionStatus;
  const isReady = connectionStatus === 'READY';
  const isFailed = connectionStatus === 'FAILED' || connectionStatus === 'DISCONNECTED';

  return (
    <div className="w-full max-w-none sm:max-w-2xl flex flex-col gap-2 p-2 sm:p-3 bg-background rounded-lg animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <ServerIcon
          serverName={input.serverName || ''}
          serverUrl={input.serverUrl || ''}
          size={30}
          className="rounded-lg flex-shrink-0"
        />
        <div className="min-w-0 flex-1">
          <span className="truncate block text-[15px] sm:text-base font-semibold text-foreground leading-tight">
            {input.serverName || 'MCP Server'}
          </span>
        </div>
        <div
          className={cn(
            "inline-flex items-center gap-2 text-xs sm:text-sm",
            isReady
              ? "text-green-600 dark:text-green-400"
              : isFailed
                ? "text-red-600 dark:text-red-400"
                : "text-muted-foreground"
          )}
        >
          <span>{isReady ? 'Connected' : isFailed ? 'Connection failed' : 'Connecting...'}</span>
          {isReady ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : isFailed ? (
            <AlertCircle className="h-3.5 w-3.5" />
          ) : (
            <svg
              className="animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground font-semibold">
        {isReady
          ? 'Connection is ready.'
          : isFailed
            ? 'Connection did not reach ready state. Please try again.'
            : 'Waiting for connection to reach ready state.'}
      </p>
    </div>
  );
}

export function PlaygroundChat({ 
  chatId, 
  initialMessages, 
  initialDraft,
  isReadOnly = false 
}: PlaygroundChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasSentInitialDraft = useRef(false);
  const pendingDraftRef = useRef<{ text?: string; parts?: any[] } | null>(null);
  const lastTitleRef = useRef<string | null>(null);

  const chatContentWidthClass = "w-full max-w-none sm:max-w-3xl mx-auto px-2 sm:px-4 lg:px-6";
  const safeInitialMessages = Array.isArray(initialMessages) ? initialMessages : [];
  
  const getCurrentLlmConfig = () => {
    const normalized = normalizeLlmConfig(readLlmConfigFromStorage());
    return {
      ...normalized,
      baseUrl: normalized.baseUrl || undefined,
    };
  };
  
  const mobileStarterPrompts = [
    {
      label: 'Market Analysis',
      prompt: 'Use Alpha Vantage to fetch the last 30 days of daily prices for {TICKER}. Summarize whether the price trend is up, down, or flat.',
      icon: 'https://media.licdn.com/dms/image/v2/C4E0BAQExXHCjZYOeg/company-logo_200_200/company-logo_200_200/0/1635279005628/alpha_vantage_inc_logo?e=2147483647&v=beta&t=1eCKMzXdgp4XiMrzN4edDUCqMdUSHQ9nx5nXjD8RQ3Q',
    },
    {
      label: 'Semantic Search',
      prompt: 'Search the web using Exa to find the latest research papers on LLM optimization from the past month.',
      icon: 'https://awsmp-logos.s3.amazonaws.com/seller-7s5a3z2w3unay/b6519f9126c0432087c79827b95283c6.png',
    },
    {
      label: 'Draft Follow-Up Email',
      prompt: 'Draft a clear, professional follow-up email using Rube with access to Gmail. Infer an appropriate subject line and message content from the available context. The email should be concise, polite, and ready for review',
      icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRIB8EFu3xpWgE33JuAX-U-1geBFJnk8PAJSA&s',
    },
    {
      label: 'Notion Meeting Prep',
      prompt: 'Generate a briefing document by synthesizing project notes and recent updates directly from Notion.',
      icon: 'https://api.iconify.design/logos:notion-icon.svg',
    },
  ];

  const { error, status, sendMessage, messages, addToolApprovalResponse, setMessages, regenerate, stop } = useChat<McpAgentUIMessage>({
    id: chatId,
    messages: safeInitialMessages,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      prepareSendMessagesRequest: ({ body, messages: chatMessages }) => {
        const bodyConfig = (body as any)?.llmConfig;
        const currentConfig = bodyConfig ?? getCurrentLlmConfig();

        return {
          body: {
            messages: chatMessages,
            ...(body ?? {}),
            llmConfig: currentConfig,
            chatId,
            gatewaySelections: readGatewaySelectionsFromStorage(),
          },
        };
      },
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  const sendChatInput = (data: { text?: string; parts?: any[] }) => {
    if (status !== 'ready') return;
    const currentConfig = getCurrentLlmConfig();
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

  useEffect(() => {
    for (const message of messages) {
      const meta = (message as any)?.metadata;
      const title = meta?.chatTitle;
      if (!meta?.isNewChat || !title) continue;
      if (lastTitleRef.current === title) return;
      lastTitleRef.current = title;
      window.dispatchEvent(new CustomEvent('chat:title', {
        detail: { chatId, title },
      }));
      return;
    }
  }, [messages, chatId]);

  const contextUsage = useMemo(
    () => [...messages].reverse().find((m: any) => m?.role === 'assistant' && m?.metadata?.usage)?.metadata?.usage,
    [messages]
  );

  useEffect(() => {
    if (hasSentInitialDraft.current) return;
    const stored = sessionStorage.getItem('pending_chat_message');
    if (stored) {
      sessionStorage.removeItem('pending_chat_message');
      try {
        const parsed = JSON.parse(stored);
        if (parsed?.parts?.length) {
          pendingDraftRef.current = { parts: parsed.parts };
          return;
        }
        if (typeof parsed?.text === 'string' && parsed.text.trim()) {
          pendingDraftRef.current = { text: parsed.text };
          return;
        }
      } catch {
      }
    }
    if (initialDraft && initialDraft.trim()) {
      pendingDraftRef.current = { text: initialDraft };
    }
  }, [initialDraft]);

  useEffect(() => {
    if (hasSentInitialDraft.current) return;
    if (status !== 'ready') return;
    if (!pendingDraftRef.current) return;
    hasSentInitialDraft.current = true;
    const payload = pendingDraftRef.current;
    pendingDraftRef.current = null;
    sendChatInput(payload);
  }, [status]);

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
        action: 'regenerate-message',
      },
    });
  };

  const handleEditMessage = (messageId: string, newText: string) => {
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

    setMessages(updatedMessages as McpAgentUIMessage[]);

    const currentConfig = getCurrentLlmConfig();
    regenerate({
      body: { 
        llmConfig: currentConfig,
        action: 'edit-message'
      }
    });
  };

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

  const renderMessageParts = (m: McpAgentUIMessage, isLastMessage: boolean) => {
    const reasoningParts = m.parts.filter((part: any) => part.type === "reasoning");
    const reasoningText = reasoningParts.map((part: any) => part.text).join("\n\n");
    const hasReasoning = reasoningParts.length > 0;
    const lastPart = m.parts.at(-1);
    const isReasoningStreaming = isLastMessage && status === 'streaming' && lastPart?.type === "reasoning";

    const lastTextIndex = m.parts
      .map((p: any, idx: number) => (p?.type === 'text' && p.text ? idx : -1))
      .filter((idx: number) => idx !== -1)
      .pop();

    return (
      <>
        {hasReasoning && (
          <Reasoning className="w-full" isStreaming={isReasoningStreaming}>
            <ReasoningTrigger />
            <ReasoningContent>{reasoningText}</ReasoningContent>
          </Reasoning>
        )}
        {m.parts.map((part: any, index: number) => {
          if (part.type === 'text' && part.text) {
            return (
              <AssistantMessage
                key={`text-${index}`}
                text={part.text}
                parts={[]}
                onRegenerate={handleRegenerate}
                usage={m?.metadata?.usage}
                showActions={index === lastTextIndex}
                isStreaming={status === 'streaming'}
              />
            );
          }

          if (part.type === 'file') {
            return (
              <AssistantMessage
                key={`file-${index}`}
                text=""
                parts={[part]}
              />
            );
          }

          if (isToolUIPart(part)) {
            const toolPart = part as ToolUIPart<any> | DynamicToolUIPart;
            const toolName = getToolName(toolPart);
            const approvalId = 'approval' in toolPart ? toolPart.approval?.id : undefined;

            const isInitiateConn = toolName === 'MCPASSISTANT_INITIATE_CONNECTION' || toolName?.includes('INITIATE_CONNECTION');

            if (isInitiateConn) {
              const input = toolPart.input as any;

              if (toolPart.state === 'approval-requested') {
                return (
                  <div key={`tool-${index}`} className="w-full">
                    <MCPConnectionApproval
                      serverName={input.serverName || ''}
                      serverUrl={input.serverUrl || ''}
                      serverId={input.serverId || ''}
                      transportType={input.transportType || 'sse'}
                      approvalId={approvalId || ''}
                      onApprove={(data) => {
                        if (approvalId && addToolApprovalResponse) {
                          addToolApprovalResponse({
                            id: approvalId,
                            approved: true,
                          });
                        }
                      }}
                      onDeny={() => {
                        approvalId &&
                          addToolApprovalResponse?.({
                            id: approvalId,
                            approved: false,
                            reason: "User denied the connection request.",
                          });
                      }}
                    />
                  </div>
                );
              }

              if (toolPart.state === 'approval-responded' && toolPart.approval?.approved === true) {
                return (
                  <MCPConnectionApprovedStatus key={`tool-${index}`} input={input} />
                );
              }

              if (toolPart.state === 'approval-responded' && toolPart.approval?.approved === false) {
                return (
                  <div
                    key={`tool-${index}`}
                    className="w-full inline-flex items-center gap-2 text-xs text-red-600 dark:text-red-400"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3.5 w-3.5"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <circle cx="12" cy="16" r="1" />
                    </svg>
                    <span className="font-medium">Connection request cancelled.</span>
                  </div>
                );
              }

              if (toolPart.state === 'output-available') {
                return null;
              }

              if (toolPart.state === 'output-error') {
                const toolTitle = part.type.replace(/^tool-/, '');
                const headerProps = part.type === 'dynamic-tool' 
                  ? { type: part.type as 'dynamic-tool', state: toolPart.state, toolName: toolName }
                  : { type: part.type as 'tool-', state: toolPart.state, title: toolTitle };
                return (
                  <Tool key={`tool-${index}`} defaultOpen={false}>
                    <ToolHeader {...headerProps} />
                    <ToolContent>
                      <ToolInput input={toolPart.input} />
                      <ToolOutput errorText={toolPart.errorText} />
                    </ToolContent>
                  </Tool>
                );
              }

              return null;
            }

            const toolTitle = part.type.replace(/^tool-/, '');
            const headerProps = part.type === 'dynamic-tool'
              ? { type: 'dynamic-tool' as const, state: toolPart.state, toolName: toolName }
              : { type: 'tool-' as const, state: toolPart.state, title: toolTitle };
            
            const state = toolPart.state as string;
            const toolState = state === 'output-available' ? 'complete' 
              : state === 'executing' || state === 'in-progress' ? 'executing'
              : 'idle';
            
            return (
              <Fragment key={`tool-group-${index}`}>
                <Tool key={`tool-${index}`} defaultOpen={false}>
                  <ToolHeader {...headerProps} />
                  <ToolContent>
                    <ToolInput input={toolPart.input} />
                    <ToolOutput 
                      output={toolPart.state === 'output-available' ? toolPart.output : undefined}
                      errorText={toolPart.state === 'output-error' ? toolPart.errorText : undefined}
                    />
                  </ToolContent>
                </Tool>
                <McpAppRenderer
                  name={toolName || ''}
                  args={toolPart.input as Record<string, unknown> | undefined}
                  result={toolPart.state === 'output-available' ? toolPart.output : undefined}
                  status={toolState}
                />
              </Fragment>
            );
          }

          return null;
        })}
      </>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {!hasMessages ? (
        <>
          <div className="sm:hidden flex-1 min-h-0 flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center px-4 pb-24">
              <div className="mb-7">
                <Image
                  src="/logo.svg"
                  alt="Assistant logo"
                  width={46}
                  height={46}
                  className="opacity-90"
                />
              </div>
              <div className="w-full max-w-xs">
                <p className="mb-2 px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
                  Quick Actions
                </p>
                <div className="space-y-1">
                {mobileStarterPrompts.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => sendChatInput({ text: item.prompt })}
                    className="w-full text-left rounded-lg px-2.5 py-2 text-sm text-foreground/90 hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <img
                        src={item.icon}
                        alt=""
                        className="w-3.5 h-3.5 rounded-sm object-cover shrink-0 opacity-90"
                      />
                      <span className="line-clamp-1">{item.label}</span>
                      <ArrowUpRight className="w-3.5 h-3.5 ml-auto text-muted-foreground" />
                    </div>
                  </button>
                ))}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent pt-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
              <div className="px-1">
                {isReadOnly ? (
                  <div className="w-full text-center p-3 text-sm text-muted-foreground bg-secondary/50 rounded-lg border border-border/50 backdrop-blur-sm">
                    This is a read-only shared chat
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

          <div className="hidden sm:flex flex-1 min-h-0 flex-col items-center justify-center px-6">
            <div className="w-full max-w-3xl space-y-8">
              <div className="text-center animate-in fade-in zoom-in-95 duration-1000">
                <h1 className="text-5xl md:text-6xl font-serif tracking-tight text-foreground mb-10 leading-tight">
                  Let&apos;s figure it out together
                </h1>
              </div>

              {isReadOnly ? (
                <div className="w-full text-center p-4 text-sm text-muted-foreground bg-secondary/50 rounded-lg border border-border/50 backdrop-blur-sm">
                  This is a read-only shared chat
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

              <div className="px-4">
                <RecipeComponent
                  onAction={(prompt) => sendChatInput({ text: prompt })}
                />
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <Conversation className="flex-1 min-h-0">
            <ConversationContent>
              <div className={cn(chatContentWidthClass, "py-4 sm:py-8")}>
                {messages.map((m, index) => {
                  const isLastMessage = index === messages.length - 1;
                  return (
                    <div key={m.id} className={cn("group flex flex-col gap-3", m.role === 'user' ? "items-end" : "items-start")}>
                      {m.role === 'user' ? (
                        (() => {
                          const text = m.parts
                            .filter((p: any) => p.type === 'text')
                            .map((p: any) => p.text)
                            .join(' ');
                          return (
                            <UserMessage
                              message={{ text }}
                              parts={m.parts.filter((p: any) => p.type === 'file')}
                              onEdit={(newText) => handleEditMessage(m.id, newText)}
                            />
                          );
                        })()
                      ) : (
                        renderMessageParts(m, isLastMessage)
                      )}
                    </div>
                  );
                })}

                {(status === 'streaming' || status === 'submitted') && (
                  <div className="flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="p-1"><LoadingSpinner /></div>
                    <div className="prose prose-sm dark:prose-invert italic text-muted-foreground flex items-center h-8">
                      Thinking...
                    </div>
                  </div>
                )}

                {error && (
                  <AssistantMessage
                    text={formatErrorMessage(error)}
                    parts={[]}
                    onRegenerate={handleRegenerate}
                  />
                )}
                <div ref={messagesEndRef} className="h-4" />
              </div>
            </ConversationContent>
          </Conversation>

          <div className="sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:pb-8">
            <div className={chatContentWidthClass}>
              {isReadOnly ? (
                <div className="w-full text-center p-3 sm:p-4 text-sm text-muted-foreground bg-secondary/50 rounded-lg border border-border/50 backdrop-blur-sm shadow-sm max-w-2xl mx-auto">
                  This is a read-only shared chat
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
        </>
      )}
    </div>
  );
}
