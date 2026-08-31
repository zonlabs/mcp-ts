"use client";

import { LlmSettingsPanel } from "@/components/chat/LlmSettingsPanel";
import { useI18n } from "@/lib/web-i18n";

export default function ApiKeysPage() {
  const { t } = useI18n();

  return (
    <div className="flex-1 h-full overflow-y-auto scrollbar-minimal w-full">
      <div className="w-full max-w-3xl px-6 py-8 pb-20 space-y-6 animate-in fade-in duration-200">
        {/* Header */}
        <div className="space-y-1 pb-4 border-b border-border">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">{t("apiKeys")}</h1>
          <p className="text-xs text-muted-foreground">
            Manage LLM provider API keys and model configurations.
          </p>
        </div>

        <div className="space-y-6">
          <section className="space-y-3">
            <LlmSettingsPanel />
          </section>
        </div>
      </div>
    </div>
  );
}