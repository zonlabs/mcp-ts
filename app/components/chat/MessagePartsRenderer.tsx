'use client';

import React, { memo } from 'react';
import { isToolUIPart, getToolName, type ToolUIPart, type DynamicToolUIPart } from 'ai';
import { AssistantMessage } from '@/components/chat/ChatMessage';
import { MCPToolApproval } from '@/components/chat/MCPToolApproval';
import { WorkedTimelineSection } from '@/components/chat/WorkedTimelineSection';
import { buildExecutionTimeline } from '@/components/chat/execution-timeline-utils';
import type { ActiveMcpApp } from '@/components/chat/ActiveMcpAppOverlay';
import { useI18n } from '@/lib/web-i18n';
import { cn } from '@/lib/utils';
import type { ChatUIMessage } from '@/agent/chat-agent';


export interface MessagePartsRendererProps {
  message: ChatUIMessage;
  isLastMessage: boolean;
  status: 'ready' | 'submitted' | 'streaming' | 'error';
  allMessages: ChatUIMessage[];
  isThoughtOpen: boolean;
  onToggleThought: () => void;
  onRegenerate: () => void;
  onApproveTool: (approvalId: string) => void;
  onDenyTool: (approvalId: string, reason: string) => void;
  onExpandMcpApp: (app: ActiveMcpApp) => void;
}

export const MessagePartsRenderer = memo(function MessagePartsRenderer({
  message,
  isLastMessage,
  status,
  allMessages,
  isThoughtOpen,
  onToggleThought,
  onRegenerate,
  onApproveTool,
  onDenyTool,
  onExpandMcpApp,
}: MessagePartsRendererProps) {
  const { t } = useI18n();

  const timelineTasks = React.useMemo(
    () => buildExecutionTimeline(message.parts, message.metadata?.mcp),
    [message.parts, message.metadata]
  );
  const reasoningText = React.useMemo(() => {
    return message.parts
      .filter((p: any) => p.type === 'reasoning' && p.text)
      .map((p: any) => p.text)
      .join('\n\n');
  }, [message.parts]);

  const lastTextIndex = message.parts
    .map((p: any, idx: number) => (p?.type === 'text' && p.text ? idx : -1))
    .filter((idx: number) => idx !== -1)
    .pop();

  const isChatGenerating = status === 'streaming' || status === 'submitted';

  const hasActiveToolOrApproval = message.parts.some((p: any) =>
    p?.state === 'approval-requested' ||
    p?.state === 'input-streaming' ||
    p?.state === 'input-available'
  );

  const isHumanInTheLoopPaused = allMessages.some((msg) =>
    msg.parts.some((p: any) => p?.state === 'approval-requested')
  );

  const isMessageInProgress =
    (isLastMessage && (isChatGenerating || isHumanInTheLoopPaused)) ||
    hasActiveToolOrApproval;

  return (
    <>
      <WorkedTimelineSection
        tasks={timelineTasks}
        reasoningText={reasoningText}
        isStreaming={isLastMessage && isChatGenerating}
        persistedDuration={message?.metadata?.durationSeconds}
        isOpen={isThoughtOpen}
        onToggle={onToggleThought}
      />
      {message.parts.map((part: any, index: number) => {
        if (part.type === 'reasoning') {
          return null;
        }

        // Ignore source parts in chat stream
        if (part.type === 'source-url' || part.type === 'source-document') {
          return null;
        }

        if (part.type === 'text' && part.text) {
          return (
            <AssistantMessage
              key={`text-${index}`}
              text={part.text}
              parts={[]}
              onRegenerate={onRegenerate}
              usage={message?.metadata?.usage}
              model={message?.metadata?.model}
              metadata={message?.metadata}
              showActions={index === lastTextIndex && !isMessageInProgress}
              isStreaming={isMessageInProgress}
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

          // Handle human-in-the-loop tool approval for any tool
          if (toolPart.state === 'approval-requested') {
            const input = (toolPart.input || {}) as Record<string, unknown>;
            // mcp info is injected server-side into message.metadata.mcp
            const mcp = message.metadata?.mcp?.[toolName];

            return (
              <div key={`tool-approval-${index}`} className="w-full my-2">
                <MCPToolApproval
                  toolName={toolName}
                  input={input}
                  mcp={mcp}
                  onApprove={() => {
                    if (approvalId) onApproveTool(approvalId);
                  }}
                  onDeny={() => {
                    if (approvalId) onDenyTool(approvalId, t("userDeniedMcpToolRequest"));
                  }}
                />
              </div>
            );
          }

          // Responded, completed, and denied tools are rendered inside WorkedTimelineSection
          return null;
        }

        return null;
      })}
    </>
  );
});
