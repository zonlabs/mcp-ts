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
        <div className="flex flex-col items-end gap-1 w-full max-w-[85%] sm:max-w-[560px]">
          {isEditing ? (
            <div className="flex flex-col gap-3 w-full bg-card p-3.5 rounded-md border border-border">
              <Textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="min-h-[90px] bg-background border border-border focus-visible:ring-1 focus-visible:ring-ring resize-none text-xs font-sans p-2 shadow-none leading-relaxed text-foreground rounded-sm"
                placeholder={t("editYourMessage")}
                autoFocus
              />
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
                <div className="flex items-center gap-1.5 text-[11px] text-amber-500 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{t("subsequentMessagesDeleted")}</span>
                </div>
                <div className="flex items-center gap-1.5 ml-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditing(false)}
                    className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground rounded-sm"
                  >
                    {t("cancel")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={editValue.trim() === "" || editValue === textContent}
                    className="h-7 px-3 text-xs bg-primary hover:bg-primary/90 text-primary-foreground rounded-sm"
                  >
                    {t("updateAndContinue")}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-card border border-border px-3.5 py-2 rounded-md text-xs sm:text-[13px] leading-relaxed w-fit max-w-full text-foreground shadow-xs">
                <p className={`whitespace-pre-wrap break-words ${isLong && !isExpanded ? "line-clamp-3" : ""}`}>
                  {textContent}
                </p>
                {isLong && (
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="mt-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors font-mono"
                  >
                    {isExpanded ? "Show less" : "Show more"}
                  </button>
                )}
              </div>

              <TooltipProvider>
                <div className="flex gap-1 items-center">
                  {onEdit && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setIsEditing(true)}
                          className="p-1 rounded-xs hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">{t("edit")}</TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleCopy}
                        className="p-1 rounded-xs hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {copied ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">{t("copy")}</TooltipContent>
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
              className="rounded-md border border-border max-w-[300px] h-auto"
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
              aria-label={`pdf-${index}`}
              className="rounded-md border border-border"
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
    <div className="flex flex-col items-start gap-2.5 w-full text-foreground">
      {text && (
        <div className="flex flex-col gap-1 w-full">
          <div className="prose prose-sm dark:prose-invert max-w-full leading-relaxed text-body-strong text-xs sm:text-[13px]">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ inline, className, children, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || '');
                  const codeStyle = mounted && resolvedTheme === 'dark' ? oneDark : oneLight;

                  return !inline && match ? (
                    <div className="rounded-md border border-border overflow-hidden my-2">
                      <SyntaxHighlighter
                        style={codeStyle}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{
                          margin: 0,
                          padding: '12px',
                          background: 'transparent',
                          fontSize: '12px',
                          fontFamily: 'var(--font-dm-mono), monospace',
                        }}
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    </div>
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
            <div className="flex items-center gap-1 mt-1.5">
              {showActions && !isStreaming && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleCopy}
                        className="p-1 rounded-xs hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">{t("copy")}</TooltipContent>
                  </Tooltip>

                  {onRegenerate && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={onRegenerate}
                          className="p-1 rounded-xs hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">{t("regenerate")}</TooltipContent>
                    </Tooltip>
                  )}

                  {usage && (usage.inputTokens !== undefined || usage.outputTokens !== undefined || usage.totalTokens !== undefined) && (
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <div className="p-1 rounded-xs hover:bg-card text-muted-foreground hover:text-foreground transition-colors cursor-default">
                          <Gauge className="w-3.5 h-3.5" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="flex flex-col gap-1.5 p-2.5 bg-card border border-border text-foreground font-mono text-[11px]">
                        {usage.inputTokens !== undefined && (
                          <div className="flex items-center gap-2">
                            <ArrowDownLeft className="w-3 h-3 text-emerald-400" />
                            <span className="text-muted-foreground">{t("inputTokens")}:</span>
                            <span className="ml-auto font-semibold">{usage.inputTokens.toLocaleString()}</span>
                          </div>
                        )}
                        {usage.outputTokens !== undefined && (
                          <div className="flex items-center gap-2">
                            <ArrowUpRight className="w-3 h-3 text-amber-400" />
                            <span className="text-muted-foreground">{t("outputTokens")}:</span>
                            <span className="ml-auto font-semibold">{usage.outputTokens.toLocaleString()}</span>
                          </div>
                        )}
                        {usage.totalTokens !== undefined && (
                          <div className="flex items-center gap-2 border-t border-border pt-1 mt-0.5">
                            <Sigma className="w-3 h-3 text-blue-400" />
                            <span className="text-muted-foreground">{t("totalTokens")}:</span>
                            <span className="ml-auto font-semibold">{usage.totalTokens.toLocaleString()}</span>
                          </div>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </>
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
              className="rounded-md border border-border max-w-full h-auto"
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
              aria-label={`pdf-${index}`}
              className="rounded-md border border-border"
            />
          );
        }
        return null;
      })}
    </div>
  );
}
