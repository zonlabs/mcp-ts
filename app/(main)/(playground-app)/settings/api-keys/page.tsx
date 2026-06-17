"use client";

import { LlmSettingsPanel } from "@/components/chat/LlmSettingsPanel";
import { useI18n } from "@/lib/web-i18n";

export default function ApiKeysPage() {
  const { t } = useI18n();

  return (
    <div className="px-1 md:px-6 pb-16">
      <div className="mb-5">
        <h1 className="text-3xl font-instrument-serif font-medium mb-1">{t("apiKeys")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("apiKeysDescription")}
        </p>
      </div>

      <div className="space-y-8 max-w-3xl">
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">{t("llmSettings")}</h3>
          <LlmSettingsPanel />
        </section>
      </div>
    </div>
  );
}