'use client';

import { memo, useState } from 'react';
import {
  AlertCircle,
  ChevronDownIcon,
  FileTextIcon,
  ListIcon,
  Loader2,
  SearchIcon,
  TerminalIcon,
  Wrench,
  X,
} from 'lucide-react';

import { useI18n } from '@/lib/web-i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type {
  ChainOfThoughtToolStep,
  ToolStepIconKey,
} from '@/components/chat/chain-of-thought-utils';

const toolStepIcons: Record<ToolStepIconKey, typeof TerminalIcon> = {
  execute: TerminalIcon,
  read: FileTextIcon,
  search: SearchIcon,
  list: ListIcon,
  tool: Wrench,
};

function formatToolDetail(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function ToolDetailBlock({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: unknown;
  tone?: 'default' | 'error';
}) {
  return (
    <div className="space-y-1">
      <div
        className={cn(
          'text-[9px] font-mono font-medium uppercase tracking-wider',
          tone === 'error' ? 'text-rose-400' : 'text-muted-foreground/70'
        )}
      >
        {label}
      </div>
      <pre
        className={cn(
          'max-h-44 overflow-y-auto whitespace-pre-wrap break-words rounded-xs border border-border px-2 py-1.5 text-[11px] font-mono leading-relaxed',
          'bg-card text-foreground/80',
          tone === 'error' && 'border-rose-500/30 bg-rose-500/5 text-rose-300'
        )}
      >
        {formatToolDetail(value)}
      </pre>
    </div>
  );
}

function ToolCallRow({ step }: { step: ChainOfThoughtToolStep }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const hasArgs = step.input !== undefined;
  const hasResult = step.output !== undefined;
  const hasError = Boolean(step.errorText);
  const hasDetails = hasArgs || hasResult || hasError;
  const ToolIcon = step.iconKey ? toolStepIcons[step.iconKey] : Wrench;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-sm border border-transparent hover:border-border/60 hover:bg-card/40 transition-colors">
        <CollapsibleTrigger
          className={cn(
            'flex w-full items-start gap-2 px-2 py-1.5 text-left transition-colors cursor-pointer',
            !hasDetails && 'cursor-default'
          )}
          disabled={!hasDetails}
        >
          <div className="mt-0.5 shrink-0">
            {step.status === 'active' ? (
              <Loader2 className="size-3.5 animate-spin text-primary" />
            ) : step.hasError ? (
              <AlertCircle className="size-3.5 text-rose-500" />
            ) : (
              <ToolIcon className="size-3.5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="truncate text-xs font-mono font-medium text-foreground">
              {step.label}
            </div>
            <div className="text-[10px] font-mono text-muted-foreground/70 truncate">
              {step.description}
            </div>
          </div>
          {hasDetails && (
            <ChevronDownIcon
              className={cn(
                'mt-0.5 size-3.5 shrink-0 text-muted-foreground/60 transition-transform',
                open && 'rotate-180'
              )}
            />
          )}
        </CollapsibleTrigger>
        {hasDetails && (
          <CollapsibleContent className="px-2 pb-2 pt-0.5">
            <div className="space-y-2 pt-1 border-t border-border/40">
              {hasArgs && <ToolDetailBlock label={t('args')} value={step.input} />}
              {hasResult && <ToolDetailBlock label={t('result')} value={step.output} />}
              {hasError && <ToolDetailBlock label={t('error')} value={step.errorText} tone="error" />}
            </div>
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  );
}

interface ToolCallSidebarProps {
  onClose: () => void;
  toolSteps: ChainOfThoughtToolStep[];
}

export const ToolCallSidebar = memo(function ToolCallSidebar({
  onClose,
  toolSteps,
}: ToolCallSidebarProps) {
  return (
    <aside className="flex h-full min-h-0 w-full min-w-0 flex-col border-l border-border bg-background">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border">
        <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-foreground">
          Tool calls
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-foreground cursor-pointer"
          onClick={onClose}
          aria-label="Close tool calls panel"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2 scrollbar-minimal">
        {toolSteps.length > 0 ? (
          toolSteps.map((step) => <ToolCallRow key={step.key} step={step} />)
        ) : (
          <div className="rounded-sm border border-dashed border-border px-3 py-4 text-center text-xs font-mono text-muted-foreground">
            No tool calls for this message.
          </div>
        )}
      </div>
    </aside>
  );
});
