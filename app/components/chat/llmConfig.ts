export interface LlmConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  modelName?: string;
  contextLength?: number;
  maxTokens?: number;
}

const LLM_CONFIG_STORAGE_KEY = "llm_config";

export const DEFAULT_LLM_CONFIG: LlmConfig = {
  provider: "openrouter",
  model: "openrouter/auto",
  modelName: "Auto Router",
  apiKey: "",
  maxTokens: 2048,
};

export function readLlmConfigFromStorage(): LlmConfig {
  if (typeof window === "undefined") return { ...DEFAULT_LLM_CONFIG };

  const stored = localStorage.getItem(LLM_CONFIG_STORAGE_KEY);
  if (!stored) return { ...DEFAULT_LLM_CONFIG };

  try {
    const parsed = JSON.parse(stored);
    const model = parsed.llm_name || DEFAULT_LLM_CONFIG.model;
    const defaultName = model === "openrouter/auto" ? "Auto Router" : "";
    const parsedMaxTokens = typeof parsed.llm_max_tokens === "number"
      ? parsed.llm_max_tokens
      : (parsed.llm_max_tokens ? parseInt(parsed.llm_max_tokens, 10) : undefined);

    return {
      provider: "openrouter",
      apiKey: parsed.llm_api_key || "",
      model,
      modelName: parsed.llm_model_name || defaultName,
      contextLength: typeof parsed.llm_context_length === "number" ? parsed.llm_context_length : undefined,
      maxTokens: parsedMaxTokens && !isNaN(parsedMaxTokens) ? parsedMaxTokens : DEFAULT_LLM_CONFIG.maxTokens,
    };
  } catch {
    return { ...DEFAULT_LLM_CONFIG };
  }
}

export function writeLlmConfigToStorage(config: LlmConfig) {
  if (typeof window === "undefined") return;
  const model = (config.model || DEFAULT_LLM_CONFIG.model).trim();
  const defaultName = model === "openrouter/auto" ? "Auto Router" : "";
  localStorage.setItem(
    LLM_CONFIG_STORAGE_KEY,
    JSON.stringify({
      llm_provider: "openrouter",
      llm_api_key: config.apiKey?.trim() || "",
      llm_name: model,
      llm_model_name: (config.modelName || defaultName).trim(),
      llm_context_length: config.contextLength,
      llm_max_tokens: typeof config.maxTokens === "number" ? config.maxTokens : DEFAULT_LLM_CONFIG.maxTokens,
    }),
  );
}

export function normalizeLlmConfig(config: LlmConfig): LlmConfig {
  const model = (config.model || DEFAULT_LLM_CONFIG.model).trim();
  const defaultName = model === "openrouter/auto" ? "Auto Router" : "";
  const parsedMaxTokens = typeof config.maxTokens === "number" ? config.maxTokens : undefined;
  return {
    provider: "openrouter",
    model,
    modelName: (config.modelName || defaultName).trim(),
    contextLength: config.contextLength,
    apiKey: config.apiKey?.trim() || "",
    maxTokens: parsedMaxTokens && !isNaN(parsedMaxTokens) ? parsedMaxTokens : DEFAULT_LLM_CONFIG.maxTokens,
  };
}
