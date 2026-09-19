import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { wrapLanguageModel, extractReasoningMiddleware, type LanguageModel } from 'ai';

export type LlmConfig = {
  provider?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const AUTO_MODEL = 'openrouter/auto';

export function createOpenRouterProvider(config?: LlmConfig) {
  return createOpenRouter({
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
  return wrapLanguageModel({
    model: provider.chat(modelId),
    middleware: extractReasoningMiddleware({ tagName: 'think' }),
  });
}

export function getTitleModel(config?: LlmConfig): LanguageModel {
  const provider = createOpenRouterProvider(config);
  const modelId = config?.model?.trim() || AUTO_MODEL;
  return provider.chat(modelId);
}
