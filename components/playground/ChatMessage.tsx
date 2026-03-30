'use client';

import { Copy, Check, RefreshCw, Gauge, ArrowUpRight, ArrowDownLeft, Sigma, Pencil, X, AlertTriangle } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

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

export function UserMessage({ message, parts, onEdit }: { 
  message: any; 
  parts?: any[]; 
  onEdit?: (newContent: string) => void 
}) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
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

  useEffect(() => {
    if (isEditing) {
      setEditValue(textContent);
    }
  }, [isEditing, textContent]);

  const handleSave = () => {
    if (onEdit && editValue.trim() !== "") {
      onEdit(editValue);
      setIsEditing(false);
    }
  };

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
    <div className="flex flex-col items-end gap-2 w-full">
      {textContent && (
        <div className="flex flex-col items-end gap-1 w-full max-w-[80%] sm:max-w-full">
          {isEditing ? (
            <div className="flex flex-col gap-3 w-full bg-secondary/30 p-4 rounded-2xl border border-border/50 animate-in fade-in zoom-in-95 duration-200">
               <Textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="min-h-[100px] bg-background border-none focus-visible:ring-1 focus-visible:ring-primary/20 resize-none text-sm p-0 shadow-none leading-relaxed"
                placeholder="Edit your message..."
                autoFocus
              />
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/50">
                <div className="flex items-center gap-1.5 text-[11px] text-orange-500/90 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Subsequent messages will be deleted</span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setIsEditing(false)}
                    className="h-8 px-3 text-xs hover:bg-background/80"
                  >
                    Cancel
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={handleSave}
                    disabled={editValue.trim() === "" || editValue === textContent}
                    className="h-8 px-4 text-xs bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition-all"
                  >
                    Update & Continue
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-secondary px-4 py-2.5 rounded-[20px] text-sm whitespace-pre-wrap">
                {textContent}
              </div>

              <TooltipProvider>
                <div className="flex gap-1">
                  {onEdit && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setIsEditing(true)}
                          className="p-1.5 rounded-md hover:bg-accent transition-colors"
                        >
                          <Pencil className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Edit</TooltipContent>
                    </Tooltip>
                  )}
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
            </>
          )}
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
  showActions = true,
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
              {showActions && (
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
              )}

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
