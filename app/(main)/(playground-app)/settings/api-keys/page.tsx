"use client";

import { LlmSettingsPanel } from "@/components/chat/LlmSettingsPanel";
import { useI18n } from "@/lib/web-i18n";

export default function ApiKeysPage() {
  const { t } = useI18n();

  return (
    <div className="w-full max-w-3xl px-6 py-8 space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="space-y-1 pb-4 border-b border-hairline">
        <h1 className="text-lg font-medium tracking-tight text-ink">{t("apiKeys")}</h1>
        <p className="text-xs text-mute">
          {t("apiKeysDescription")}
        </p>
      </div>

      <div className="space-y-6">
        <section className="space-y-3">
          <LlmSettingsPanel />
        </section>
      </div>
    </div>
  );
}