'use client';

import { useMemo } from 'react';
import { isToolUIPart, getToolName, type ToolUIPart, type DynamicToolUIPart } from 'ai';
import { UserMessage, AssistantMessage } from '@/components/playground/ChatMessage';
import MCPToolCall from '@/components/playground/MCPToolCall';
import { cn } from '@/lib/utils';
import type { McpAgentUIMessage } from '@/agent/openai-agent';

interface SharedChatProps {
  messages: McpAgentUIMessage[];
}

export function SharedChat({ messages }: SharedChatProps) {
  const visibleMessages = useMemo(() => (Array.isArray(messages) ? messages : []), [messages]);

  return (
    <div className="flex flex-col h-full min-h-screen bg-background">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="w-full max-w-3xl mx-auto px-4 py-8 space-y-6">
          {visibleMessages.map((m) => {
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
                    {m.parts.map((part: any, index: number) => {
                      if (part.type === 'text' && part.text) {
                        return (
                          <AssistantMessage
                            key={index}
                            text={part.text}
                            parts={[]}
                            usage={usageForMessage}
                            showActions={false}
                          />
                        );
                      }

                      if (part.type === 'file') {
                        return (
                          <AssistantMessage
                            key={index}
                            text=""
                            parts={[part]}
                            showActions={false}
                          />
                        );
                      }

                      if (isToolUIPart(part)) {
                        const toolPart = part as ToolUIPart<any> | DynamicToolUIPart;
                        const toolName = getToolName(toolPart);
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
        </div>
      </div>
    </div>
  );
}

