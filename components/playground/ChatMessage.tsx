'use client';

import { Copy, Check, RefreshCw, Gauge, ArrowUpRight, ArrowDownLeft, Sigma } from "lucide-react";
import Image from "next/image";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { toast } from "react-hot-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type MessageLike = {
  role?: string;
  content?: any;
  text?: string;
};

function AssistantAvatar() {
  return (
    <div className="w-full h-full flex items-center justify-center rounded-full bg-muted">
      <Image
        src="/logo.svg"
        alt="Assistant avatar"
        width={32}
        height={32}
        className="rounded-full object-contain"
      />
    </div>
  );
}

export function UserMessage({ message, parts }: any) {
  const [copied, setCopied] = useState(false);
  const REGEN_PREFIX = "\u2063__regen__\n";

  const getMessageContent = () => {
    if (typeof message === "string") return message;
    if (message?.content) {
      if (Array.isArray(message.content)) {
        return message.content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join(" ");
      }
      return message.content;
    }
    const raw = message?.text || "";
    if (typeof raw === "string" && raw.startsWith(REGEN_PREFIX)) return "";
    return raw;
  };

  const textContent = getMessageContent();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textContent);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy");
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      {textContent && (
        <div className="flex flex-col items-end gap-1 max-w-[80%]">
          <div className="bg-secondary px-4 py-2.5 rounded-[20px] text-sm">
            {textContent}
          </div>

          <TooltipProvider>
            <div className="flex gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleCopy}
                    className="p-1.5 rounded-md hover:bg-accent transition-colors"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Copy</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      )}

      {parts?.map((part: any, index: number) => {
        if (part.type === 'file' && part.mediaType?.startsWith('image/')) {
          return (
            <Image
              key={index}
              src={part.url}
              width={300}
              height={300}
              alt={`attachment-${index}`}
              className="rounded-lg max-w-[300px] h-auto"
            />
          );
        }
        if (part.type === 'file' && part.mediaType === 'application/pdf') {
          return (
            <iframe
              key={index}
              src={part.url}
              width={400}
              height={500}
              title={`pdf-${index}`}
              className="rounded-lg border"
            />
          );
        }
        return null;
      })}
    </div>
  );
}

export function AssistantMessage({
  text,
  parts,
  onRegenerate,
  usage,
}: any) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy");
    }
  };

  return (
    <div className="flex flex-col items-start gap-3 w-full">
      {text && (
        <div className="flex flex-col gap-1 w-full">
          <div className="prose prose-sm dark:prose-invert max-w-full leading-7">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ inline, className, children, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || '');
                  const codeStyle = mounted && resolvedTheme === 'dark' ? oneDark : oneLight;

                  return !inline && match ? (
                    <SyntaxHighlighter
                      style={codeStyle}
                      language={match[1]}
                      PreTag="div"
                      {...props}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
              }}
            >
              {text}
            </ReactMarkdown>
          </div>

<TooltipProvider>
            <div className="flex flex-col gap-3 mt-2">
              {/* Action Buttons Row */}
              <div className="flex gap-1 items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={handleCopy} className="p-1.5 rounded-md hover:bg-accent transition-colors">
                      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Copy</TooltipContent>
                </Tooltip>

                {onRegenerate && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={onRegenerate} className="p-1.5 rounded-md hover:bg-accent transition-colors">
                        <RefreshCw className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Regenerate</TooltipContent>
                  </Tooltip>
                )}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setShowUsage(!showUsage)}
                      className={`p-1.5 rounded-md transition-all ${showUsage
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-accent text-muted-foreground"
                        }`}
                    >
                      <Gauge className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{showUsage ? "Hide metrics" : "Show metrics"}</TooltipContent>
                </Tooltip>
              </div>

              {/* ✅ Stylish Usage Metrics on a New Line */}
              {showUsage && usage && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 w-fit animate-in fade-in slide-in-from-top-1 duration-200">
                  {usage.totalTokens && (
                    <div className="flex items-center gap-1.5">
                      <Sigma className="w-3.5 h-3.5 text-blue-500" />
                      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total Tokens</span>
                      <span className="text-[11px] font-bold">{usage.totalTokens}</span>
                    </div>
                  )}

                  {usage.inputTokens && (
                    <div className="flex items-center gap-1.5 border-l pl-4 border-border">
                      <ArrowDownLeft className="w-3.5 h-3.5 text-green-500" />
                      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Input Tokens</span>
                      <span className="text-[11px] font-bold">{usage.inputTokens}</span>
                    </div>
                  )}

                  {usage.outputTokens && (
                    <div className="flex items-center gap-1.5 border-l pl-4 border-border">
                      <ArrowUpRight className="w-3.5 h-3.5 text-orange-500" />
                      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Output Tokens</span>
                      <span className="text-[11px] font-bold">{usage.outputTokens}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </TooltipProvider>
        </div>
      )}

      {parts?.map((part: any, index: number) => {
        if (part.type === 'file' && part.mediaType?.startsWith('image/')) {
          return (
            <Image
              key={index}
              src={part.url}
              width={500}
              height={500}
              alt={`attachment-${index}`}
              className="rounded-lg max-w-full h-auto"
            />
          );
        }
        if (part.type === 'file' && part.mediaType === 'application/pdf') {
          return (
            <iframe
              key={index}
              src={part.url}
              width={500}
              height={600}
              title={`pdf-${index}`}
              className="rounded-lg border"
            />
          );
        }
        return null;
      })}
    </div>
  );
}