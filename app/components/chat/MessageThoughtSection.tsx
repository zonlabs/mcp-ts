'use client';

import { useRef, useEffect, useState } from 'react';
import { BrainIcon, ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  buildChainOfThoughtSummary,
  getThoughtSummaryLabel,
  hasVisibleReasoningText,
} from '@/components/chat/chain-of-thought-utils';

interface ThoughtSummaryTriggerProps {
  isActive: boolean;
  isExpanded: boolean;
  isRunning: boolean;
  onClick: () => void;
}

export function ThoughtSummaryTrigger({
  isActive,
  isExpanded,
  isRunning,
  onClick,
}: ThoughtSummaryTriggerProps) {
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
    <div className="mb-0.5 flex max-w-full items-center gap-2 text-xs">
      <button
        type="button"
        onClick={onClick}
        aria-expanded={isExpanded}
        className={cn(
          'inline-flex min-w-0 items-center gap-1.5 text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:text-foreground cursor-pointer font-medium',
          (isExpanded || isActive) && 'text-foreground'
        )}
      >
        <BrainIcon className={cn('size-3.5 shrink-0', (isActive || isExpanded) && 'text-primary')} />
        <span className="truncate">{getThoughtSummaryLabel(duration, isRunning)}</span>
        <ChevronDownIcon
          className={cn(
            'size-3.5 shrink-0 transition-transform',
            isExpanded && 'rotate-180'
          )}
        />
      </button>
    </div>
  );
}

export interface MessageThoughtSectionProps {
  chainOfThought: ReturnType<typeof buildChainOfThoughtSummary>;
  isActive: boolean;
  isStreaming: boolean;
  isOpen: boolean;
  onToggle: () => void;
}

export function MessageThoughtSection({
  chainOfThought,
  isActive,
  isStreaming,
  isOpen,
  onToggle,
}: MessageThoughtSectionProps) {
  return (
    <>
      <ThoughtSummaryTrigger
        isActive={isActive}
        isExpanded={isOpen}
        isRunning={isStreaming || isActive}
        onClick={onToggle}
      />
      {isOpen && hasVisibleReasoningText(chainOfThought.reasoningText) && (
        <div className="my-2 pl-3 border-l border-border/50 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground/80 font-sans">
          {chainOfThought.reasoningText}
        </div>
      )}
    </>
  );
}
