import { createOpenAI } from '@ai-sdk/openai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { google } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';

export type LlmConfig = {
  provider?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

export function getModelFromConfig(config?: LlmConfig) {
  const provider = (config?.provider || 'openai').toLowerCase().trim();
  const apiKey = config?.apiKey?.trim();
  const requestedModel = config?.model?.trim() || 'gpt-4.1-mini';

  if (provider === 'deepseek') {
    return createDeepSeek({ apiKey: apiKey || '' })(requestedModel);
  }
  if (provider === 'anthropic') {
    const anthropic = createAnthropic({ apiKey: apiKey || '' });
    return anthropic(requestedModel);
  }
  if (provider === 'google' || provider === 'gemini') {
    return google(requestedModel);
  }
  return createOpenAI({ apiKey })(requestedModel);
}
