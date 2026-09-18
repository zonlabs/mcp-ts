export interface LlmConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

const LLM_CONFIG_STORAGE_KEY = "llm_config";

export const DEFAULT_LLM_CONFIG: LlmConfig = {
  provider: "openrouter",
  model: "openrouter/auto",
  apiKey: "",
};

export function readLlmConfigFromStorage(): LlmConfig {
  if (typeof window === "undefined") return { ...DEFAULT_LLM_CONFIG };

  const stored = localStorage.getItem(LLM_CONFIG_STORAGE_KEY);
  if (!stored) return { ...DEFAULT_LLM_CONFIG };

  try {
    const parsed = JSON.parse(stored);
    return {
      provider: "openrouter",
      apiKey: parsed.llm_api_key || "",
      model: parsed.llm_name || DEFAULT_LLM_CONFIG.model,
    };
  } catch {
    return { ...DEFAULT_LLM_CONFIG };
  }
}

export function writeLlmConfigToStorage(config: LlmConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    LLM_CONFIG_STORAGE_KEY,
    JSON.stringify({
      llm_provider: "openrouter",
      llm_api_key: config.apiKey?.trim() || "",
      llm_name: (config.model || DEFAULT_LLM_CONFIG.model).trim(),
    }),
  );
}

export function normalizeLlmConfig(config: LlmConfig): LlmConfig {
  return {
    provider: "openrouter",
    model: (config.model || DEFAULT_LLM_CONFIG.model).trim(),
    apiKey: config.apiKey?.trim() || "",
  };
}
