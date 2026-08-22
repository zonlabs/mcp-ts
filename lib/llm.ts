import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

export type LlmConfig = {
  provider?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

type ProviderFactory = (options: { apiKey?: string; baseURL?: string }) => (modelId: string) => LanguageModel;

interface ProviderDefinition {
  factory: ProviderFactory;
  envKeys: string[];
  defaultModel: string;
  titleModel: string;
}

const PROVIDERS: Record<string, ProviderDefinition> = {
  deepseek: {
    factory: (opts) => createDeepSeek(opts),
    envKeys: ['DEEPSEEK_API_KEY'],
    defaultModel: 'deepseek-v4-flash',
    titleModel: 'deepseek-v4-flash',
  },
  openai: {
    factory: (opts) => createOpenAI(opts),
    envKeys: ['OPENAI_API_KEY'],
    defaultModel: 'gpt-4.1-mini',
    titleModel: 'gpt-4o-mini',
  },
  anthropic: {
    factory: (opts) => createAnthropic(opts),
    envKeys: ['ANTHROPIC_API_KEY'],
    defaultModel: 'claude-3-5-haiku-latest',
    titleModel: 'claude-3-5-haiku-latest',
  },
  gemini: {
    factory: (opts) => createGoogleGenerativeAI(opts),
    envKeys: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY'],
    defaultModel: 'gemini-2.5-flash',
    titleModel: 'gemini-2.5-flash',
  },
  google: {
    factory: (opts) => createGoogleGenerativeAI(opts),
    envKeys: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY'],
    defaultModel: 'gemini-2.5-flash',
    titleModel: 'gemini-2.5-flash',
  },
};

function getActiveProvider(config?: LlmConfig): { def: ProviderDefinition; apiKey?: string } {
  const name = config?.provider?.toLowerCase().trim();

  // 1. Explicit provider with either runtime apiKey or environment key
  if (name && PROVIDERS[name]) {
    const def = PROVIDERS[name];
    const apiKey = config?.apiKey?.trim() || def.envKeys.map((k) => process.env[k]).find(Boolean);
    return { def, apiKey };
  }

  // 2. Runtime apiKey provided without matching provider name
  if (config?.apiKey?.trim()) {
    const def = PROVIDERS[name || 'deepseek'] || PROVIDERS.deepseek;
    return { def, apiKey: config.apiKey.trim() };
  }

  // 3. Resolve automatically on the basis of available environment API keys
  for (const def of Object.values(PROVIDERS)) {
    const envKey = def.envKeys.map((k) => process.env[k]).find(Boolean);
    if (envKey) {
      return { def, apiKey: envKey };
    }
  }

  // 4. Default fallback
  return { def: PROVIDERS.deepseek, apiKey: undefined };
}

export function getModelFromConfig(config?: LlmConfig): LanguageModel {
  const { def, apiKey } = getActiveProvider(config);
  const modelId = config?.model?.trim() || def.defaultModel;
  const providerInstance = def.factory({ apiKey, baseURL: config?.baseUrl?.trim() || undefined });
  return providerInstance(modelId);
}

export function getTitleModel(config?: LlmConfig): LanguageModel {
  const { def, apiKey } = getActiveProvider(config);
  const providerInstance = def.factory({ apiKey, baseURL: config?.baseUrl?.trim() || undefined });
  return providerInstance(def.titleModel);
}
