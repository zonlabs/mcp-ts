export interface LlmConfig {
  provider: string;
  model: string;
  apiKey?: string;
  customModel?: string;
  baseUrl?: string;
}

export const DEFAULT_LLM_CONFIG: LlmConfig = {
  provider: "openai",
  model: "gpt-4.1-mini",
  apiKey: "",
  customModel: "",
  baseUrl: "",
};

export function readLlmConfigFromStorage(): LlmConfig {
  if (typeof window === "undefined") return { ...DEFAULT_LLM_CONFIG };

  const stored = localStorage.getItem("llm_config");
  if (!stored) return { ...DEFAULT_LLM_CONFIG };

  try {
    const parsed = JSON.parse(stored);
    const provider =
      parsed.llm_provider === "openrouter" ? "openai" : parsed.llm_provider;
    return {
      ...DEFAULT_LLM_CONFIG,
      provider: provider || DEFAULT_LLM_CONFIG.provider,
      apiKey: parsed.llm_api_key || DEFAULT_LLM_CONFIG.apiKey,
      model: parsed.llm_name || DEFAULT_LLM_CONFIG.model,
      customModel: parsed.llm_name || DEFAULT_LLM_CONFIG.customModel,
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
    "llm_config",
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

export function resolveLlmConfigForRequest(config: LlmConfig): LlmConfig {
  const normalized = normalizeLlmConfig(config);
  const resolvedModel =
    normalized.customModel
      ? normalized.customModel.trim()
      : normalized.model;
  return {
    ...normalized,
    model: resolvedModel,
  };
}
