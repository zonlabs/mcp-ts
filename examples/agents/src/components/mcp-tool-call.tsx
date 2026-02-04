"use client";

import * as React from "react";
import { CheckCircle2, ChevronDown, Copy } from "lucide-react";

type ToolCallData = Record<string, unknown> | string | null | undefined;

interface ToolCallProps {
  status: "complete" | "executing" | "inProgress";
  name?: string;
  args?: ToolCallData;
  result?: ToolCallData;
}

const formatContent = (content: ToolCallData): string => {
  if (!content) return "";
  return typeof content === "object"
    ? JSON.stringify(content, null, 2)
    : String(content);
};

function ShimmerText({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="
        animate-shimmer
        bg-gradient-to-r
        from-gray-400
        via-gray-900
        to-gray-400
        dark:from-gray-600
        dark:via-white
        dark:to-gray-600
        bg-[length:200%_100%]
        bg-clip-text text-transparent
        font-medium
      "
    >
      {children}
    </span>
  );
}

function CodeBlock({ label, content }: { label: string; content: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs font-medium text-gray-600 dark:text-gray-400">
        {label}
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(content);
          }}
          className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition"
        >
          <Copy className="w-3 h-3" />
          Copy
        </button>
      </div>
      <pre className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded p-2 text-xs overflow-auto max-h-[240px] font-mono">
        {content}
      </pre>
    </div>
  );
}

export function MCPToolCall({
  status,
  name = "Tool Call",
  args,
  result,
}: ToolCallProps) {
  const [open, setOpen] = React.useState(false);

  const isComplete = status === "complete";
  const isRunning = !isComplete;

  return (
    <div className="border border-gray-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-950 overflow-hidden max-w-4xl">
      <div
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between px-3 py-2 cursor-pointer select-none"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isComplete && (
            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
          )}
          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {isRunning ? <ShimmerText>{name}</ShimmerText> : name}
          </span>
          <span
            className={`text-xs font-medium ${
              isComplete
                ? "text-green-600 dark:text-green-400"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {isComplete ? "Completed" : "In Progress"}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </div>

      <div
        className={`grid transition-all duration-200 ease-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-3 py-2 space-y-3 border-t border-gray-200 dark:border-zinc-700">
            {args && <CodeBlock label="ARGS" content={formatContent(args)} />}
            {isComplete && result && (
              <CodeBlock label="RESULT" content={formatContent(result)} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
