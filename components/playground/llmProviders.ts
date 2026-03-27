export type LlmProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "deepseek"
  | "custom";

export interface LlmProviderOption {
  id: LlmProviderId;
  name: string;
  iconUrl?: string;
  description?: string;
}

export const LLM_PROVIDERS: LlmProviderOption[] = [
  {
    id: "openai",
    name: "OpenAI",
    iconUrl: "https://api.iconify.design/logos:openai-icon.svg",
    description: "Official OpenAI API",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    iconUrl: "https://api.iconify.design/logos:anthropic-icon.svg",
    description: "Claude models (OpenAI-compatible only if proxied)",
  },
  {
    id: "google",
    name: "Google",
    iconUrl: "https://api.iconify.design/logos:google-icon.svg",
    description: "Gemini models (OpenAI-compatible only if proxied)",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    iconUrl: "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/deepseek.svg",
    description: "DeepSeek models (OpenAI-compatible endpoint)",
  },
  // {
  //   id: "custom",
  //   name: "Other (OpenAI-compatible)",
  //   iconUrl: "https://api.iconify.design/mdi:link-variant.svg",
  //   description: "Any OpenAI-compatible endpoint",
  // },
];

const PROVIDER_ICON_ALIASES: Record<string, string> = {
  openai: "https://api.iconify.design/logos:openai-icon.svg",
  anthropic: "https://api.iconify.design/logos:anthropic-icon.svg",
  google: "https://api.iconify.design/logos:google-icon.svg",
  deepseek: "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/deepseek.svg",
  meta: "https://api.iconify.design/logos:meta-icon.svg",
  microsoft: "https://api.iconify.design/logos:microsoft-icon.svg",
  qwen: "https://api.iconify.design/simple-icons:alibabacloud.svg",
  community: "https://api.iconify.design/mdi:account-group.svg",
};

export function getProviderIconUrl(provider?: string): string | undefined {
  if (!provider) return undefined;
  const key = provider.toLowerCase().trim();
  return PROVIDER_ICON_ALIASES[key];
}
