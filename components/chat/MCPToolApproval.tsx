"use client";

import { AlertTriangle, CheckCircle2, XCircle, ShieldAlert, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
    <div className="w-full max-w-[85%] sm:max-w-[600px] rounded-xl border border-primary/20 bg-primary/[0.02] p-3 backdrop-blur-md shadow-sm animate-in fade-in zoom-in-95 duration-200">
      <div className="flex flex-col gap-2.5">
        {/* Header */}
        <div className="flex items-start gap-2.5">
          <div className="flex-shrink-0 h-7 w-7 mt-0.5 flex items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldAlert className="h-3.5 w-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-0.5">
              <h4 className="text-[14px] font-semibold text-foreground font-plus-jakarta leading-none">
                {t("toolExecutionRequest")}
              </h4>
              <Badge variant="secondary" className="gap-1 bg-primary/10 text-primary hover:bg-primary/20 border-none px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold font-plus-jakarta h-5">
                <AlertTriangle className="h-3 w-3" />
                {t("actionRequired")}
              </Badge>
            </div>
            <p className="text-[13px] text-muted-foreground font-plus-jakarta leading-snug">
              {format("requestingToolExecution", {
                toolName,
                serverId,
              })}
            </p>
          </div>
        </div>

        {/* Arguments */}
        {hasArgs && (
          <div className="pl-0 sm:pl-[38px]">
            <div className="space-y-1.5">
              <button 
                onClick={() => setIsArgsExpanded(!isArgsExpanded)}
                className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/80 hover:text-foreground transition-colors font-plus-jakarta"
              >
                {isArgsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {t("payload")}
              </button>
              
              {isArgsExpanded && (
                <div className="rounded-lg overflow-hidden border border-border/40 shadow-sm max-h-56 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-200">
                  <CodeBlock
                    code={stringifyValue(args)}
                    language="json"
                    className="!m-0 text-[11px] bg-background/50 backdrop-blur-sm p-2"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1 pl-0 sm:pl-[38px]">
          <Button 
            size="sm"
            className="flex-1 sm:flex-none h-7 px-4 gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium shadow-sm transition-all rounded-full font-plus-jakarta"
            onClick={onApprove}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t("approve")}
          </Button>
          <Button 
            size="sm"
            variant="outline" 
            className="flex-1 sm:flex-none h-7 px-4 gap-1.5 border-border/50 bg-background/50 hover:bg-secondary/80 text-muted-foreground hover:text-foreground text-xs font-medium transition-all rounded-full font-plus-jakarta"
            onClick={onDeny}
          >
            <XCircle className="h-3.5 w-3.5" />
            {t("deny")}
          </Button>
        </div>
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
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium font-plus-jakarta transition-all",
        approved
          ? "bg-green-500/10 text-green-700 dark:text-green-300 border border-green-500/20"
          : "bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20"
      )}
    >
      {approved ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      <span>{approved ? t("toolExecutionApproved") : reason || t("toolExecutionDenied")}</span>
    </div>
  );
}
