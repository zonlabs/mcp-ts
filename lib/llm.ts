import { createOpenAI } from '@ai-sdk/openai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';

export type LlmConfig = {
  provider?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

const TITLE_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5',
  gemini: 'gemini-3.5-flash',
  google: 'gemini-3.5-flash',
  deepseek: 'deepseek-chat',
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
    const geminiProvider = createGoogleGenerativeAI({ apiKey: apiKey || '' });
    return geminiProvider(requestedModel);
  }
  return createOpenAI({ apiKey })(requestedModel);
}

export function getTitleModel(config?: LlmConfig) {
  const provider = (config?.provider || 'openai').toLowerCase().trim();
  const apiKey = config?.apiKey?.trim();
  const titleModel = TITLE_MODEL_BY_PROVIDER[provider] || config?.model?.trim() || 'gpt-4.1-mini';

  if (provider === 'deepseek') {
    return createDeepSeek({ apiKey: apiKey || '' })(titleModel);
  }
  if (provider === 'anthropic') {
    return createAnthropic({ apiKey: apiKey || '' })(titleModel);
  }
  if (provider === 'google' || provider === 'gemini') {
    const geminiProvider = createGoogleGenerativeAI({ apiKey: apiKey || '' });
    return geminiProvider(titleModel);
  }

  return createOpenAI({ apiKey })(titleModel);
}
