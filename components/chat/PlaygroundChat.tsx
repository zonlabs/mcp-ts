'use client';

import { useChat } from '@ai-sdk/react';
import { lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { DefaultChatTransport, getToolName, type ToolUIPart, type DynamicToolUIPart, isToolUIPart } from 'ai';
import { useRef, useEffect, useMemo, useState, useCallback, memo } from 'react';
import Image from 'next/image';
import { MCPConnectionApproval } from '@/components/chat/MCPConnectionApproval';
import { MCPToolApproval, MCPToolApprovalStatus } from '@/components/chat/MCPToolApproval';
import { ServerIcon } from '@/components/common/ServerIcon';
import { Button } from '@/components/ui/button';
import { ChatInput } from '@/components/chat/ChatInput';
import { UserMessage, AssistantMessage } from '@/components/chat/ChatMessage';
import { McpAppRenderer } from '@/components/chat/McpAppRenderer';
import { cn } from '@/lib/utils';
import { useMcpStore } from '@/lib/stores/mcp-store';
import { normalizeServerUrl } from '@/lib/url';
import { LoadingSpinner } from '@/components/chat/LoadingSpinner';
import { RecipeComponent } from '@/components/chat/RecipeComponent';
import {
  AlertCircle,
  ArrowUpRight,
  BrainIcon,
  CheckCircle2,
  ChevronDownIcon,
  X,
  Maximize2,
  MessageSquare,
  Code2,
  Plus,
  Clock,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { readGatewaySelectionsFromStorage } from '@/lib/gateway-access';
import { readAgentPreferencesFromStorage } from '@/lib/agent-preferences';
import { normalizeLlmConfig, readLlmConfigFromStorage } from '@/components/chat/llmConfig';
import type { McpAgentUIMessage } from '@/agent/chat-agent';
import { useI18n } from '@/lib/web-i18n';

import {
  Conversation,
  ConversationContent,
} from '@/components/ai-elements/conversation';
import { ToolCallSidebar } from '@/components/chat/ToolCallSidebar';
import {
  buildChainOfThoughtSummary,
  getNextSelectedThoughtMessageId,
  getThoughtSummaryLabel,
  hasVisibleReasoningText,
} from '@/components/chat/chain-of-thought-utils';

interface PlaygroundChatProps {
  chatId: string;
  initialMessages: McpAgentUIMessage[];
  initialDraft?: string;
  isReadOnly?: boolean;
}

interface MessageRowProps {
  m: McpAgentUIMessage;
  isLastMessage: boolean;
  onEdit: (id: string, text: string) => void;
  renderParts: (m: McpAgentUIMessage, isLast: boolean) => React.ReactNode;
}

const MessageRow = memo(function MessageRow({ m, isLastMessage, onEdit, renderParts }: MessageRowProps) {
  const text = m.parts
    .filter((p: any) => p.type === 'text')
    .map((p: any) => p.text)
    .join(' ');
  return (
    <div className={cn('group flex flex-col gap-3', m.role === 'user' ? 'items-end' : 'items-start')}>
      {m.role === 'user' ? (
        <UserMessage
          message={{ text }}
          parts={m.parts.filter((p: any) => p.type === 'file')}
          onEdit={(newText) => onEdit(m.id, newText)}
        />
      ) : (
        renderParts(m, isLastMessage)
      )}
    </div>
  );
}, (prev, next) => {
  if (prev.isLastMessage !== next.isLastMessage) return false;
  if (next.isLastMessage) return false;
  return (
    prev.m === next.m &&
    prev.onEdit === next.onEdit &&
    prev.renderParts === next.renderParts
  );
});

function ThoughtSummaryTrigger({
  isActive,
  isExpanded,
  isRunning,
  onClick,
}: {
  isActive: boolean;
  isExpanded: boolean;
  isRunning: boolean;
  onClick: () => void;
}) {
  const startTimeRef = useRef<number | null>(null);
  const elapsedMsRef = useRef(0);
  const [duration, setDuration] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (isRunning) {
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }
      const interval = window.setInterval(() => {
        const elapsedMs =
          elapsedMsRef.current +
          (startTimeRef.current === null ? 0 : Date.now() - startTimeRef.current);
        setDuration(Math.max(1, Math.ceil(elapsedMs / 1000)));
      }, 1000);

      return () => window.clearInterval(interval);
    } else if (startTimeRef.current !== null) {
      elapsedMsRef.current += Date.now() - startTimeRef.current;
      setDuration(Math.ceil(elapsedMsRef.current / 1000));
      startTimeRef.current = null;
    }
  }, [isRunning]);

  return (
    <div className="mb-2 flex max-w-full items-center gap-3 text-sm">
      <button
        type="button"
        onClick={onClick}
        aria-expanded={isExpanded}
        className={cn(
          'inline-flex min-w-0 items-center gap-2 text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:text-foreground',
          (isExpanded || isActive) && 'text-foreground'
        )}
      >
        <BrainIcon className={cn('size-4 shrink-0', (isActive || isExpanded) && 'text-primary')} />
        <span className="truncate">{getThoughtSummaryLabel(duration, isRunning)}</span>
        <ChevronDownIcon
          className={cn(
            'size-4 shrink-0 transition-transform',
            isExpanded && 'rotate-180'
          )}
        />
      </button>
    </div>
  );
}

function MessageThoughtSection({
  chainOfThought,
  isActive,
  isStreaming,
  isOpen,
  onToggle,
}: {
  chainOfThought: ReturnType<typeof buildChainOfThoughtSummary>;
  isActive: boolean;
  isStreaming: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <ThoughtSummaryTrigger
        isActive={isActive}
        isExpanded={isOpen}
        isRunning={isStreaming || isActive}
        onClick={onToggle}
      />
      {isOpen && hasVisibleReasoningText(chainOfThought.reasoningText) && (
        <div className="mb-3 whitespace-pre-wrap text-[15px] leading-7 text-muted-foreground/90">
          {chainOfThought.reasoningText}
        </div>
      )}
    </>
  );
}
function MCPConnectionApprovedStatus({ input }: { input: any }) {
  const { t } = useI18n();
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
            {input.serverName || t("mcpServer")}
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

export function PlaygroundChat({ 
  chatId, 
  initialMessages, 
  initialDraft,
  isReadOnly = false 
}: PlaygroundChatProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [chatInput, setChatInput] = useState("");
  const [activeMcpApp, setActiveMcpApp] = useState<{
    name: string;
    args: Record<string, unknown> | undefined;
    result: unknown;
    status: 'complete' | 'executing';
  } | null>(null);

  const [selectedThoughtMessageId, setSelectedThoughtMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasSentInitialDraft = useRef(false);
  const pendingDraftRef = useRef<{ text?: string; parts?: any[] } | null>(null);
  const lastTitleRef = useRef<string | null>(null);

  const chatContentWidthClass = "w-full max-w-2xl mx-auto px-4 sm:px-6";
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
      label: t("recipeGithubIssueSummary"),
      prompt: 'Use GitHub to retrieve the latest open issues for this repository and summarize the most critical bugs.',
      icon: 'https://logos.composio.dev/api/github',
    },
    {
      label: t("recipeSemanticSearch"),
      prompt: 'Search the web using Exa to find the latest research papers on LLM optimization from the past month.',
      icon: 'https://awsmp-logos.s3.amazonaws.com/seller-7s5a3z2w3unay/b6519f9126c0432087c79827b95283c6.png',
    },
    {
      label: 'Draft Follow-Up Email',
      prompt: 'Draft a clear, professional follow-up email using composio mcp to get access to Gmail. Infer an appropriate subject line and message content from the available context. The email should be concise, polite, and ready for review',
      icon: 'https://logos.composio.dev/api/gmail',
    },
    {
      label: t("recipeNotionMeetingPrep"),
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
        const agentPreferences = readAgentPreferencesFromStorage();

        return {
          body: {
            messages: chatMessages,
            ...(body ?? {}),
            llmConfig: currentConfig,
            agentPreferences: {
              timezone: agentPreferences.timezone,
              toolApprovalMode: agentPreferences.toolApprovalMode,
            },
            chatId,
            gatewaySelections: readGatewaySelectionsFromStorage(),
          },
        };
      },
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  const notifyChatUpdated = () => {
    window.dispatchEvent(new CustomEvent('chat:updated', {
      detail: { chatId, updatedAt: new Date().toISOString() },
    }));
  };

  const sendChatInput = (data: { text?: string; parts?: any[] }) => {
    if (status !== 'ready') return;
    const currentConfig = getCurrentLlmConfig();
    notifyChatUpdated();
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
      window.dispatchEvent(new CustomEvent('chat:updated', {
        detail: { chatId, title },
      }));
      return;
    }
  }, [messages, chatId]);

  useEffect(() => {
    if (status === 'ready' && messages.length > 0) {
      window.dispatchEvent(new CustomEvent('chat:updated', { detail: { chatId } }));
    }
  }, [status, messages.length, chatId]);

  const contextUsage = useMemo(
    () => [...messages].reverse().find((m: any) => m?.role === 'assistant' && m?.metadata?.usage)?.metadata?.usage,
    [messages]
  );

  const getChainOfThoughtForMessage = useCallback((message: McpAgentUIMessage, isLastMessage: boolean) => {
    return buildChainOfThoughtSummary(message.parts, {
      getToolName: (part) => {
        const toolPart = part as any;
        if (!isToolUIPart(toolPart)) return undefined;
        return getToolName(toolPart as ToolUIPart<any> | DynamicToolUIPart);
      },
      isLastMessage,
      status,
    });
  }, [status]);

  const selectedThoughtSummary = useMemo(() => {
    if (!selectedThoughtMessageId) return null;
    const messageIndex = messages.findIndex((message) => message.id === selectedThoughtMessageId);
    if (messageIndex === -1) return null;

    const message = messages[messageIndex];
    const summary = getChainOfThoughtForMessage(message, messageIndex === messages.length - 1);
    return summary.hasChainOfThought ? summary : null;
  }, [getChainOfThoughtForMessage, messages, selectedThoughtMessageId]);

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
    notifyChatUpdated();
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

    setMessages(updatedMessages as McpAgentUIMessage[]);

    const currentConfig = getCurrentLlmConfig();
    notifyChatUpdated();
    regenerate({
      body: { 
        llmConfig: currentConfig,
        action: 'edit-message'
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReadOnly, messages, setMessages, regenerate]);

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
    const lastPart = m.parts[m.parts.length - 1] as any | undefined;
    const chainOfThought = getChainOfThoughtForMessage(m, isLastMessage);

    const lastTextIndex = m.parts
      .map((p: any, idx: number) => (p?.type === 'text' && p.text ? idx : -1))
      .filter((idx: number) => idx !== -1)
      .pop();

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
            isOpen={selectedThoughtMessageId === m.id}
            onToggle={() => setSelectedThoughtMessageId((current) => getNextSelectedThoughtMessageId(current, m.id))}
          />
        )}
        {m.parts.map((part: any, index: number) => {
          if (part.type === 'reasoning') {
            return null;
          }

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
            const isMcpExecuteTool = toolName === 'mcp_execute_tool';

            if (isMcpExecuteTool) {
              const input = toolPart.input as Record<string, unknown>;

              if (toolPart.state === 'approval-requested') {
                return (
                  <div key={`tool-${index}`} className="w-full">
                    <MCPToolApproval
                      input={input || {}}
                      onApprove={() => {
                        notifyChatUpdated();
                        if (approvalId && addToolApprovalResponse) {
                          addToolApprovalResponse({
                            id: approvalId,
                            approved: true,
                          });
                        }
                      }}
                      onDeny={() => {
                        notifyChatUpdated();
                        approvalId &&
                          addToolApprovalResponse?.({
                            id: approvalId,
                            approved: false,
                            reason: t("userDeniedMcpToolRequest"),
                          });
                      }}
                    />
                  </div>
                );
              }

              if (toolPart.state === 'approval-responded') {
                return (
                  <MCPToolApprovalStatus
                    key={`tool-${index}`}
                    approved={toolPart.approval?.approved === true}
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
              const hasResultPart = toolPart.toolCallId && m.parts.some(
                (p: any) => p.toolCallId === toolPart.toolCallId && p.state === 'output-available'
              );

              // 1. If this is the call part (input-streaming / input-available)
              const isCallPart = toolPart.state === 'input-streaming' || toolPart.state === 'input-available';
              if (isCallPart) {
                // If the execution is already complete, let the output part render it.
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
                    <button
                      type="button"
                      onClick={() => setActiveMcpApp({
                        name: actualToolName,
                        args: actualArgs,
                        result: undefined,
                        status: 'executing',
                      })}
                      className="absolute top-2 right-2 opacity-0 group-hover/app:opacity-100 p-1.5 rounded-md bg-background/80 hover:bg-background border shadow text-muted-foreground hover:text-foreground transition-all duration-200 z-10 animate-in fade-in"
                      title="Expand to full view"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              }

              // 2. If this is the result part (output-available)
              const isResultPart = toolPart.state === 'output-available';
              if (isResultPart) {
                // Look up the input from the matching call part
                const callPart = toolPart.toolCallId
                  ? (m.parts.find((p: any) => p.toolCallId === toolPart.toolCallId && p.input) as any)
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
                    <button
                      type="button"
                      onClick={() => setActiveMcpApp({
                        name: actualToolName,
                        args: actualArgs,
                        result: toolPart.output,
                        status: 'complete',
                      })}
                      className="absolute top-2 right-2 opacity-0 group-hover/app:opacity-100 p-1.5 rounded-md bg-background/80 hover:bg-background border shadow text-muted-foreground hover:text-foreground transition-all duration-200 z-10 animate-in fade-in"
                      title="Expand to full view"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </button>
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
                      serverName={input.serverName || ''}
                      serverUrl={input.serverUrl || ''}
                      serverId={input.serverId || ''}
                      transportType={input.transportType || 'sse'}
                      approvalId={approvalId || ''}
                      onApprove={() => {
                        notifyChatUpdated();
                        if (approvalId && addToolApprovalResponse) {
                          addToolApprovalResponse({
                            id: approvalId,
                            approved: true,
                          });
                        }
                      }}
                      onDeny={() => {
                        notifyChatUpdated();
                        approvalId &&
                          addToolApprovalResponse?.({
                            id: approvalId,
                            approved: false,
                            reason: t("userDeniedConnectionRequest"),
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
  };

  return (
    <div className="flex flex-col h-full w-full flex-1 min-h-0 min-w-0 bg-background">
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
                <p className="mb-2 px-1 text-[10px] font-instrument-serif font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
                  {t("quickActions")}
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

          <div className="hidden sm:flex flex-1 min-h-0 flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
            <div className="w-full max-w-3xl mx-auto space-y-7 animate-in fade-in zoom-in-95 duration-500">
              <div className="text-center">
                <h1 className="text-4xl md:text-5xl font-sans font-normal tracking-[-1.5px] text-foreground leading-tight">
                  {t("chatHeroTitle")}
                </h1>
              </div>

              {isReadOnly ? (
                <div className="w-full text-center p-4 text-sm text-muted-foreground bg-secondary/50 rounded-lg border border-border/50 backdrop-blur-sm">
                  {t("readOnlySharedChat")}
                </div>
              ) : (
                <ChatInput
                  input={chatInput}
                  onInputChange={setChatInput}
                  onSend={sendChatInput}
                  onStop={stop}
                  status={status}
                  disabled={status === 'submitted' || status === 'streaming'}
                  contextUsage={contextUsage}
                />
              )}

              <div className="w-full px-1">
                <RecipeComponent
                  onAction={(prompt) => setChatInput(prompt)}
                />
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="relative flex flex-1 min-h-0 min-w-0 overflow-hidden">
          <div className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col relative",
            selectedThoughtSummary && "lg:basis-0"
          )}>
            {activeMcpApp ? (
              <div className="flex-1 min-h-0 w-full relative bg-background z-10 flex flex-col items-center justify-center p-4">
                <button
                  type="button"
                  onClick={() => setActiveMcpApp(null)}
                  className="absolute top-4 right-4 p-2 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground transition-colors z-20"
                  aria-label="Minimize app"
                >
                  <X className="h-6 w-6" />
                </button>
                <McpAppRenderer
                  name={activeMcpApp.name}
                  args={activeMcpApp.args}
                  result={activeMcpApp.result}
                  status={activeMcpApp.status}
                  className="w-full h-full !border-0 !my-0 !rounded-none !bg-background"
                />
              </div>
            ) : (
              <Conversation className="flex-1 min-h-0 w-full">
                <ConversationContent>
                  <div className={cn(chatContentWidthClass, "py-4 sm:py-8")}>
                  {messages.map((m, index) => {
                    const isLastMessage = index === messages.length - 1;
                    return (
                      <MessageRow
                        key={m.id}
                        m={m}
                        isLastMessage={isLastMessage}
                        onEdit={handleEditMessage}
                        renderParts={renderMessageParts}
                      />
                    );
                  })}

                  {(status === 'streaming' || status === 'submitted') && (
                    <div className="flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="p-1"><LoadingSpinner /></div>
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
          {selectedThoughtSummary && (
            <div className="hidden h-full w-[380px] shrink-0 lg:block">
              <ToolCallSidebar
                toolSteps={selectedThoughtSummary.toolSteps}
                onClose={() => setSelectedThoughtMessageId(null)}
              />
            </div>
          )}
          {selectedThoughtSummary && (
            <div className="absolute inset-y-0 right-0 z-20 flex w-full justify-end bg-background/60 backdrop-blur-sm lg:hidden">
              <button
                type="button"
                aria-label="Close thoughts panel"
                className="flex-1"
                onClick={() => setSelectedThoughtMessageId(null)}
              />
              <div className="w-full max-w-sm border-l border-border/70 shadow-2xl">
                <ToolCallSidebar
                  toolSteps={selectedThoughtSummary.toolSteps}
                  onClose={() => setSelectedThoughtMessageId(null)}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
