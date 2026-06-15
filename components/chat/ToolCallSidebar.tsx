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
    <div className="space-y-1.5">
      <div
        className={cn(
          'text-[10px] font-medium uppercase tracking-[0.14em]',
          tone === 'error' ? 'text-red-500/90 dark:text-red-400/90' : 'text-muted-foreground'
        )}
      >
        {label}
      </div>
      <pre
        className={cn(
          'max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-md border px-3 py-2 text-xs leading-5',
          'bg-muted/35 text-muted-foreground',
          tone === 'error' && 'border-red-500/20 bg-red-500/5 text-red-600 dark:text-red-300'
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
      <div className="rounded-lg bg-background/70">
        <CollapsibleTrigger
          className={cn(
            'flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-accent/35',
            !hasDetails && 'cursor-default hover:bg-transparent'
          )}
          disabled={!hasDetails}
        >
          <div className="mt-0.5">
            {step.status === 'active' ? (
              <Loader2 className="size-4 animate-spin text-primary" />
            ) : step.hasError ? (
              <AlertCircle className="size-4 text-red-500" />
            ) : (
              <ToolIcon className="size-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="truncate text-sm font-medium text-foreground">
              {step.label}
            </div>
            <div className="text-xs text-muted-foreground">
              {step.description}
            </div>
          </div>
          {hasDetails && (
            <ChevronDownIcon
              className={cn(
                'mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-180'
              )}
            />
          )}
        </CollapsibleTrigger>
        {hasDetails && (
          <CollapsibleContent className="px-3 pb-3">
            <div className="space-y-3 pt-1">
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
    <aside className="flex h-full min-h-0 w-full min-w-0 flex-col border-l border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="flex items-center justify-between gap-3 px-4 py-4">
        <h2 className="text-base font-semibold text-foreground">Tool calls</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onClose}
          aria-label="Close tool calls panel"
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {toolSteps.length > 0 ? (
          toolSteps.map((step) => <ToolCallRow key={step.key} step={step} />)
        ) : (
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
            No tool calls for this message.
          </div>
        )}
      </div>
    </aside>
  );
});
