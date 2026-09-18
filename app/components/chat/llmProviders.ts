export type LlmProviderId = "openrouter";

export interface LlmProviderOption {
  id: LlmProviderId;
  name: string;
  iconUrl?: string;
  description?: string;
}

export const LLM_PROVIDERS: LlmProviderOption[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    iconUrl: "/providers/openrouter.svg",
    description: "Universal gateway to 300+ models (Anthropic, OpenAI, DeepSeek, Google, Meta)",
  },
];

const PROVIDER_ICON_ALIASES: Record<string, string> = {
  openrouter: "/providers/openrouter.svg",
  openai: "/providers/openai.svg",
  anthropic: "/providers/anthropic.svg",
  gemini: "/providers/gemini.svg",
  google: "/providers/gemini.svg",
  deepseek: "/providers/deepseek.svg",
  meta: "/providers/meta.svg",
  "meta-llama": "/providers/meta.svg",
  microsoft: "/providers/microsoft.svg",
  qwen: "/providers/qwen.svg",
  mistral: "/providers/mistral.svg",
  mistralai: "/providers/mistral.svg",
  kimi: "/providers/kimi.svg",
  moonshot: "/providers/kimi.svg",
  moonshotai: "/providers/kimi.svg",
  "moonshot ai": "/providers/kimi.svg",
  "z-ai": "/providers/z-ai.svg",
  zai: "/providers/z-ai.svg",
  zhipu: "/providers/z-ai.svg",
  "zhipu ai": "/providers/z-ai.svg",
  "x-ai": "/providers/x-ai.svg",
  xai: "/providers/x-ai.svg",
  cohere: "/providers/cohere.svg",
  perplexity: "/providers/perplexity.svg",
  community: "/providers/openrouter.svg",
};

export function getProviderIconUrl(provider?: string): string | undefined {
  if (!provider) return undefined;
  const key = provider.toLowerCase().trim();
  return PROVIDER_ICON_ALIASES[key] || PROVIDER_ICON_ALIASES.openrouter;
}

export function isProviderDarkInvert(provider?: string): boolean {
  if (!provider) return false;
  const key = provider.toLowerCase().trim();
  return key === "openai" || key === "x-ai" || key === "xai";
}
