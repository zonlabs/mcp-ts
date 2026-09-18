import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

export type LlmConfig = {
  provider?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const AUTO_MODEL = 'openrouter/auto';

export function createOpenRouterProvider(config?: LlmConfig) {
  return createOpenAI({
    apiKey: config?.apiKey?.trim(),
    baseURL: config?.baseUrl?.trim() || DEFAULT_OPENROUTER_BASE_URL,
    headers: {
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://app.linkos.in',
      'X-Title': 'LinkOS',
    },
  });
}

export function getModelConfig(config?: LlmConfig): LanguageModel {
  const provider = createOpenRouterProvider(config);
  const modelId = config?.model?.trim() || AUTO_MODEL;
  // Use .chat() to route to /chat/completions instead of /responses (which OpenRouter does not support for tools)
  return provider.chat(modelId);
}

export function getTitleModel(config?: LlmConfig): LanguageModel {
  const provider = createOpenRouterProvider(config);
  // Use the active model or openrouter/auto (no hardcoded models)
  const modelId = config?.model?.trim() || AUTO_MODEL;
  return provider.chat(modelId);
}
