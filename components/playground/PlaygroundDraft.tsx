'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { ChatInput } from '@/components/playground/ChatInput';
import { RecipeComponent } from '@/components/playground/RecipeComponent';
import { createClient } from '@/lib/supabase/client';

const MOBILE_STARTER_PROMPTS = [
  {
    label: 'Market Analysis',
    prompt: 'Use Alpha Vantage to fetch the last 30 days of daily prices for {TICKER}. Summarize whether the price trend is up, down, or flat.',
    icon: 'https://media.licdn.com/dms/image/v2/C4E0BAQExXHCGjZYOeg/company-logo_200_200/company-logo_200_200/0/1635279005628/alpha_vantage_inc_logo?e=2147483647&v=beta&t=1eCKMzXdgp4XiMrzN4edDUCqMdUSHQ9nx5nXjD8RQ3Q',
  },
  {
    label: 'Semantic Search',
    prompt: 'Search the web using Exa to find the latest research papers on LLM optimization from the past month.',
    icon: 'https://awsmp-logos.s3.amazonaws.com/seller-7s5a3z2w3unay/b6519f9126c0432087c79827b95283c6.png',
  },
  {
    label: 'Draft Follow-Up Email',
    prompt: 'Draft a clear, professional follow-up email using Rube with access to Gmail. Infer an appropriate subject line and message content from the available context. The email should be concise, polite, and ready for review',
    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRIB8EFu3xpWgE33JuAX-U-1geBFJnk8PAJSA&s',
  },
  {
    label: 'Notion Meeting Prep',
    prompt: 'Generate a briefing document by synthesizing project notes and recent updates directly from Notion.',
    icon: 'https://api.iconify.design/logos:notion-icon.svg',
  },
];

export function PlaygroundDraft() {
  const router = useRouter();
  const [status, setStatus] = useState<'ready' | 'submitted' | 'streaming' | 'error'>('ready');

  const sendDraft = async (data: { text?: string; parts?: any[] }) => {
    if (status !== 'ready') return;
    if (!data?.text && (!data?.parts || data.parts.length === 0)) return;
    setStatus('submitted');
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) {
        setStatus('ready');
        return;
      }

      const { data: chatRow, error } = await supabase
        .from('chats')
        .insert({ user_id: userId, title: 'New Chat' })
        .select('id')
        .single();

      if (error || !chatRow?.id) {
        console.error('[PlaygroundDraft] failed to create chat:', error);
        setStatus('error');
        return;
      }

      const payload = data.parts?.length
        ? { parts: data.parts }
        : { text: data.text };
      sessionStorage.setItem('pending_chat_message', JSON.stringify(payload));

      window.dispatchEvent(new CustomEvent('chat:created', { detail: { chatId: chatRow.id } }));
      router.push(`/chat/${chatRow.id}`);
    } finally {
      setStatus('ready');
    }
  };

  const promptButtons = useMemo(() => MOBILE_STARTER_PROMPTS, []);

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Mobile Empty State */}
      <div className="sm:hidden flex-1 min-h-0 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-4 pb-24">
          <div className="mb-7">
            <Image
              src="/logo.svg"
              alt="Assistant logo"
              width={46}
              height={46}
              className="opacity-90"
            />
          </div>
          <div className="w-full max-w-xs">
            <p className="mb-2 px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
              Quick Actions
            </p>
            <div className="space-y-1">
              {promptButtons.map((item) => (
                <button
                  key={item.label}
                  onClick={() => sendDraft({ text: item.prompt })}
                  className="w-full text-left rounded-lg px-2.5 py-2 text-sm text-foreground/90 hover:bg-accent/30 transition-colors"
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
        </div>

        <div className="sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent pt-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
          <div className="px-1">
            <ChatInput
              onSend={sendDraft}
              status={status}
              disabled={status === 'submitted' || status === 'streaming'}
            />
          </div>
        </div>
      </div>

      {/* Desktop Empty State */}
      <div className="hidden sm:flex flex-1 min-h-0 flex-col items-center justify-center px-6">
        <div className="w-full max-w-3xl space-y-8">
          <div className="text-center animate-in fade-in zoom-in-95 duration-1000">
            <h1 className="text-5xl md:text-6xl font-serif tracking-tight text-foreground mb-10 leading-tight">
              Let&apos;s figure it out together
            </h1>
          </div>

          <ChatInput
            onSend={sendDraft}
            status={status}
            disabled={status === 'submitted' || status === 'streaming'}
          />

          <div className="px-4">
            <RecipeComponent
              onAction={(prompt) => sendDraft({ text: prompt })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
