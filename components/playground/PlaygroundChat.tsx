'use client';

import { useChat } from '@ai-sdk/react';
import { lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { DefaultChatTransport, getToolName, type ToolUIPart, type DynamicToolUIPart, isToolUIPart } from 'ai';
import { useRef, useEffect } from 'react';
import Image from 'next/image';
import MCPToolCall from '@/components/playground/MCPToolCall';
import { MCPConnectionApproval } from '@/components/playground/MCPConnectionApproval';
import { ChatInput } from '@/components/playground/ChatInput';
import { UserMessage, AssistantMessage } from '@/components/playground/ChatMessage';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/playground/LoadingSpinner';
import { RecipeComponent } from '@/components/playground/RecipeComponent';
import { ArrowUpRight } from 'lucide-react';
import { readGatewaySelectionsFromStorage } from '@/lib/gateway-access';
import { normalizeLlmConfig, readLlmConfigFromStorage } from '@/components/playground/llmConfig';
import type { McpAgentUIMessage } from '@/agent/openai-agent';

interface PlaygroundChatProps {
  chatId: string;
  initialMessages: McpAgentUIMessage[];
  initialDraft?: string;
}

export function PlaygroundChat({ chatId, initialMessages, initialDraft }: PlaygroundChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasSentInitialDraft = useRef(false);
  const pendingDraftRef = useRef<{ text?: string; parts?: any[] } | null>(null);
  const lastTitleRef = useRef<string | null>(null);
  const chatContentWidthClass = "w-full max-w-none sm:max-w-3xl mx-auto px-2 sm:px-4 lg:px-6";
  const chatInnerContentInsetClass = "px-2 sm:px-2";
  const safeInitialMessages = Array.isArray(initialMessages) ? initialMessages : [];
  const getLatestLlmConfig = () => {
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
      icon: 'https://media.licdn.com/dms/image/v2/C4E0BAQExXHCGjZYOeg/company-logo_200_200/company-logo_200_200/0/1635279005628/alpha_vantage_inc_logo?e=2147483647&v=beta&t=1eCKMzXdgp4XiMrzN4edDUCqMdUSHQ9nx5nXjD8RQ3Q',
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
      prepareSendMessagesRequest: ({ body, messages }) => {
        const bodyConfig = (body as any)?.llmConfig;
        const latestConfig = getLatestLlmConfig();

        return {
          body: {
            messages,
            ...(body ?? {}),
            llmConfig: bodyConfig ?? latestConfig,
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
    const currentConfig = getLatestLlmConfig();
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
        // ignore invalid payload
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
    const lastUserIndex = [...messages].reverse().findIndex((m: any) => m?.role === 'user');
    if (lastUserIndex < 0) return;
    const userIndex = messages.length - 1 - lastUserIndex;
    const lastAssistant = messages
      .slice(userIndex + 1)
      .reverse()
      .find((m: any) => m?.role === 'assistant' && m?.id);
    const currentConfig = getLatestLlmConfig();
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

  const formatErrorMessage = (err: any) => {
    const raw = err?.message || "An error occurred";
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.error?.message) return parsed.error.message;
        if (parsed?.message) return parsed.message;
      } catch {
        // not JSON
      }
      return raw;
    }
    if (err?.error?.message) return err.error.message;
    return "An error occurred";
  };


  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {!hasMessages ? (
        <>
          {/* Mobile Empty State */}
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
                <ChatInput
                  onSend={sendChatInput}
                  onStop={stop}
                  status={status}
                  disabled={status === 'submitted' || status === 'streaming'}
                />
              </div>
            </div>
          </div>

          {/* Desktop Empty State */}
          <div className="hidden sm:flex flex-1 min-h-0 flex-col items-center justify-center px-6">
            <div className="w-full max-w-3xl space-y-8">
              <div className="text-center animate-in fade-in zoom-in-95 duration-1000">
                <h1 className="text-5xl md:text-6xl font-serif tracking-tight text-foreground mb-10 leading-tight">
                  Let&apos;s figure it out together
                </h1>
              </div>

              <ChatInput
                onSend={sendChatInput}
                onStop={stop}
                status={status}
                disabled={status === 'submitted' || status === 'streaming'}
              />

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
          {/* Scrollable Messages Area */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className={`${chatContentWidthClass} py-4 sm:py-8 space-y-6 sm:space-y-8`}>
              <div className={chatInnerContentInsetClass}>
              
              {/* Messages */}
              {messages.map((m) => {
                const usageForMessage = m?.metadata?.usage;
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
                      />
                        );
                      })()
                    ) : (
                      <>
                        {/* Render parts in sequence */}
                        {m.parts.map((part: any, index: number) => {
                          const lastTextIndex = m.parts
                            .map((p: any, idx: number) => (p?.type === 'text' && p.text ? idx : -1))
                            .filter((idx: number) => idx !== -1)
                            .pop();
                          // Handle text parts
                          if (part.type === 'text' && part.text) {
                            return (
                              <AssistantMessage
                                key={index}
                                text={part.text}
                                parts={[]}
                                onRegenerate={handleRegenerate}
                                usage={usageForMessage}
                                showActions={index === lastTextIndex}
                              />
                            );
                          }

                          // Handle file parts
                          if (part.type === 'file') {
                            return (
                              <AssistantMessage
                                key={index}
                                text=""
                                parts={[part]}
                              />
                            );
                          }

                          // Handle tool calls
                          if (isToolUIPart(part)) {
                            const toolPart = part as ToolUIPart<any> | DynamicToolUIPart;
                            const toolName = getToolName(toolPart);
                            const approvalId = 'approval' in toolPart ? toolPart.approval?.id : undefined;
                            // console.log(`toolPart ---> : ${JSON.stringify(toolPart)}`)

                            // Handle MCP connection tool - all states
                            const isInitiateConn = toolName === 'MCPASSISTANT_INITIATE_CONNECTION' || toolName?.includes('INITIATE_CONNECTION');

                            if (isInitiateConn) {
                              const input = toolPart.input as any;

                              // Only show approval UI for approval-requested state
                              if (toolPart.state === 'approval-requested') {
                                return (
                                  <div key={index} className="w-full">
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
                                            ...(data ? { data } : {}),
                                          });
                                        }
                                      }}
                                      onDeny={() => {
                                        approvalId &&
                                          addToolApprovalResponse?.({
                                            id: approvalId,
                                            approved: false,
                                          });
                                      }}
                                    />
                                  </div>
                                );
                              }

                              // For initiate-mcp-connection, we hide the successful state to reduce noise
                              // as the assistant typically follows up with "I'm connected" text.
                              // We show the approval card during request, and the tool call box ONLY if there's an error.
                              if (toolPart.state === 'output-available') {
                                return null; 
                              }

                              if (toolPart.state === 'output-error') {
                                return (
                                  <div key={index} className="w-full">
                                    <MCPToolCall
                                      name={toolPart.title || toolName}
                                      state={toolPart.state}
                                      input={toolPart.input}
                                      errorText={toolPart.errorText}
                                    />
                                  </div>
                                );
                              }

                              return null; // Hide loading/responded/other intermediate states
                            }

                            // Regular tool call display for other tools
                            return (
                              <div key={index} className="w-full">
                                <MCPToolCall
                                  name={toolPart.title || toolName}
                                  state={toolPart.state}
                                  input={toolPart.input}
                                  output={toolPart.state === 'output-available' ? toolPart.output : undefined}
                                  errorText={toolPart.state === 'output-error' ? toolPart.errorText : undefined}
                                />
                              </div>
                            );
                          }

                          return null;
                        })}
                      </>
                    )}
                  </div>
                );
              })}

              {/* Thinking State */}
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
            </div>
          </div>

          {/* Sticky Input Area */}
          <div className="sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:pb-8">
          <div className={chatContentWidthClass}>
            <ChatInput
              onSend={sendChatInput}
                onStop={stop}
                status={status}
                disabled={status === 'submitted' || status === 'streaming'}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
