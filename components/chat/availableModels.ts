export const AVAILABLE_MODELS = [
  // --- OpenAI (2024 - 2026) ---
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    description: "2026 flagship; current SOTA for professional agentic and multimodal workflows",
    provider: "OpenAI",
    tag: "Premium"
  },
  {
    id: "gpt-5",
    name: "GPT-5",
    description: "Aug 2025 flagship; first native multimodal GPT with reasoning-router",
    provider: "OpenAI",
    tag: "Premium"
  },
  {
    id: "gpt-4.5",
    name: "GPT-4.5",
    description: "Feb 2025 release; renowned for creative writing and high emotional intelligence",
    provider: "OpenAI",
    tag: "Creative"
  },
  {
    id: "gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    description: "April 2025 release; significant leap in small model logic and 1M context support",
    provider: "OpenAI",
    tag: "Balanced"
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    description: "July 2024 release; the original cost-efficient 'omni' model for fast tasks",
    provider: "OpenAI",
    tag: "Fast"
  },

  // --- Anthropic Claude 4.5 Series (Late 2025) ---
  {
    id: "claude-opus-4-5",
    name: "Claude 4.5 Opus",
    description: "Nov 2025 release; top-tier reasoning and coding with 1M token window",
    provider: "Anthropic",
    tag: "Premium"
  },
  {
    id: "claude-sonnet-4-5",
    name: "Claude 4.5 Sonnet",
    description: "Sep 2025 release; first major 'Agentic' model designed for autonomous computer use",
    provider: "Anthropic",
    tag: "Balanced"
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude 4.5 Haiku",
    description: "Oct 2025 release; low-latency model featuring native internal thinking",
    provider: "Anthropic",
    tag: "Fast"
  },

  // --- Gemini (2025 - 2026) ---
  {
    id: "gemini-3.1-pro",
    name: "Gemini 3.1 Pro",
    description: "2026 flagship; leads in ARC-AGI-2 logic and specialized 'vibe coding'",
    provider: "Gemini",
    tag: "Premium"
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    description: "Mid-2025 'Thinking' model; introduced native multimodal audio output",
    provider: "Gemini",
    tag: "Premium"
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    description: "Jan 2025 release; first to offer real-time multimodal interaction at scale",
    provider: "Gemini",
    tag: "Fast"
  },

  // --- DeepSeek (2025 - 2026) ---
  {
    id: "deepseek-chat",
    name: "DeepSeek-V3.2",
    description: "Dec 2025 upgrade; general-purpose model optimized for agentic tool-use",
    provider: "DeepSeek",
    tag: "Balanced"
  },
  {
    id: "deepseek-reasoner",
    name: "DeepSeek Reasoner",
    description: "Thinking-mode model based on R1 architecture; full chain-of-thought visibility",
    provider: "DeepSeek",
    tag: "Reasoning"
  }
];
