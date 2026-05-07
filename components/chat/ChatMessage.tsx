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
import { useI18n } from "@/lib/web-i18n";

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
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const REGEN_PREFIX = "\u2063__regen__\n";
  const COLLAPSE_THRESHOLD = 200;

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
  const isLong = textContent.length > COLLAPSE_THRESHOLD;

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
      toast.success(t("copiedToClipboard"));
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error(t("failedToCopy"));
    }
  };

  return (
    <div className="flex flex-col items-end gap-2 w-full">
      {textContent && (
        <div className="flex flex-col items-end gap-1 w-full max-w-[75%] sm:max-w-[640px]">
          {isEditing ? (
            <div className="flex flex-col gap-3 w-full bg-secondary/30 p-4 rounded-2xl border border-border/50 animate-in fade-in zoom-in-95 duration-200">
              <Textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="min-h-[100px] bg-background border-none focus-visible:ring-1 focus-visible:ring-primary/20 resize-none text-sm p-0 shadow-none leading-relaxed"
                placeholder={t("editYourMessage")}
                autoFocus
              />
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/50">
                <div className="flex items-center gap-1.5 text-[11px] text-orange-500/90 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{t("subsequentMessagesDeleted")}</span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditing(false)}
                    className="h-8 px-3 text-xs hover:bg-background/80"
                  >
                    {t("cancel")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={editValue.trim() === "" || editValue === textContent}
                    className="h-8 px-4 text-xs bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition-all"
                  >
                    {t("updateAndContinue")}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-secondary px-4 py-2.5 rounded-[20px] text-[17px] leading-relaxed font-instrument-serif tracking-wide w-fit max-w-full">
                <p className={`whitespace-pre-wrap break-words ${isLong && !isExpanded ? "line-clamp-3" : ""}`}>
                  {textContent}
                </p>
                {isLong && (
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="mt-1.5 text-xs font-instrument-serif tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isExpanded ? "Show less" : "Show more"}
                  </button>
                )}
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
                      <TooltipContent side="bottom">{t("edit")}</TooltipContent>
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
                    <TooltipContent side="bottom">{t("copy")}</TooltipContent>
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
  isStreaming = false,
}: any) {
  const { t } = useI18n();
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
      toast.success(t("copiedToClipboard"));
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error(t("failedToCopy"));
    }
  };

  return (
    <div className="flex flex-col items-start gap-3 w-full">
      {text && (
        <div className="flex flex-col gap-1 w-full">
          <div className="prose prose-sm dark:prose-invert max-w-full leading-relaxed font-instrument-serif tracking-wide text-muted-foreground/90 text-[17px]">
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
              {showActions && !isStreaming && (
                <div className="flex gap-1 items-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={handleCopy} className="p-1.5 rounded-md hover:bg-accent transition-colors">
                        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{t("copy")}</TooltipContent>
                  </Tooltip>

                  {onRegenerate && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button onClick={onRegenerate} className="p-1.5 rounded-md hover:bg-accent transition-colors">
                          <RefreshCw className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{t("regenerate")}</TooltipContent>
                    </Tooltip>
                  )}

                  {usage && (usage.inputTokens !== undefined || usage.outputTokens !== undefined || usage.totalTokens !== undefined) && (
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <div className="p-1.5 rounded-md hover:bg-accent text-muted-foreground transition-colors cursor-default">
                          <Gauge className="w-4 h-4" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="flex flex-col gap-2 p-3 bg-background border border-border/50 text-foreground shadow-md">
                        {usage.inputTokens !== undefined && (
                          <div className="flex items-center gap-2">
                            <ArrowDownLeft className="w-3.5 h-3.5 text-green-500" />
                            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("inputTokens")}</span>
                            <span className="text-[11px] font-bold ml-auto text-foreground">{usage.inputTokens.toLocaleString()}</span>
                          </div>
                        )}
                        {usage.outputTokens !== undefined && (
                          <div className="flex items-center gap-2">
                            <ArrowUpRight className="w-3.5 h-3.5 text-orange-500" />
                            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("outputTokens")}</span>
                            <span className="text-[11px] font-bold ml-auto text-foreground">{usage.outputTokens.toLocaleString()}</span>
                          </div>
                        )}
                        {usage.totalTokens !== undefined && (
                          <div className="flex items-center gap-2 border-t border-border/50 pt-2 mt-1">
                            <Sigma className="w-3.5 h-3.5 text-blue-500" />
                            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("totalTokens")}</span>
                            <span className="text-[11px] font-bold ml-auto text-foreground">{usage.totalTokens.toLocaleString()}</span>
                          </div>
                        )}
                      </TooltipContent>
                    </Tooltip>
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
