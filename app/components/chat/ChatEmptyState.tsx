'use client';

import React from 'react';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { ChatInput } from '@/components/chat/ChatInput';
import { RecipeComponent } from '@/components/chat/RecipeComponent';
import { useI18n } from '@/lib/web-i18n';

interface ChatEmptyStateProps {
  projectInfo: { name: string; id: string; custom_instructions?: string | null } | null;
  isReadOnly: boolean;
  chatInput: string;
  setChatInput: (input: string) => void;
  sendChatInput: (data: { text?: string; parts?: any[] }) => void;
  stop: () => void;
  status: 'ready' | 'submitted' | 'streaming' | 'error';
  contextUsage?: any;
}

export function ChatEmptyState({
  projectInfo,
  isReadOnly,
  chatInput,
  setChatInput,
  sendChatInput,
  stop,
  status,
  contextUsage,
}: ChatEmptyStateProps) {
  const { t } = useI18n();

  const mobileStarterPrompts = [
    {
      label: t("recipeGithubIssueSummary"),
      prompt: 'Use GitHub to retrieve the latest open issues for this repository and summarize the most critical bugs.',
      icon: 'https://logos.composio.dev/api/github',
    },
    {
      label: t("recipeSemanticSearch"),
      prompt: 'Search the web using Exa to find the latest research papers on LLM optimization from the past month.',
      icon: 'https://awsmp-logos.s3.amazonaws.com/seller-7s5a3z2w3unay/b6519f9126c0432087c79827b95283c6.png',
    },
    {
      label: 'Draft Follow-Up Email',
      prompt: 'Draft a clear, professional follow-up email using composio mcp to get access to Gmail. Infer an appropriate subject line and message content from the available context. The email should be concise, polite, and ready for review',
      icon: 'https://logos.composio.dev/api/gmail',
    },
    {
      label: t("recipeNotionMeetingPrep"),
      prompt: 'Generate a briefing document by synthesizing project notes and recent updates directly from Notion.',
      icon: 'https://api.iconify.design/logos:notion-icon.svg',
    },
  ];

  return (
    <>
      {/* Mobile view */}
      <div className="sm:hidden flex-1 min-h-0 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-4 pb-24">
          {!projectInfo && (
            <>
              <div className="mb-7">
                <Image
                  src="/logo-light.svg"
                  alt="Assistant logo"
                  width={46}
                  height={46}
                  className="opacity-90"
                />
              </div>
              <div className="w-full max-w-xs">
                <p className="mb-2 px-1 text-[10px] font-mono font-medium uppercase tracking-wider text-muted-foreground/80">
                  {t("quickActions")}
                </p>
                <div className="space-y-1">
                  {mobileStarterPrompts.map((item) => (
                    <button
                      key={item.label}
                      onClick={() => sendChatInput({ text: item.prompt })}
                      className="w-full text-left rounded-lg px-2.5 py-2 text-sm text-foreground/90 hover:bg-accent/30 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <img
                          src={item.icon}
                          alt=""
                          className="w-3.5 h-3.5 rounded-sm object-cover shrink-0 opacity-90"
                        />
                        <span className="line-clamp-1">{item.label}</span>
                        <ArrowUpRight className="w-3.5 h-3.5 ml-auto text-muted-foreground" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent pt-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
          <div className="px-1">
            {isReadOnly ? (
              <div className="w-full text-center p-3 text-sm text-muted-foreground bg-secondary/50 rounded-lg border border-border/50 backdrop-blur-sm">
                {t("readOnlySharedChat")}
              </div>
            ) : (
              <ChatInput
                onSend={sendChatInput}
                onStop={stop}
                status={status}
                disabled={isReadOnly}
                contextUsage={contextUsage}
              />
            )}
          </div>
        </div>
      </div>

      {/* Desktop view */}
      <div className="hidden sm:flex flex-1 min-h-0 flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-2xl mx-auto space-y-7">
          {!projectInfo && (
            <div className="text-center">
              <h1 className="text-4xl md:text-5xl font-sans font-normal tracking-[-1.5px] text-foreground leading-tight">
                {t("chatHeroTitle")}
              </h1>
            </div>
          )}

          {isReadOnly ? (
            <div className="w-full text-center p-4 text-sm text-muted-foreground bg-secondary/50 rounded-lg border border-border/50 backdrop-blur-sm">
              {t("readOnlySharedChat")}
            </div>
          ) : (
            <ChatInput
              input={chatInput}
              onInputChange={setChatInput}
              onSend={sendChatInput}
              onStop={stop}
              status={status}
              disabled={isReadOnly}
              contextUsage={contextUsage}
            />
          )}

          {!projectInfo && (
            <div className="w-full px-1">
              <RecipeComponent
                onAction={(prompt) => setChatInput(prompt)}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
