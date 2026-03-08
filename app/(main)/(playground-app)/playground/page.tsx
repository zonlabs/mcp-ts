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
import { Button } from '@/components/ui/button';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { readGatewaySelectionsFromStorage } from '@/lib/gateway-access';

export default function PlaygroundPage() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContentWidthClass = "w-full max-w-3xl mx-auto px-1 sm:px-4 lg:px-6";
  const chatInnerContentInsetClass = "px-2 sm:px-2";
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

  const { error, status, sendMessage, messages, addToolApprovalResponse } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      prepareSendMessagesRequest: ({ body, messages }) => ({
        body: {
          messages,
          ...(body ?? {}),
          gatewaySelections: readGatewaySelectionsFromStorage(),
        },
      }),
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const hasMessages = messages.length > 0;

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
                    onClick={() => sendMessage({ text: item.prompt })}
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
                  onSend={(data) => {
                    if (data.parts && data.parts.length > 0) {
                      sendMessage({
                        role: 'user',
                        parts: data.parts,
                      });
                    } else if (data.text) {
                      sendMessage({ text: data.text });
                    }
                  }}
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
                onSend={(data) => {
                  if (data.parts && data.parts.length > 0) {
                    sendMessage({
                      role: 'user',
                      parts: data.parts,
                    });
                  } else if (data.text) {
                    sendMessage({ text: data.text });
                  }
                }}
                status={status}
                disabled={status === 'submitted' || status === 'streaming'}
              />

              <div className="px-4">
                <RecipeComponent
                  onAction={(prompt) => sendMessage({ text: prompt })}
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
              {messages.map((m, messageIndex) => {
                return (
                  <div key={m.id} className={cn("group flex flex-col gap-3", m.role === 'user' ? "items-end" : "items-start")}>
                    {m.role === 'user' ? (
                      <UserMessage
                        message={{ text: m.parts.filter((p: any) => p.type === 'text').map((p: any) => p.text).join(' ') }}
                        parts={m.parts.filter((p: any) => p.type === 'file')}
                      />
                    ) : (
                      <>
                        {/* Render parts in sequence */}
                        {m.parts.map((part: any, index: number) => {
                          // Handle text parts
                          if (part.type === 'text' && part.text) {
                            return (
                              <AssistantMessage
                                key={index}
                                text={part.text}
                                parts={[]}
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
                            if (toolName === 'MCPASSISTANT_INITIATE_CONNECTION') {
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
                                          console.log('[Playground] Sending MCP tool approval response', {
                                            approvalId,
                                            data,
                                          });
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

                              // For other states, show regular tool call display
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
                <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/20 text-destructive text-sm flex items-center justify-between">
                  <span>{error.message || 'An error occurred'}</span>
                  <Button variant="ghost" size="sm" onClick={() => sendMessage({ text: '' })}>
                    <RefreshCw className="w-3 h-3 mr-2" /> Retry
                  </Button>
                </div>
              )}
              <div ref={messagesEndRef} className="h-4" />
              </div>
            </div>
          </div>

          {/* Sticky Input Area */}
          <div className="sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:pb-8">
            <div className={chatContentWidthClass}>
              <ChatInput
                onSend={(data) => {
                  if (data.parts && data.parts.length > 0) {
                    sendMessage({
                      role: 'user',
                      parts: data.parts,
                    });
                  } else if (data.text) {
                    sendMessage({ text: data.text });
                  }
                }}
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
