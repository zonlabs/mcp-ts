"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type DynamicToolUIPart,
  type ToolUIPart,
  type UIMessage,
} from "ai";
import type { McpAgentUIMessage } from "@/app/agent/agent";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { RiRobot2Line } from "react-icons/ri";
import type { ComponentType } from "react";
import { McpAppRenderer, getMcpAppMetadata, type McpClient } from "@mcp-ts/sdk/client/react";
import {
  AlertTriangleIcon,
  CheckIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  XIcon,
} from "lucide-react";

/** True once the latest assistant turn has something to render (text or tool UI). */
function assistantShowsProgress(m: UIMessage | undefined): boolean {
  if (!m || m.role !== "assistant") return false;
  const parts = m.parts ?? [];
  for (const p of parts) {
    if (p.type === "text") {
      if (String((p as { text?: string }).text ?? "").trim().length > 0) {
        return true;
      }
    } else if (isToolUIPart(p)) {
      return true;
    }
  }
  return false;
}

interface HomeChatProps {
  className?: string;
  mcpClient?: McpClient | null;
}

export default function HomeChat({
  className,
  mcpClient,
}: HomeChatProps) {
  const {
    error,
    status,
    sendMessage,
    messages,
    regenerate,
    stop,
    addToolApprovalResponse,
  } = useChat<McpAgentUIMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    // Automatically re-send when the user has responded to all approval requests
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  const isGenerating = status === "submitted" || status === "streaming";
  const last = messages[messages.length - 1];
  const showThinking = isGenerating && !assistantShowsProgress(last);

  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col bg-background", className)}
    >
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 sm:px-6">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<RiRobot2Line className="size-10 opacity-50" />}
              title="Chat with HITL"
              description="Connect MCP servers in the sidebar, then ask anything. Destructive tool calls will require your approval before executing."
            />
          ) : null}

          {messages.map((m) => (
            <Message key={m.id} from={m.role}>
              <MessageContent>
                {m.parts?.map((part, index) => {
                  if (part.type === "text") {
                    return (
                      <MessageResponse key={index}>{part.text}</MessageResponse>
                    );
                  }

                  if (part.type === "step-start") {
                    return index > 0 ? (
                      <div
                        key={index}
                        className="my-2 border-t border-border"
                      />
                    ) : null;
                  }

                  if (isToolUIPart(part)) {
                    const toolPart = part as ToolUIPart | DynamicToolUIPart;
                    const frameToolName = getToolName(toolPart);
                    const title = toolPart.title || frameToolName;
                    const input = toolPart.input as Record<string, unknown> | null | undefined;

                    // ── Handle HITL approval states ──────────────────────
                    const isProxyCall = frameToolName === "mcp_execute_tool";
                    const targetToolName = isProxyCall
                      ? String((input as any)?.toolName ?? "")
                      : frameToolName;

                    // Try to find the tool in the connected MCP client to show annotations
                    let targetToolInfo;
                    const targetServerId = isProxyCall ? String((input as any)?.serverId ?? "") : "";

                    if (targetServerId) {
                      const targetConnection = mcpClient?.connections.find(
                        c => c.serverId === targetServerId || c.serverName === targetServerId
                      );
                      targetToolInfo = targetConnection?.tools.find(t => t.name === targetToolName);
                    }

                    if (!targetToolInfo) {
                      targetToolInfo = mcpClient?.connections.flatMap(c => c.tools).find(t => t.name === targetToolName);
                    }

                    const annotations = (targetToolInfo as any)?.annotations;

                    if (toolPart.state === "approval-requested") {
                      const approval = (toolPart as any).approval;
                      // Auto-approved tools just show a spinner
                      if (approval?.isAutomatic) {
                        return (
                          <Tool key={index}>
                            {toolPart.type === "dynamic-tool" ? (
                              <ToolHeader
                                type="dynamic-tool"
                                state={toolPart.state}
                                toolName={frameToolName}
                                title={title}
                                annotations={annotations}
                              />
                            ) : (
                              <ToolHeader
                                type={toolPart.type}
                                state={toolPart.state}
                                title={title}
                                annotations={annotations}
                              />
                            )}
                            <ToolContent>
                              <div className="flex items-center gap-2 px-1 py-2 text-sm text-muted-foreground">
                                <Spinner className="size-4" />
                                <span>Auto-approving…</span>
                              </div>
                            </ToolContent>
                          </Tool>
                        );
                      }

                      // ── Manual approval required ─────────────────────
                      // If this is mcp_execute_tool, unwrap the target tool name
                      const isProxyCall = frameToolName === "mcp_execute_tool";
                      const targetToolName = isProxyCall
                        ? String((input as any)?.toolName ?? "")
                        : "";
                      const displayName = isProxyCall && targetToolName
                        ? targetToolName
                        : title;

                      return (
                        <div key={index} className="mb-4">
                          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
                            {/* Header */}
                            <div className="flex items-center gap-2.5 border-b border-amber-500/20 bg-amber-500/10 px-4 py-3">
                              <ShieldAlertIcon className="size-5 text-amber-500 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground">
                                  Approval Required
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {displayName}
                                  {isProxyCall && targetToolName ? (
                                    <span className="ml-1 opacity-50">
                                      via mcp_execute_tool
                                    </span>
                                  ) : null}
                                </p>
                              </div>
                              <Badge variant="secondary" className="rounded-full text-[10px] uppercase tracking-wider bg-amber-500/15 text-amber-500 border-amber-500/30">
                                Requires Approval
                              </Badge>
                            </div>

                            {/* Input preview */}
                            {input != null ? (
                              <div className="px-4 py-3 border-b border-amber-500/10">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                                  Parameters
                                </p>
                                <pre className="text-xs bg-muted/50 rounded-md p-2.5 overflow-x-auto text-foreground/80 leading-relaxed max-h-40 overflow-y-auto">
                                  {JSON.stringify(input, null, 2)}
                                </pre>
                              </div>
                            ) : null}

                            {/* Action buttons */}
                            <div className="flex items-center justify-end gap-2 px-4 py-3">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                                onClick={() =>
                                  addToolApprovalResponse({
                                    id: approval.id,
                                    approved: false,
                                  })
                                }
                              >
                                <XIcon className="size-3.5" />
                                Deny
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white"
                                onClick={() =>
                                  addToolApprovalResponse({
                                    id: approval.id,
                                    approved: true,
                                  })
                                }
                              >
                                <CheckIcon className="size-3.5" />
                                Approve
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // ── Approval responded (approved/denied) ────────────
                    if (toolPart.state === "approval-responded") {
                      const approval = (toolPart as any).approval;
                      const approved = approval?.approved;
                      return (
                        <div key={index} className="mb-4">
                          <div className={cn(
                            "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                            approved
                              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400"
                              : "border-red-500/30 bg-red-500/5 text-red-400"
                          )}>
                            {approved ? (
                              <ShieldCheckIcon className="size-4 shrink-0" />
                            ) : (
                              <AlertTriangleIcon className="size-4 shrink-0" />
                            )}
                            <span className="font-medium">{title}</span>
                            <span className="text-muted-foreground">—</span>
                            <span>{approved ? "Approved" : "Denied"}</span>
                            {approval?.reason ? (
                              <span className="text-muted-foreground text-xs ml-1">
                                ({approval.reason})
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    }

                    // ── Denied output ────────────────────────────────────
                    if (toolPart.state === "output-denied") {
                      const approval = (toolPart as any).approval;
                      return (
                        <div key={index} className="mb-4">
                          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-400">
                            <XIcon className="size-4 shrink-0" />
                            <span className="font-medium">{title}</span>
                            <span className="text-muted-foreground">—</span>
                            <span>Execution denied by user</span>
                            {approval?.reason ? (
                              <span className="text-muted-foreground text-xs ml-1">
                                ({approval.reason})
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    }

                    // ── Normal tool rendering (existing logic) ───────────
                    const metadata = getMcpAppMetadata(mcpClient || null, frameToolName, input);
                    const hasApp = !!metadata;
                    const resolvedToolName = metadata ? metadata.toolName : frameToolName;

                    const appStatus =
                      toolPart.state === "input-streaming" || toolPart.state === "input-available"
                        ? "executing"
                        : toolPart.state === "output-available"
                        ? "complete"
                        : "idle";

                    if (toolPart.type === "dynamic-tool") {
                      return (
                        <div key={index} className="space-y-3">
                          <Tool>
                            <ToolHeader
                              type="dynamic-tool"
                              state={toolPart.state}
                              toolName={frameToolName}
                              title={title}
                              annotations={annotations}
                            />
                            <ToolContent>
                              {input != null ? (
                                <ToolInput input={input} />
                              ) : null}
                              <ToolOutput
                                errorText={toolPart.errorText}
                                output={toolPart.output}
                              />
                            </ToolContent>
                          </Tool>

                          {hasApp && resolvedToolName ? (
                            /* ── Inline MCP App iframe ── */
                            <McpAppRenderer
                              client={mcpClient}
                              name={frameToolName}
                              sandbox={{ url: "/sandbox_proxy.html" }}
                              input={input}
                              result={toolPart.output}
                              status={appStatus}
                              className="min-h-[420px] w-full"
                              loader={
                                <div className="flex flex-col items-center gap-2 py-8">
                                  <Spinner className="size-6 text-primary" />
                                  <span className="text-xs text-muted-foreground">
                                    Loading interactive app…
                                  </span>
                                </div>
                              }
                            />
                          ) : null}
                        </div>
                      );
                    }

                    return (
                      <div key={index} className="space-y-3">
                        <Tool>
                          <ToolHeader
                            type={toolPart.type}
                            state={toolPart.state}
                            title={title}
                            annotations={annotations}
                          />
                          <ToolContent>
                            {input != null ? (
                              <ToolInput input={input} />
                            ) : null}
                            <ToolOutput
                              errorText={toolPart.errorText}
                              output={toolPart.output}
                            />
                          </ToolContent>
                        </Tool>
                        
                        {hasApp && resolvedToolName ? (
                          /* ── Inline MCP App iframe ── */
                          <McpAppRenderer
                            client={mcpClient}
                            name={frameToolName}
                            sandbox={{ url: "/sandbox_proxy.html" }}
                            input={input}
                            result={toolPart.output}
                            status={appStatus}
                            className="min-h-[420px] w-full"
                            loader={
                              <div className="flex flex-col items-center gap-2 py-8">
                                <Spinner className="size-6 text-primary" />
                                <span className="text-xs text-muted-foreground">
                                  Loading interactive app…
                                </span>
                              </div>
                            }
                          />
                        ) : null}
                      </div>
                    );
                  }

                  return null;
                })}
              </MessageContent>
            </Message>
          ))}

          {showThinking ? (
            <Message from="assistant">
              <MessageContent className="flex flex-row flex-wrap items-center gap-3">
                <Spinner className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground text-sm">
                  {status === "submitted"
                    ? "Thinking…"
                    : "Responding…"}
                </span>
              </MessageContent>
            </Message>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
              <p className="font-medium text-destructive">{error.message}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => regenerate()}
              >
                Retry
              </Button>
            </div>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="shrink-0 border-t border-border bg-background py-3">
        <PromptInput
          onSubmit={({ text, files }) => {
            const parts: Array<
              | { type: "text"; text: string }
              | { type: "file"; mediaType: string; url: string }
            > = [];

            const trimmed = text.trim();
            if (trimmed) {
              parts.push({ type: "text", text: trimmed });
            }

            for (const f of files) {
              parts.push({
                type: "file",
                mediaType: f.mediaType,
                url: f.url,
              });
            }

            if (!parts.length) {
              return;
            }

            void sendMessage({ parts } as never);
          }}
        >
          <PromptInputTextarea placeholder="Message the assistant…" />
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger tooltip="Add attachments" />
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments />
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
            </PromptInputTools>
            <PromptInputSubmit status={status} onStop={stop} />
          </PromptInputFooter>
        </PromptInput>
      </div>
      </div>
    </div>
  );
}
