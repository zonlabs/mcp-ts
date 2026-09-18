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

function resolveOpenRouterApiKey(config?: LlmConfig): string | undefined {
  return config?.apiKey?.trim() || process.env.OPENROUTER_API_KEY || undefined;
}

function resolveBaseUrl(config?: LlmConfig): string {
  const customUrl = config?.baseUrl?.trim();
  if (customUrl) return customUrl;
  return DEFAULT_OPENROUTER_BASE_URL;
}

export function createOpenRouterProvider(config?: LlmConfig) {
  const apiKey = resolveOpenRouterApiKey(config);
  const baseURL = resolveBaseUrl(config);

  return createOpenAI({
    apiKey,
    baseURL,
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
