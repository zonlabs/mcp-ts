"use client";

import { XCircle, Wrench, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ai-elements/code-block";
import { useState } from "react";
import { useI18n } from "@/lib/web-i18n";
import { ServerIcon } from "@/components/common/ServerIcon";
import type { McpServerMetadata } from "@/agent/chat-agent";

function stringifyValue(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? "");
  }
}

export function MCPToolApproval({
  toolName,
  input,
  mcp,
  onApprove,
  onDeny,
}: {
  toolName?: string;
  input: Record<string, unknown>;
  mcp?: McpServerMetadata;
  onApprove: () => void;
  onDeny: () => void;
}) {
  const { t, format } = useI18n();
  const [isArgsExpanded, setIsArgsExpanded] = useState(false);

  const displayName = toolName || t("mcpTool");
  const serverId = mcp?.serverId || t("selectedMcpServer");
  const serverName = mcp?.serverName || null;
  const serverUrl = mcp?.serverUrl || null;


  const args = (input.args && typeof input.args === "object" ? input.args : input) as Record<string, unknown>;
  const hasArgs = Object.keys(args).length > 0;

  const rawMessage = format("requestingToolExecution", {
    toolName: displayName,
    serverId: "__SERVER_TOKEN__",
  });
  const [prefix, suffix] = rawMessage.includes("__SERVER_TOKEN__")
    ? rawMessage.split("__SERVER_TOKEN__")
    : [rawMessage, ""];

  return (
    <div className="w-full max-w-none sm:max-w-2xl flex flex-col gap-2.5 py-2">
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-[14px] font-semibold text-foreground truncate">{displayName}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1 flex-wrap">
          {prefix && <span>{prefix}</span>}
          <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-sm bg-muted/60 text-foreground font-medium border border-hairline text-[11px] align-middle">
            <ServerIcon
              serverName={serverName || serverId}
              serverUrl={serverUrl || undefined}
              size={13}
              className="flex-shrink-0 rounded-sm"
            />
            {serverName && serverName.toLowerCase() !== serverId.toLowerCase() ? (
              <>
                <span className="truncate max-w-[140px]">{serverName}</span>
                <span className="text-muted-foreground font-mono text-[10px]">({serverId})</span>
              </>
            ) : (
              <span className="font-mono text-[11px]">{serverName || serverId}</span>
            )}
          </span>
          {suffix && <span>{suffix}</span>}
        </div>
      </div>
      
      {hasArgs && (
        <div>
          <button onClick={() => setIsArgsExpanded(!isArgsExpanded)} className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            {isArgsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {t("payload")}
          </button>
          {isArgsExpanded && (
            <div className="mt-1.5 rounded-sm overflow-hidden border border-hairline max-h-48 overflow-y-auto">
              <CodeBlock code={stringifyValue(args)} language="json" className="!m-0 text-[11px] bg-muted/30 p-2 font-mono" />
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 shrink-0 mt-1">
        <Button size="sm" onClick={onDeny} variant="outline" className="h-8 px-3 text-xs sm:text-sm cursor-pointer rounded-sm border-hairline">{t("deny")}</Button>
        <Button size="sm" onClick={onApprove} className="gap-1 sm:gap-2 h-8 px-3 text-xs sm:text-sm cursor-pointer rounded-sm">{t("approve")}</Button>
      </div>
    </div>
  );
}

export function MCPToolApprovalStatus({
  approved,
  reason,
}: {
  approved: boolean;
  reason?: string;
}) {
  const { t } = useI18n();
  
  if (approved) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 py-1">
      <XCircle className="h-3.5 w-3.5" />
      <span>{reason || t("toolExecutionDenied")}</span>
    </div>
  );
}
