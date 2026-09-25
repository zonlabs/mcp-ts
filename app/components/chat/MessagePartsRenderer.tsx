'use client';

import React, { memo } from 'react';
import { AlertCircle, CheckCircle2, Maximize2 } from 'lucide-react';
import { isToolUIPart, getToolName, type ToolUIPart, type DynamicToolUIPart } from 'ai';
import { AssistantMessage } from '@/components/chat/ChatMessage';
import { MCPConnectionApproval } from '@/components/chat/MCPConnectionApproval';
import { MCPToolApproval, MCPToolApprovalStatus } from '@/components/chat/MCPToolApproval';
import { McpAppRenderer } from '@/components/chat/McpAppRenderer';
import { ServerIcon } from '@/components/common/ServerIcon';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { MessageThoughtSection } from '@/components/chat/MessageThoughtSection';
import type { ActiveMcpApp } from '@/components/chat/ActiveMcpAppOverlay';
import { buildChainOfThoughtSummary } from '@/components/chat/chain-of-thought-utils';
import { useI18n } from '@/lib/web-i18n';
import { useMcpContext } from '@/components/providers/McpProvider';
import { findConnectionForServer } from '@/lib/mcp/connection-utils';
import { cn } from '@/lib/utils';
import type { ChatUIMessage } from '@/agent/chat-agent';

function MCPConnectionApprovedStatus({ input }: { input: any }) {
  const { t } = useI18n();
  const { connections } = useMcpContext();
  const existingConnection = findConnectionForServer(connections, { id: input?.serverId, url: input?.serverUrl });

  const connectionStatus = existingConnection?.state;
  const isReady = connectionStatus === 'READY';
  const isFailed = connectionStatus === 'FAILED' || connectionStatus === 'DISCONNECTED';

  return (
    <div className="w-full max-w-none sm:max-w-2xl flex flex-col gap-2 p-2 sm:p-3 bg-background rounded-lg">
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <ServerIcon
          serverName={input?.serverName || ''}
          serverUrl={input?.serverUrl || ''}
          size={30}
          className="rounded-lg flex-shrink-0"
        />
        <div className="min-w-0 flex-1">
          <span className="truncate block text-[15px] sm:text-base font-semibold text-foreground leading-tight">
            {input?.serverName || t("mcpServer")}
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
          <span>{isReady ? t("connected") : isFailed ? t("connectionFailed") : t("connecting")}</span>
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
          ? t("connectionReady")
          : isFailed
            ? t("connectionNotReady")
            : t("waitingForConnectionReady")}
      </p>
    </div>
  );
}

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

  const lastPart = message.parts[message.parts.length - 1] as any | undefined;
  const chainOfThought = buildChainOfThoughtSummary(message.parts, {
    getToolName: (part) => {
      const toolPart = part as any;
      if (!isToolUIPart(toolPart)) return undefined;
      return getToolName(toolPart as ToolUIPart<any> | DynamicToolUIPart);
    },
    isLastMessage,
    status,
  });

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

  const isCoTActive = (
    (isLastMessage && status === 'streaming' && lastPart?.type === 'reasoning') ||
    chainOfThought.toolSteps.some(step => step.status === 'active')
  );

  return (
    <>
      {chainOfThought.hasChainOfThought && (
        <MessageThoughtSection
          chainOfThought={chainOfThought}
          isActive={isCoTActive}
          isStreaming={isLastMessage && status === 'streaming' && lastPart?.type === 'reasoning'}
          isOpen={isThoughtOpen}
          onToggle={onToggleThought}
        />
      )}
      {message.parts.map((part: any, index: number) => {
        if (part.type === 'reasoning') {
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

          const isInitiateConn = toolName === 'MCPASSISTANT_INITIATE_CONNECTION' || toolName?.includes('INITIATE_CONNECTION');
          const isMcpExecuteTool = toolName === 'mcp_execute_tool';

          if (isMcpExecuteTool) {
            const input = toolPart.input as Record<string, unknown>;

            if (toolPart.state === 'approval-requested') {
              return (
                <div key={`tool-${index}`} className="w-full">
                  <MCPToolApproval
                    input={input || {}}
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

            if (toolPart.state === 'approval-responded') {
              if (toolPart.approval?.approved === true) {
                return null;
              }
              return (
                <MCPToolApprovalStatus
                  key={`tool-${index}`}
                  approved={false}
                  reason={toolPart.approval?.reason}
                />
              );
            }

            if (toolPart.state === 'output-denied') {
              return (
                <MCPToolApprovalStatus
                  key={`tool-${index}`}
                  approved={false}
                  reason={t("mcpToolRequestDenied")}
                />
              );
            }

            // Find if there is a corresponding result part in the message to avoid duplicate renders
            const hasResultPart = toolPart.toolCallId && message.parts.some(
              (p: any) => p.toolCallId === toolPart.toolCallId && p.state === 'output-available'
            );

            // 1. If this is the call part (input-streaming / input-available)
            const isCallPart = toolPart.state === 'input-streaming' || toolPart.state === 'input-available';
            if (isCallPart) {
              if (hasResultPart) {
                return null;
              }

              const actualToolName = typeof input?.toolName === 'string' ? input.toolName : '';
              const actualArgs = input?.args && typeof input.args === 'object' ? (input.args as Record<string, unknown>) : undefined;
              return (
                <div key={`mcp-app-executing-${index}`} className="relative group/app w-full my-2">
                  <McpAppRenderer
                    name={actualToolName}
                    args={actualArgs}
                    result={undefined}
                    status="executing"
                  />
                  <SimpleTooltip content="Expand to full view" side="left">
                    <button
                      type="button"
                      onClick={() => onExpandMcpApp({
                        name: actualToolName,
                        args: actualArgs,
                        result: undefined,
                        status: 'executing',
                      })}
                      className="absolute top-2 right-2 opacity-0 group-hover/app:opacity-100 p-1.5 rounded-md bg-background/80 hover:bg-background border shadow text-muted-foreground hover:text-foreground transition-all duration-200 z-10 animate-in fade-in cursor-pointer"
                      aria-label="Expand to full view"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </button>
                  </SimpleTooltip>
                </div>
              );
            }

            // 2. If this is the result part (output-available)
            const isResultPart = toolPart.state === 'output-available';
            if (isResultPart) {
              const callPart = toolPart.toolCallId
                ? (message.parts.find((p: any) => p.toolCallId === toolPart.toolCallId && p.input) as any)
                : undefined;
              const callInput = callPart?.input;
              const actualToolName = typeof callInput?.toolName === 'string' ? callInput.toolName : '';
              const actualArgs = callInput?.args && typeof callInput.args === 'object' ? (callInput.args as Record<string, unknown>) : undefined;

              return (
                <div key={`mcp-app-complete-${index}`} className="relative group/app w-full my-2">
                  <McpAppRenderer
                    name={actualToolName}
                    args={actualArgs}
                    result={toolPart.output}
                    status="complete"
                  />
                  <SimpleTooltip content="Expand to full view" side="left">
                    <button
                      type="button"
                      onClick={() => onExpandMcpApp({
                        name: actualToolName,
                        args: actualArgs,
                        result: toolPart.output,
                        status: 'complete',
                      })}
                      className="absolute top-2 right-2 opacity-0 group-hover/app:opacity-100 p-1.5 rounded-md bg-background/80 hover:bg-background border shadow text-muted-foreground hover:text-foreground transition-all duration-200 z-10 animate-in fade-in cursor-pointer"
                      aria-label="Expand to full view"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </button>
                  </SimpleTooltip>
                </div>
              );
            }
          }

          if (isInitiateConn) {
            const input = toolPart.input as any;

            if (toolPart.state === 'approval-requested') {
              return (
                <div key={`tool-${index}`} className="w-full">
                  <MCPConnectionApproval
                    serverName={input?.serverName || ''}
                    serverUrl={input?.serverUrl || ''}
                    serverId={input?.serverId || ''}
                    transportType={input?.transportType || 'sse'}
                    approvalId={approvalId || ''}
                    onApprove={() => {
                      if (approvalId) onApproveTool(approvalId);
                    }}
                    onDeny={() => {
                      if (approvalId) onDenyTool(approvalId, t("userDeniedConnectionRequest"));
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
                  <span className="font-medium">{t("connectionRequestCancelled")}</span>
                </div>
              );
            }

            if (toolPart.state === 'output-available') {
              return null;
            }

            if (toolPart.state === 'output-error') {
              return (
                <div
                  key={`tool-${index}`}
                  className="w-full inline-flex items-center gap-2 text-xs text-red-600 dark:text-red-400"
                >
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span className="font-medium">
                    {t("connectionToolFailed")}{toolPart.errorText ? `: ${toolPart.errorText}` : '.'}
                  </span>
                </div>
              );
            }

            return null;
          }

          return null;
        }

        return null;
      })}
    </>
  );
});
