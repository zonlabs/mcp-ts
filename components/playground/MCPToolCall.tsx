'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronDown, 
  Copy, 
  Check,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ---------------------------------- */
/* Types                              */
/* ---------------------------------- */

type ToolState =
  | 'loading'
  | 'input-streaming'
  | 'input-available'
  | 'approval-requested'
  | 'approval-responded'
  | 'output-available'
  | 'output-error'
  | 'output-denied';

type ToolCallData = Record<string, unknown> | string | null | undefined;

interface MCPToolCallProps {
  state: ToolState;
  name: string;
  input?: ToolCallData;
  output?: ToolCallData;
  errorText?: string;
}

const formatContent = (content: ToolCallData): string => {
  if (!content) return '';
  return typeof content === 'object'
    ? JSON.stringify(content, null, 2)
    : String(content);
};

/* ---------------------------------- */
/* Shimmer Text (Refined Animation)   */
/* ---------------------------------- */

function ShimmerText({ children, active }: { children: React.ReactNode; active: boolean }) {
  if (!active) return <>{children}</>;

  return (
    <motion.span
      className={cn(
        "bg-clip-text text-transparent font-medium inline-block",
        "bg-gradient-to-r from-gray-500 via-gray-900 to-gray-500",
        "dark:from-zinc-400 dark:via-zinc-100 dark:to-zinc-400",
        "bg-[length:200%_100%]"
      )}
      animate={{ backgroundPosition: ["100% 0", "-100% 0"] }}
      transition={{
        duration: 2,
        ease: "easeInOut",
        repeat: Infinity,
      }}
    >
      {children}
    </motion.span>
  );
}

/* ---------------------------------- */
/* Code Block with Copy Feedback      */
/* ---------------------------------- */

function CodeBlock({ label, content }: { label: string; content: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
          {label}
        </span>
        <button
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1 text-[11px] sm:text-xs font-medium transition-colors px-1.5 py-0.5 rounded-md hover:bg-secondary",
            copied ? "text-green-600 dark:text-green-400" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {copied ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <pre className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 sm:p-3 text-[11px] sm:text-xs overflow-auto max-h-[260px] sm:max-h-[300px] font-mono leading-relaxed text-zinc-700 dark:text-zinc-300">
        {content}
      </pre>
    </div>
  );
}

/* ---------------------------------- */
/* Main Component                     */
/* ---------------------------------- */

export default function MCPToolCall({
  state,
  name,
  input,
  output,
  errorText,
}: MCPToolCallProps) {
  const [open, setOpen] = React.useState(false);
  const isRunning =
    state === 'loading' ||
    state === 'input-streaming' ||
    state === 'input-available' ||
    state === 'approval-responded';
  const statusLabel = isRunning ? 'in progress' : state.replace('-', ' ');

  return (
    <div className="group overflow-hidden transition-all">
      {/* Header */}
      <div
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-0 py-2 cursor-pointer select-none transition-colors"
      >
        {isRunning && (
          <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
        )}
        {!isRunning && state === 'output-available' && (
          <CheckCircle2 className="w-4 h-4 text-green-500" />
        )}
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] sm:text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 truncate">
            <ShimmerText active={isRunning}>
              {name}
            </ShimmerText>
          </span>
          <span className="text-[9px] sm:text-[10px] uppercase font-bold text-zinc-400 dark:text-zinc-500">
             {statusLabel}
          </span>
        </div>

        <ChevronDown
          className={cn(
            "w-4 h-4 text-zinc-400 transition-transform duration-300 ease-in-out",
            open ? 'rotate-180' : ''
          )}
        />
      </div>

      {/* Body */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="px-0 pb-3 sm:pb-4 space-y-3 sm:space-y-4 pt-2 sm:pt-3">
              {input && (
                <CodeBlock label="Request Parameters" content={formatContent(input)} />
              )}

              {state === 'output-available' && output && (
                <CodeBlock label="Response Output" content={formatContent(output)} />
              )}

              {state === 'output-error' && errorText && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/10 border border-red-100 dark:border-red-900/30 p-1">
                   <CodeBlock label="Error Message" content={formatContent(errorText)} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
