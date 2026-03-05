'use client';

import { User, Copy, Check } from "lucide-react";
import Image from "next/image";
import { useTheme } from "next-themes";
import { ReactNode, useEffect, useState } from "react";
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

  const getMessageContent = () => {
    if (typeof message === "string") return message;
    if (message?.content) {
      // Handle assistant-ui message format with content array
      if (Array.isArray(message.content)) {
        return message.content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join(" ");
      }
      return message.content;
    }
    return message?.text || "";
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
    <div className="flex flex-col items-end gap-2 group">
      {/* Text Content */}
      {textContent && (
        <div className="flex flex-col items-end gap-1 max-w-[80%]">
          <div className="bg-secondary px-4 py-2.5 rounded-[20px] text-sm">
            {textContent}
          </div>
          {/* Action Buttons */}
          <TooltipProvider>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
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
                <TooltipContent side="bottom">
                  <p>Copy</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      )}

      {/* File Attachments */}
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
  showReasoning = false,
}: any) {
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
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy");
    }
  };

  return (
    <div className="flex flex-col items-start gap-3 group w-full">
      {/* Text Content with Markdown */}
      {text && (
        <div className="flex flex-col gap-1 w-full">
          <div className="prose prose-sm dark:prose-invert max-w-full leading-7">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ node, inline, className, children, ...props }: any) {
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
          {/* Action Buttons */}
          <TooltipProvider>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
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
                <TooltipContent side="bottom">
                  <p>Copy</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      )}

      {/* File Attachments */}
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
