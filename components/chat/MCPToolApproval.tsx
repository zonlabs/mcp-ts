"use client";

import { XCircle, ShieldAlert, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ai-elements/code-block";
import { useState } from "react";
import { useI18n } from "@/lib/web-i18n";

function stringifyValue(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? "");
  }
}

export function MCPToolApproval({
  input,
  onApprove,
  onDeny,
}: {
  input: Record<string, unknown>;
  onApprove: () => void;
  onDeny: () => void;
}) {
  const { t, format } = useI18n();
  const [isArgsExpanded, setIsArgsExpanded] = useState(false);
  const toolName = typeof input.toolName === "string" ? input.toolName : t("mcpTool");
  const serverId = typeof input.serverId === "string" && input.serverId ? input.serverId : t("selectedMcpServer");
  const args = input.args && typeof input.args === "object" ? input.args : {};
  const hasArgs = Object.keys(args).length > 0;

  return (
    <div className="w-full max-w-none sm:max-w-2xl flex flex-col gap-3 py-2 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-500 flex-shrink-0" />
          <span className="text-[14px] font-semibold text-foreground truncate">{toolName}</span>
        </div>
        <span className="text-xs text-muted-foreground truncate pl-6 mt-0.5">
          {format("requestingToolExecution", { toolName, serverId })}
        </span>
      </div>
      
      {hasArgs && (
        <div className="pl-6">
          <button onClick={() => setIsArgsExpanded(!isArgsExpanded)} className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors">
            {isArgsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {t("payload")}
          </button>
          {isArgsExpanded && (
            <div className="mt-1.5 rounded-md overflow-hidden border max-h-48 overflow-y-auto">
              <CodeBlock code={stringifyValue(args)} language="json" className="!m-0 text-[11px] bg-muted/30 p-2" />
            </div>
          )}
        </div>
      )}

      <div className="flex gap-1.5 shrink-0 pl-6 mt-1">
        <Button size="sm" onClick={onDeny} variant="outline" className="h-8 px-3 text-xs sm:text-sm">{t("deny")}</Button>
        <Button size="sm" onClick={onApprove} className="gap-1 sm:gap-2 h-8 px-3 text-xs sm:text-sm">{t("approve")}</Button>
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
