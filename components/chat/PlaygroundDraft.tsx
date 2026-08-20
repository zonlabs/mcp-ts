"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChatInput } from "@/components/chat/ChatInput";
import { RecipeComponent } from "@/components/chat/RecipeComponent";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/web-i18n";

export function PlaygroundDraft() {
  const { t } = useI18n();
  const router = useRouter();
  const [status, setStatus] = useState<"ready" | "submitted" | "streaming" | "error">("ready");
  const [chatInput, setChatInput] = useState("");

  const sendDraft = async (data: { text?: string; parts?: any[] }) => {
    if (status !== "ready") return;
    if (!data?.text && (!data?.parts || data.parts.length === 0)) return;
    setStatus("submitted");
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) {
        setStatus("ready");
        return;
      }

      const { data: chatRow, error } = await supabase
        .from("chats")
        .insert({ user_id: userId, title: "New Chat" })
        .select("id")
        .single();

      if (error || !chatRow?.id) {
        console.error("[PlaygroundDraft] failed to create chat:", error);
        setStatus("error");
        return;
      }

      const payload = data.parts?.length ? { parts: data.parts } : { text: data.text };
      sessionStorage.setItem("pending_chat_message", JSON.stringify(payload));

      window.dispatchEvent(new CustomEvent("chat:created", { detail: { chatId: chatRow.id } }));
      router.push(`/chat/${chatRow.id}`);
    } finally {
      setStatus("ready");
    }
  };

  return (
    <div className="flex flex-col h-full w-full flex-1 min-h-0 min-w-0 bg-background font-sans select-none items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-2xl mx-auto space-y-7 animate-in fade-in zoom-in-95 duration-500">
        {/* Warp Headline */}
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl font-sans font-normal tracking-[-1.5px] text-foreground leading-tight">
            {t("chatHeroTitle")}
          </h1>
        </div>

        {/* Elevated Chat Input */}
        <div className="w-full">
          <ChatInput
            input={chatInput}
            onInputChange={setChatInput}
            onSend={sendDraft}
            status={status}
            disabled={status === "submitted" || status === "streaming"}
          />
        </div>

        {/* Authentic Prompt Recipes */}
        <div className="w-full px-1">
          <RecipeComponent
            onAction={(prompt) => {
              setChatInput(prompt);
            }}
          />
        </div>
      </div>
    </div>
  );
}
