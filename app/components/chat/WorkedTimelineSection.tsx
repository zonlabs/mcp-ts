'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Wrench,
  Globe,
  Search,
  ChevronRight,
  Brain,
  FileText,
  Terminal,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ServerIcon } from '@/components/common/ServerIcon';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { ToolJsonPreview } from './ToolJsonPreview';
import type { ExecutionTimelineItem, ToolIconCategory } from './execution-timeline-utils';

export interface WorkedTimelineSectionProps {
  tasks: ExecutionTimelineItem[];
  reasoningText?: string;
  isStreaming: boolean;
  persistedDuration?: number;
  isOpen?: boolean;
  onToggle?: () => void;
  className?: string;
}

const ICON_MAP: Record<ToolIconCategory, React.ComponentType<{ className?: string }>> = {
  search: Search,
  read: Globe,
  write: FileText,
  terminal: Terminal,
  tool: Wrench,
};

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '';
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    if (minutes === 0 && remainingSeconds === 0) return `${hours}h`;
    if (remainingSeconds === 0) return `${hours}h ${minutes}m`;
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  }

  if (remainingSeconds === 0) return `${minutes}m`;
  return `${minutes}m ${remainingSeconds}s`;
}

function getToolArgs(input: unknown): Record<string, unknown> | null {
  if (!input) return null;
  let obj: unknown = input;
  if (typeof input === 'string') {
    try {
      obj = JSON.parse(input);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;

  let record = obj as Record<string, unknown>;

  if (record.args && typeof record.args === 'object' && !Array.isArray(record.args)) {
    record = record.args as Record<string, unknown>;
  } else if (record.arguments && typeof record.arguments === 'object' && !Array.isArray(record.arguments)) {
    record = record.arguments as Record<string, unknown>;
  } else if (typeof record.arguments === 'string') {
    try {
      const parsed = JSON.parse(record.arguments);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        record = parsed as Record<string, unknown>;
      }
    } catch {}
  } else if (record.params && typeof record.params === 'object' && !Array.isArray(record.params)) {
    record = record.params as Record<string, unknown>;
  } else if (record.input && typeof record.input === 'object' && !Array.isArray(record.input)) {
    record = record.input as Record<string, unknown>;
  }

  const metaKeys = new Set(['toolName', 'serverId', 'serverName', 'serverUrl']);
  const cleaned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    if (!metaKeys.has(key)) {
      cleaned[key] = val;
    }
  }

  return Object.keys(cleaned).length > 0 ? cleaned : null;
}

function formatArgValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every((v) => typeof v === 'string' || typeof v === 'number')) {
      return value.join(', ');
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function ToolTimelineItem({ task }: { task: ExecutionTimelineItem }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const Icon = ICON_MAP[task.iconCategory] || Wrench;
  const mcp = task.mcp;
  const serverId = mcp?.serverId;
  const serverName = mcp?.serverName;
  const serverUrl = mcp?.serverUrl;
  const serverIdentifier = serverName || serverId;
  const args = getToolArgs(task.input);
  const argsEntries = args ? Object.entries(args) : [];
  const hasRawJson = Boolean(task.rawJson && task.rawJson.trim() !== '');
  const hasDetails = argsEntries.length > 0 || hasRawJson;

  const actionPrefix = task.status === 'running' ? 'Using' : task.status === 'denied' ? 'Denied' : 'Used';
  const cleanName = task.name.replace(/^(used|using|denied)\s+/i, '').replace(/:\s*/, ' ');
  const displayName = `${actionPrefix} ${toTitleCase(cleanName)}`;

  const toggleExpand = () => {
    if (hasDetails) {
      setIsExpanded((prev) => !prev);
    }
  };

  return (
    <div className="relative flex flex-col gap-1.5 max-w-2xl">
      <div
        onClick={toggleExpand}
        className={cn(
          "flex items-center gap-2 text-muted-foreground text-xs font-medium flex-wrap select-none py-0.5 transition-colors",
          hasDetails ? "cursor-pointer hover:text-foreground group/item" : "cursor-default"
        )}
        role={hasDetails ? "button" : undefined}
        tabIndex={hasDetails ? 0 : undefined}
        aria-expanded={hasDetails ? isExpanded : undefined}
        onKeyDown={hasDetails ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleExpand();
          }
        } : undefined}
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground group-hover/item:text-foreground transition-colors" />
        {task.status === 'running' ? (
          <Shimmer as="span" duration={1.6}>
            {displayName}
          </Shimmer>
        ) : (
          <span className="text-muted-foreground group-hover/item:text-foreground transition-colors">{displayName}</span>
        )}

        {serverIdentifier && (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground/80 group-hover/item:text-foreground/90 text-[11px] align-middle transition-colors">
            <ServerIcon
              serverName={serverIdentifier}
              serverUrl={serverUrl}
              size={13}
              className="flex-shrink-0 rounded-sm opacity-80 group-hover/item:opacity-100 transition-opacity"
            />
            {serverName && serverId && serverName.toLowerCase() !== serverId.toLowerCase() ? (
              <>
                <span className="truncate max-w-[140px] font-medium">{serverName}</span>
                <span className="text-muted-foreground/60 font-mono text-[10px]">({serverId})</span>
              </>
            ) : (
              <span className="font-mono text-[11px] font-medium">{serverIdentifier}</span>
            )}
          </span>
        )}

        {task.approved && (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="size-3.5 shrink-0" />
            <span>Approved</span>
          </span>
        )}

        {task.status === 'denied' && (
          <span className="inline-flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400 font-medium">
            <XCircle className="size-3.5 shrink-0" />
            <span>{task.deniedReason || 'Denied'}</span>
          </span>
        )}

        {task.status === 'error' && (
          <span className="inline-flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400 font-medium">
            <XCircle className="size-3.5 shrink-0" />
            <span>Failed</span>
          </span>
        )}
      </div>

      {isExpanded && (
        <div className="space-y-1.5 animate-in fade-in-50 duration-150">
          {argsEntries.length > 0 && (
            <div className="ml-5 my-1 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-0.5 font-mono text-[11px] leading-relaxed">
              {argsEntries.map(([key, val]) => {
                const formatted = formatArgValue(val);
                return (
                  <React.Fragment key={key}>
                    <span className="text-sky-600 dark:text-sky-400 font-normal">{key}</span>
                    <span className="text-foreground/90 break-words select-text font-normal">{formatted}</span>
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {hasRawJson && (
            <div className="ml-5">
              <ToolJsonPreview rawJson={task.rawJson} lineCount={task.lineCount} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function WorkedTimelineSection({
  tasks,
  reasoningText,
  isStreaming,
  persistedDuration,
  isOpen: controlledIsOpen,
  onToggle: controlledOnToggle,
  className,
}: WorkedTimelineSectionProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [isThinkingOpen, setIsThinkingOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const toggleOpen = () => {
    if (controlledOnToggle) {
      controlledOnToggle();
    } else {
      setInternalIsOpen(!internalIsOpen);
    }
  };

  const [elapsedSeconds, setElapsedSeconds] = useState<number>(() => persistedDuration || 0);
  const startTimeRef = useRef<number | null>(null);

  // Live timer while streaming; sync to persistedDuration when done.
  // IMPORTANT: use Math.floor, not Math.ceil — setInterval fires a few ms late
  // so ceil(1.003) = 2, skipping "1s" entirely.
  useEffect(() => {
    if (isStreaming) {
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }
      const interval = window.setInterval(() => {
        const start = startTimeRef.current ?? Date.now();
        setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
      }, 1000);
      return () => window.clearInterval(interval);
    } else {
      startTimeRef.current = null;
      if (persistedDuration !== undefined && persistedDuration > 0) {
        setElapsedSeconds(persistedDuration);
      }
    }
  }, [isStreaming, persistedDuration]);

  // When not streaming, prefer persistedDuration directly to avoid a render gap
  // between isStreaming flipping false and the effect updating elapsedSeconds.
  const displaySeconds = !isStreaming ? (persistedDuration || elapsedSeconds) : elapsedSeconds;

  const hasTasks = tasks.length > 0;
  const hasReasoning = Boolean(reasoningText && reasoningText.trim().length > 0);
  if (!hasTasks && !hasReasoning && !isStreaming) return null;

  const durationStr = formatDuration(displaySeconds);
  const headerTitle = isStreaming
    ? (durationStr ? `Working for ${durationStr}` : 'Working...')
    : (durationStr ? `Worked for ${durationStr}` : 'Worked');

  return (
    <div className={cn('w-full my-2 text-xs font-sans select-none', className)}>
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={isOpen}
        className="group/header inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground font-medium text-[13px] transition-colors cursor-pointer py-1 outline-none"
      >
        {isStreaming ? (
          <Shimmer as="span" duration={1.6}>
            {headerTitle}
          </Shimmer>
        ) : (
          <span>{headerTitle}</span>
        )}
        <ChevronRight
          className={cn(
            'size-3.5 transition-transform duration-200 text-muted-foreground group-hover/header:text-foreground',
            isOpen && 'rotate-90'
          )}
        />
      </button>

      {isOpen && (
        <div className="relative mt-2 ml-1 pl-4 border-l border-border/50 space-y-3 pt-1 pb-1 animate-in fade-in-50 duration-200">
          {hasReasoning && (
            <div className={cn("space-y-1.5", hasTasks && "pb-2.5 border-b border-border/40")}>
              <button
                type="button"
                onClick={() => setIsThinkingOpen(!isThinkingOpen)}
                className="group/thinking flex items-center gap-2 text-muted-foreground hover:text-foreground font-medium text-[13px] transition-colors cursor-pointer select-none py-0.5"
                aria-expanded={isThinkingOpen}
              >
                <Brain className="size-3.5 shrink-0 text-muted-foreground group-hover/thinking:text-foreground transition-colors" />
                {isStreaming ? (
                  <Shimmer as="span" duration={1.6}>
                    Thinking Process
                  </Shimmer>
                ) : (
                  <span>Thinking Process</span>
                )}
                <ChevronRight
                  className={cn(
                    'size-3.5 transition-transform duration-200 text-muted-foreground/70 group-hover/thinking:text-foreground',
                    isThinkingOpen && 'rotate-90'
                  )}
                />
              </button>
              {isThinkingOpen && (
                <div className="text-[11px] text-muted-foreground leading-relaxed font-mono whitespace-pre-wrap pl-4 border-l border-border/40 animate-in fade-in-50 duration-150">
                  {reasoningText}
                </div>
              )}
            </div>
          )}

          {tasks.map((task) => (
            <ToolTimelineItem key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}
