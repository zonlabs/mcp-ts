'use client';

import React, { useState } from 'react';
import {
  Brain,
  Check,
  Search,
  Trash2,
  Bot,
  ChevronDown,
  FileText,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Streamdown } from 'streamdown';
import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import type { CompactionResult } from '@/lib/compaction';

const streamdownPlugins = { cjk, code };

export type CompactionNoticeProps = Partial<
  Pick<CompactionResult, 'compactedCount' | 'preservedCount' | 'summary'>
>;

export interface MemoryEventCardProps {
  part: any;
  toolName: string;
}

export interface SubagentEventCardProps {
  part: any;
}

/**
 * Minimal timeline divider when conversation history is compacted.
 * Uses subdued colors and a scrollable box for the summary.
 */
export function CompactionEventNotice({
  compactedCount,
  preservedCount,
  summary,
}: CompactionNoticeProps) {
  const [isOpen, setIsOpen] = useState(false);

  const turnsLabel = compactedCount ? `(${compactedCount} turns)` : '';

  return (
    <div className="w-full my-4 flex flex-col items-center">
      <div className="w-full flex items-center gap-3">
        <div className="flex-1 h-px bg-border/40" />
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none rounded-full border border-transparent hover:border-border/30 hover:bg-muted/20',
            isOpen && 'text-foreground'
          )}
          title={summary ? 'Click to view compacted context summary' : undefined}
        >
          <span className="text-[11px] leading-none select-none text-muted-foreground/80">✦</span>
          <span className="font-medium tracking-tight">Context compacted</span>
          {turnsLabel && (
            <span className="text-muted-foreground/70 font-normal">{turnsLabel}</span>
          )}
          <ChevronDown
            className={cn(
              'size-3 text-muted-foreground/70 transition-transform duration-200 shrink-0 ml-0.5',
              isOpen && 'rotate-180 text-foreground'
            )}
          />
        </button>
        <div className="flex-1 h-px bg-border/40" />
      </div>

      {isOpen && (
        <div className="mt-2.5 w-full max-w-xl max-h-52 overflow-y-auto rounded-md border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground leading-relaxed font-sans scrollbar-thin animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/30 text-[11px] font-medium text-foreground/80">
            <span>Compacted Context Summary</span>
            {preservedCount !== undefined && (
              <span className="text-[10px] text-muted-foreground font-normal">
                {preservedCount} recent turns preserved
              </span>
            )}
          </div>
          {summary ? (
            <div className="whitespace-pre-wrap font-sans text-foreground/80 leading-relaxed">
              {summary}
            </div>
          ) : (
            <div className="text-[11px] italic text-muted-foreground/70">
              Prior {compactedCount ? `${compactedCount} ` : ''}messages were summarized and compacted into system context.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Minimal inline indicator for memory actions (remember_fact, search_memory, forget_fact).
 * Replaces heavy colored cards with clean, subtle typography.
 */
export function MemoryEventCard({
  part,
  toolName,
}: MemoryEventCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const input = part.input as Record<string, any> | undefined;
  const output = part.output as Record<string, any> | undefined;
  const isExecuting = part.state === 'input-streaming' || part.state === 'input-available';
  const isComplete = part.state === 'output-available';
  const isError = part.state === 'output-error' || output?.success === false;

  if (toolName === 'remember_fact') {
    const fact = input?.fact || output?.fact || '';
    return (
      <div className="my-1 flex items-center gap-2 text-xs text-muted-foreground">
        <Brain className="size-3.5 shrink-0 text-muted-foreground" />
        <span>
          {isExecuting ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" />
              Saving to memory...
            </span>
          ) : (
            <>
              Saved to memory: <span className="text-foreground">"{fact}"</span>
            </>
          )}
        </span>
        {isComplete && !isError && <Check className="size-3 text-muted-foreground" />}
        {isError && <AlertCircle className="size-3 text-destructive" />}
      </div>
    );
  }

  if (toolName === 'forget_fact') {
    const memoryId = input?.memoryId || output?.memoryId || '';
    return (
      <div className="my-1 flex items-center gap-2 text-xs text-muted-foreground">
        <Trash2 className="size-3.5 shrink-0 text-muted-foreground" />
        <span>Removed memory {memoryId ? `(${memoryId})` : ''}</span>
        {isComplete && <Check className="size-3 text-muted-foreground" />}
      </div>
    );
  }

  if (toolName === 'search_memory') {
    const query = input?.query || '';
    const memories = Array.isArray(output?.memories) ? output.memories : [];

    return (
      <div className="my-1 w-full max-w-xl">
        <button
          type="button"
          onClick={() => memories.length > 0 && setIsOpen(!isOpen)}
          className={cn(
            'inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors select-none',
            memories.length > 0 ? 'cursor-pointer hover:text-foreground' : 'cursor-default'
          )}
        >
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <span>
            {isExecuting
              ? 'Searching memory...'
              : `Recalled ${memories.length > 0 ? `${memories.length} ` : ''}memories for "${query}"`}
          </span>
          {memories.length > 0 && (
            <ChevronDown
              className={cn('size-3 text-muted-foreground transition-transform', isOpen && 'rotate-180')}
            />
          )}
        </button>

        {isOpen && memories.length > 0 && (
          <div className="mt-1.5 w-full max-h-36 overflow-y-auto rounded-md border border-border/50 bg-muted/20 p-2 text-xs text-muted-foreground scrollbar-thin">
            <ul className="space-y-1 list-disc pl-4 leading-relaxed">
              {memories.map((m: any, i: number) => (
                <li key={i}>{m.fact || String(m)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return null;
}

/**
 * Minimal subagent delegation component.
 * Displays a clean, unbloated trigger line that expands into a bounded,
 * scrollable box so the subagent output never messes up the main chat UI.
 */
export function SubagentEventCard({ part }: SubagentEventCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const input = (part.input as Record<string, any>) || {};
  const output = part.output;
  const isExecuting =
    part.state === 'input-streaming' ||
    part.state === 'input-available' ||
    (part.state === 'output-available' && part.preliminary === true);
  const isComplete = part.state === 'output-available' && !part.preliminary;
  const isError = part.state === 'output-error';

  // Extract text and intermediate tool calls from the subagent output
  const nestedParts = Array.isArray(output?.parts) ? output.parts : [];
  const textOutput =
    typeof output === 'string'
      ? output
      : nestedParts
          .filter((p: any) => p?.type === 'text' && p.text)
          .map((p: any) => p.text)
          .join('\n\n') || '';

  const subagentToolCalls = nestedParts.filter(
    (p: any) =>
      typeof p?.type === 'string' &&
      (p.type.startsWith('tool-') || p.type === 'tool-invocation')
  );

  return (
    <div className="my-1.5 w-full max-w-full">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="group inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none max-w-full py-0.5"
      >
        <Bot className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
        <span className="font-medium text-foreground">File Analyst</span>
        {input.task && (
          <span className="text-muted-foreground truncate max-w-[280px] sm:max-w-md">
            — {input.task}
          </span>
        )}

        <span className="inline-flex items-center gap-1 text-[11px] ml-1 shrink-0">
          {isExecuting && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              <span>Analyzing...</span>
            </span>
          )}
          {isComplete && <Check className="size-3 text-muted-foreground" />}
          {isError && <AlertCircle className="size-3 text-destructive" />}
        </span>

        <ChevronDown
          className={cn(
            'size-3 text-muted-foreground transition-transform shrink-0',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div className="mt-1.5 w-full max-h-60 overflow-y-auto rounded-md border border-border/50 bg-muted/20 p-3 text-xs leading-relaxed scrollbar-thin animate-in fade-in duration-150">
          {input.filenames && Array.isArray(input.filenames) && input.filenames.length > 0 && (
            <div className="mb-2 pb-2 border-b border-border/40 text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
              <FileText className="size-3 text-muted-foreground" />
              <span>Files inspected:</span>
              <span className="font-mono text-foreground/80">{input.filenames.join(', ')}</span>
            </div>
          )}

          {subagentToolCalls.length > 0 && (
            <div className="mb-2 pb-2 border-b border-border/40 flex flex-wrap gap-1">
              {subagentToolCalls.map((t: any, idx: number) => {
                const name =
                  t.toolName ||
                  (typeof t.type === 'string' ? t.type.replace(/^tool-/, '') : 'tool');
                return (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/60 text-[10px] font-mono text-muted-foreground"
                  >
                    <FileText className="size-2.5" />
                    {name}
                  </span>
                );
              })}
            </div>
          )}

          {textOutput ? (
            <div className="prose prose-xs dark:prose-invert max-w-none text-foreground/90 leading-relaxed">
              <Streamdown className="size-full" plugins={streamdownPlugins}>
                {textOutput}
              </Streamdown>
            </div>
          ) : isExecuting ? (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground italic py-1">
              <Loader2 className="size-3 animate-spin" />
              <span>Subagent reading files and extracting relevant content...</span>
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground italic">
              No content returned by subagent.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
