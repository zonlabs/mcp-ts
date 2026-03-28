export interface LlmConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

const LLM_CONFIG_STORAGE_KEY = "llm_config";

export const DEFAULT_LLM_CONFIG: LlmConfig = {
  provider: "openai",
  model: "gpt-4.1-mini",
  apiKey: "",
  baseUrl: "",
};

export function readLlmConfigFromStorage(): LlmConfig {
  if (typeof window === "undefined") return { ...DEFAULT_LLM_CONFIG };

  const stored = localStorage.getItem(LLM_CONFIG_STORAGE_KEY);
  if (!stored) return { ...DEFAULT_LLM_CONFIG };

  try {
    const parsed = JSON.parse(stored);
    return {
      ...DEFAULT_LLM_CONFIG,
      provider: parsed.llm_provider || DEFAULT_LLM_CONFIG.provider,
      apiKey: parsed.llm_api_key || DEFAULT_LLM_CONFIG.apiKey,
      model: parsed.llm_name || DEFAULT_LLM_CONFIG.model,
      baseUrl: parsed.llm_base_url || DEFAULT_LLM_CONFIG.baseUrl,
    };
  } catch {
    return { ...DEFAULT_LLM_CONFIG };
  }
}

export function writeLlmConfigToStorage(config: LlmConfig) {
  if (typeof window === "undefined") return;
  const normalized = normalizeLlmConfig(config);
  localStorage.setItem(
    LLM_CONFIG_STORAGE_KEY,
    JSON.stringify({
      llm_provider: normalized.provider,
      llm_api_key: normalized.apiKey,
      llm_name: normalized.model,
      llm_base_url: normalized.baseUrl,
    }),
  );
}

export function normalizeLlmConfig(config: LlmConfig): LlmConfig {
  return {
    ...config,
    model: (config.model || DEFAULT_LLM_CONFIG.model).trim(),
    baseUrl: config.baseUrl?.trim() || "",
  };
}
