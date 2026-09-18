'use client';

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, ExternalLink } from "lucide-react";
import { ModelSelector } from "@/components/chat/ModelSelector";
import { DEFAULT_LLM_CONFIG, LlmConfig, normalizeLlmConfig, readLlmConfigFromStorage, writeLlmConfigToStorage } from "@/components/chat/llmConfig";
import { useI18n } from "@/lib/web-i18n";

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
    setConfig((prev) => normalizeLlmConfig({ ...prev, ...patch, provider: "openrouter" }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        {/* Model Selection via OpenRouter */}
        <div className="flex-1 min-w-[240px]">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            {t("model")}
          </label>
          <div className="h-9 flex items-center">
            <ModelSelector
              selectedModel={config.model}
              onSelect={(id) => updateConfig({ model: id })}
            />
          </div>
        </div>

        {/* OpenRouter API Key */}
        <div className="flex-1 min-w-[280px]">
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-muted-foreground">
              OpenRouter API Key
            </label>
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
            >
              <span>Get API key</span>
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
          <div className="relative">
            <Input
              type={showApiKey ? "text" : "password"}
              placeholder="sk-or-v1-..."
              value={config.apiKey || ""}
              onChange={(e) => updateConfig({ apiKey: e.target.value })}
              className="h-9 rounded-md bg-transparent border border-hairline pr-8 font-mono text-xs px-3 focus-visible:ring-1 focus-visible:ring-primary"
            />
            <button
              type="button"
              onClick={() => setShowApiKey((v) => !v)}
              className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
              aria-label={showApiKey ? t("hideApiKey") : t("showApiKey")}
            >
              {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full overflow-hidden shrink-0">
          <img
            src="/providers/openrouter.svg"
            alt=""
            className="h-3.5 w-3.5 object-contain"
          />
        </span>
        <span>{t("browserKeyPrivacy")}</span>
      </div>
    </div>
  );
}
