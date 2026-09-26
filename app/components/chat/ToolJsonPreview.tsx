'use client';

import React, { useState } from 'react';
import { ChevronsUpDown, Copy, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface ToolJsonPreviewProps {
  rawJson?: string;
  lineCount?: number;
  className?: string;
}

export function ToolJsonPreview({ rawJson, lineCount, className }: ToolJsonPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!rawJson || rawJson.trim() === '') return null;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(rawJson);
      setCopied(true);
      toast.success('Copied JSON');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const hiddenCount = lineCount && lineCount > 1 ? lineCount : rawJson.split('\n').length;

  return (
    <div
      className={cn(
        'w-full my-1.5 rounded-md border border-border/80 dark:border-border/60 bg-muted/30 dark:bg-neutral-950/70 text-foreground overflow-hidden text-xs font-mono',
        className
      )}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/60 dark:bg-neutral-900/60 border-b border-border/60 dark:border-border/40 select-none">
        <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
          JSON
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded hover:bg-muted dark:hover:bg-neutral-800 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title={isExpanded ? 'Collapse' : 'Expand'}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            <ChevronsUpDown className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded hover:bg-muted dark:hover:bg-neutral-800 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Copy JSON"
            aria-label="Copy JSON"
          >
            {copied ? (
              <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Body */}
      {isExpanded ? (
        <pre className="p-3 text-[11px] overflow-x-auto text-foreground dark:text-zinc-200 max-h-72 leading-relaxed bg-background/50 dark:bg-black/30">
          <code>{rawJson}</code>
        </pre>
      ) : (
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="w-full text-left px-3 py-2 text-[12px] italic text-muted-foreground hover:text-foreground hover:bg-muted/40 dark:hover:bg-neutral-900/40 transition-colors cursor-pointer flex items-center justify-between"
        >
          <span>{hiddenCount} hidden lines</span>
        </button>
      )}
    </div>
  );
}
