'use client';

import { useChat } from '@ai-sdk/react';
import { lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { DefaultChatTransport, getToolName, type ToolUIPart, type DynamicToolUIPart, isToolUIPart } from 'ai';
import { useRef, useEffect } from 'react';
import MCPToolCall from '@/components/playground/MCPToolCall';
import { MCPConnectionApproval } from '@/components/playground/MCPConnectionApproval';
import { ChatInput } from '@/components/playground/ChatInput';
import { UserMessage, AssistantMessage } from '@/components/playground/ChatMessage';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/playground/LoadingSpinner';
import { RecipeComponent } from '@/components/playground/RecipeComponent';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

export default function PlaygroundPage() {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { error, status, sendMessage, messages, addToolApprovalResponse } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-screen bg-background">
      {!hasMessages ? (
        /* Initial Empty State - Centered */
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-full max-w-3xl space-y-8">
            {/* Welcome Message */}
            <div className="text-center animate-in fade-in zoom-in-95 duration-1000">
              <h1 className="text-5xl md:text-6xl font-serif tracking-tight text-foreground mb-12">
                Let&apos;s figure it out together
              </h1>
            </div>

            {/* Chat Input */}
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

            {/* Recipe badges */}
            <div className="px-4">
              <RecipeComponent
                onAction={(prompt) => sendMessage({ text: prompt })}
              />
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Scrollable Messages Area */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-2 py-8 space-y-8">
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

          {/* Sticky Input Area */}
          <div className="sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent pt-2 pb-8">
            <div className="w-full max-w-3xl mx-auto px-6">
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
