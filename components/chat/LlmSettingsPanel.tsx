'use client';

import { useMemo, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff } from "lucide-react";
import { ModelSelector } from "@/components/chat/ModelSelector";
import { AVAILABLE_MODELS } from "@/components/chat/availableModels";
import { LLM_PROVIDERS, getProviderIconUrl } from "@/components/chat/llmProviders";
import { DEFAULT_LLM_CONFIG, LlmConfig, normalizeLlmConfig, readLlmConfigFromStorage, writeLlmConfigToStorage } from "@/components/chat/llmConfig";
import { useI18n } from "@/lib/web-i18n";

const MODEL_PROVIDER_NAME_TO_ID: Record<string, string> = {
  OpenAI: "openai",
  DeepSeek: "deepseek",
  Gemini: "gemini",
  Anthropic: "anthropic",
};

const PROVIDER_ID_TO_NAME: Record<string, string> = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
  gemini: "Gemini",
  anthropic: "Anthropic",
};

export function LlmSettingsPanel() {
  const { t } = useI18n();
  const [config, setConfig] = useState<LlmConfig>(DEFAULT_LLM_CONFIG);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    setConfig(readLlmConfigFromStorage());
    setHasLoaded(true);
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;
    writeLlmConfigToStorage(config);
  }, [config, hasLoaded]);

  const updateConfig = (patch: Partial<LlmConfig>) => {
    setConfig((prev) => normalizeLlmConfig({ ...prev, ...patch }));
  };

  const modelOptions = useMemo(() => {
    const providerLabel = PROVIDER_ID_TO_NAME[config.provider] || "";

    const base = AVAILABLE_MODELS.filter((m) =>
      providerLabel ? m.provider === providerLabel : false
    );

    if (!base.find((m) => m.id === config.model)) {
      return [
        ...base,
        {
          id: config.model,
          name: config.model || t("custom"),
          description: t("customModelDescription"),
          provider: t("custom"),
          tag: t("custom"),
        },
      ];
    }

    return base;
  }, [config.provider, config.model, t]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs font-instrument-serif font-medium uppercase tracking-[0.16em] text-muted-foreground mb-1">
            {t("provider")}
          </label>
          <Select
            value={config.provider}
            onValueChange={(value) => updateConfig({ provider: value })}
          >
          <SelectTrigger className="h-9 rounded-md bg-transparent border-0 shadow-none focus:ring-0 focus:ring-offset-0 px-0 justify-start gap-1 [&>svg]:ml-1">
            <SelectValue placeholder={t("selectProvider")} />
          </SelectTrigger>
            <SelectContent>
              {LLM_PROVIDERS.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  <div className="flex items-center gap-2">
                    {provider.iconUrl ? (
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-xs">
                        <img
                          src={provider.iconUrl}
                          alt=""
                          className="h-4 w-4"
                        />
                      </span>
                    ) : null}
                    <span>{provider.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs font-instrument-serif font-medium uppercase tracking-[0.16em] text-muted-foreground mb-1">
            {t("model")}
          </label>
          <ModelSelector
            models={modelOptions}
            selectedModel={config.model}
            onSelect={(id) => {
              const selected = modelOptions.find((m) => m.id === id);
              const nextProvider =
                selected?.provider && MODEL_PROVIDER_NAME_TO_ID[selected.provider]
                  ? MODEL_PROVIDER_NAME_TO_ID[selected.provider]
                  : config.provider;
              updateConfig({
                model: id,
                provider: nextProvider,
              });
            }}
          />
        </div>

        <div className="flex-1 min-w-[260px]">
          <label className="block text-xs font-instrument-serif font-medium uppercase tracking-[0.16em] text-muted-foreground mb-1">
            {t("apiKey")}
          </label>
          <div className="relative">
            <Input
              type={showApiKey ? "text" : "password"}
              placeholder={t("pasteApiKey")}
              value={config.apiKey || ""}
              onChange={(e) => updateConfig({ apiKey: e.target.value })}
              className="h-9 rounded-none bg-transparent border-0 border-b border-gray-200 dark:border-zinc-800 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 pr-7 font-mono text-xs px-0"
            />
            <button
              type="button"
              onClick={() => setShowApiKey((v) => !v)}
              className="absolute inset-y-0 right-1 flex items-center text-muted-foreground hover:text-foreground"
              aria-label={showApiKey ? t("hideApiKey") : t("showApiKey")}
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[15px] font-instrument-serif tracking-wide text-muted-foreground">
        {getProviderIconUrl(config.provider) ? (
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-xs">
            <img
              src={getProviderIconUrl(config.provider)}
              alt=""
              className="h-3.5 w-3.5"
            />
          </span>
        ) : null}
        <span>{t("browserKeyPrivacy")}</span>
      </div>
    </div>
  );
}
