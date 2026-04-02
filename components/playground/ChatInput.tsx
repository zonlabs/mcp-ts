'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextTrigger,
} from "@/components/ai-elements/context";
import {
  ArrowUp,
  Plus,
  Square,
  X,
  FileIcon,
} from 'lucide-react';
import { normalizeLlmConfig, readLlmConfigFromStorage, writeLlmConfigToStorage } from '@/components/playground/llmConfig';
import { ModelSelector } from '@/components/playground/ModelSelector';
import { AVAILABLE_MODELS } from '@/components/playground/availableModels';

async function convertFilesToDataURLs(files: FileList) {
  return Promise.all(
    Array.from(files).map(
      (file) =>
        new Promise<{
          type: 'file';
          mediaType: string;
          url: string;
        }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              type: 'file',
              mediaType: file.type,
              url: reader.result as string,
            });
          reader.onerror = reject;
          reader.readAsDataURL(file);
        }),
    ),
  );
}

interface ChatInputProps {
  onSend: (data: { text?: string; parts?: any[] }) => void;
  onStop?: () => void;
  disabled?: boolean;
  status: 'ready' | 'submitted' | 'streaming' | 'error';
  contextUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
    cachedInputTokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export function ChatInput({ onSend, onStop, disabled, status, contextUsage }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<FileList | undefined>();
  const [input, setInput] = useState('');
  const [activeModel, setActiveModel] = useState<string>('');
  const [activeProvider, setActiveProvider] = useState<string>('');
  const [modelReady, setModelReady] = useState(false);

  const isPending = status === 'submitted' || status === 'streaming';
  const fileArray = files ? Array.from(files) : [];
  const tokenlensProvider =
    activeProvider === "gemini" ? "google" : activeProvider;
  const modelId =
    tokenlensProvider && activeModel ? `${tokenlensProvider}:${activeModel}` : undefined;
  const hasUsage = Boolean(contextUsage && (contextUsage.totalTokens || contextUsage.total_tokens));

  useEffect(() => {
    const load = () => {
      const normalizedConfig = normalizeLlmConfig(readLlmConfigFromStorage());
      setActiveModel(normalizedConfig.model || '');
      setActiveProvider(normalizedConfig.provider || '');
      setModelReady(true);
    };
    load();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'llm_config') load();
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const modelOptions = useMemo(() => {
    if (activeModel && !AVAILABLE_MODELS.find((m) => m.id === activeModel)) {
      return [
        ...AVAILABLE_MODELS,
        { id: activeModel, name: activeModel, provider: "Other" },
      ];
    }
    return AVAILABLE_MODELS;
  }, [activeModel]);

  const handleSend = async () => {
    const value = input.trim();
    if (!value && !fileArray.length) return;

    const fileParts = files ? await convertFilesToDataURLs(files) : [];

    onSend({
      parts: [
        ...(value ? [{ type: 'text', text: value }] : []),
        ...fileParts,
      ],
    });

    setInput('');
    setFiles(undefined);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="w-full px-0">
      <div
        className="
          bg-white dark:bg-transparent
          rounded-2xl border-2
          border-gray-400 dark:border-zinc-700
          shadow-xl
          hover:border-gray-500 dark:hover:border-zinc-600
          transition-colors
        "
      >
        <div className="flex flex-col">
          {/* FILE PREVIEW (INSIDE INPUT) */}
          {fileArray.length > 0 && (
            <div className="flex flex-wrap gap-2 px-2 pt-2">
              {fileArray.map((file, idx) => {
                const isImage = file.type.startsWith('image/');
                const previewUrl = isImage
                  ? URL.createObjectURL(file)
                  : null;

                return (
                  <div
                    key={idx}
                    className="
                      relative group
                      rounded-lg border border-zinc-300 dark:border-zinc-700
                      bg-zinc-50 dark:bg-zinc-900
                      overflow-hidden
                    "
                  >
                    {isImage && previewUrl ? (
                      <div className="relative h-10 w-10">
                        <Image
                          src={previewUrl}
                          alt={file.name}
                          fill
                          sizes="20px"
                          className="object-cover"
                          onLoad={() => URL.revokeObjectURL(previewUrl)}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 px-2 py-1.5 max-w-[160px]">
                        <FileIcon className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs truncate">
                          {file.name}
                        </span>
                      </div>
                    )}

                    {/* REMOVE FILE */}
                    <button
                      type="button"
                      onClick={() => {
                        const dt = new DataTransfer();
                        fileArray.forEach((f, i) => {
                          if (i !== idx) dt.items.add(f);
                        });
                        setFiles(dt.files.length ? dt.files : undefined);
                        if (fileInputRef.current) {
                          fileInputRef.current.files = dt.files;
                        }
                      }}
                      className="
                        absolute top-1 right-1
                        rounded-full bg-black/60 text-white
                        p-0.5 opacity-0 group-hover:opacity-100
                        transition
                      "
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* TEXTAREA */}
          <div className="px-2 pt-2">
            <Textarea
              ref={textareaRef}
              value={input}
              placeholder="Type your prompt..."
              disabled={disabled}
              rows={1}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 120) + 'px';
              }}
              className="
                w-full resize-none bg-transparent border-0 outline-none
                text-gray-900 dark:text-white
                placeholder-gray-500 dark:placeholder-gray-400
                text-sm sm:text-[15px]
                leading-relaxed
                focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0
                [&:focus]:outline-none [&:focus]:ring-0 [&:focus]:border-0
              "
              style={{
                minHeight: '50px',
                maxHeight: '120px',
                overflowY: 'auto',
              }}
            />
          </div>

          {/* ACTION ROW */}
          <div className="flex items-center justify-between gap-2 flex-nowrap px-2 pb-2">
            {/* LEFT */}
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) =>
                  e.target.files && setFiles(e.target.files)
                }
              />

              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 sm:h-8 sm:w-8 rounded-full cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
                disabled={isPending}
              >
                <Plus className="w-4 h-4 text-muted-foreground" />
              </Button>
              {modelReady && modelOptions.length > 0 ? (
                <ModelSelector
                  models={modelOptions}
                  selectedModel={activeModel}
                  onSelect={(id) => {
                    const current = readLlmConfigFromStorage();
                    const selected = modelOptions.find((m) => m.id === id);
                    const providerMap: Record<string, string> = {
                      OpenAI: "openai",
                      DeepSeek: "deepseek",
                      Gemini: "gemini",
                      Anthropic: "anthropic",
                    };
                    const provider = selected?.provider
                      ? (providerMap[selected.provider] || current.provider)
                      : current.provider;
                    const next = { ...current, model: id, provider };
                    writeLlmConfigToStorage(next);
                    setActiveModel(id);
                    setActiveProvider(provider || '');
                  }}
                />
              ) : null}
            </div>

            {/* RIGHT */}
            <div className="flex items-center gap-1.5 shrink-0">
              {hasUsage && (
                <Context
                  modelId={modelId}
                  usage={contextUsage}
                  usedTokens={contextUsage?.totalTokens ?? contextUsage?.total_tokens}
                >
                  <ContextTrigger />
                  <ContextContent>
                    <ContextContentHeader />
                    <ContextContentBody>
                      <ContextInputUsage />
                      <ContextOutputUsage />
                      <ContextReasoningUsage />
                      <ContextCacheUsage />
                    </ContextContentBody>
                    <ContextContentFooter />
                  </ContextContent>
                </Context>
              )}

              {/* <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 sm:h-8 sm:w-8 rounded-full"
                disabled={isPending}
              >
                <Mic className="w-4 h-4 text-muted-foreground" />
              </Button> */}

              <Button
                onClick={isPending ? onStop : handleSend}
                disabled={
                  (isPending && !onStop) ||
                  (!isPending &&
                    (disabled || (!input.trim() && !fileArray.length)))
                }
                className="
                  bg-gray-900 hover:bg-gray-800
                  dark:bg-zinc-800 dark:hover:bg-zinc-700
                  dark:text-white text-white
                  h-7 w-7 sm:h-8 sm:w-8
                  rounded-lg p-1.5
                  shadow-lg
                  cursor-pointer
                  disabled:opacity-50
                "
              >
                {isPending ? (
                  <Square className="w-3.5 h-3.5 text-white" />
                ) : (
                  <ArrowUp className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
