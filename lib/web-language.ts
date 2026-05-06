export const WEB_LANGUAGE_STORAGE_KEY = "mcp-assistant:web-language:v1";
export const WEB_LANGUAGE_CHANGE_EVENT = "mcp-assistant:web-language:changed";
export const DEFAULT_WEB_LANGUAGE = "en-US";

export const WEB_LANGUAGE_OPTIONS = [
  { value: "en-US", label: "English (US)" },
  { value: "zh-CN", label: "Chinese (Mandarin)" },
  { value: "hi-IN", label: "Hindi" },
  { value: "es-ES", label: "Spanish" },
  { value: "fr-FR", label: "French" },
  { value: "ar-SA", label: "Arabic" },
  { value: "ja-JP", label: "Japanese" },
  { value: "pt-BR", label: "Portuguese" },
  { value: "ru-RU", label: "Russian" },
  { value: "ur-PK", label: "Urdu" },
] as const;

type WebLanguageOption = (typeof WEB_LANGUAGE_OPTIONS)[number]["value"];
const WEB_LANGUAGE_VALUES = new Set<string>(WEB_LANGUAGE_OPTIONS.map((option) => option.value));

function browserLanguage(): string {
  if (typeof navigator === "undefined") return DEFAULT_WEB_LANGUAGE;
  return navigator.language || DEFAULT_WEB_LANGUAGE;
}

export function normalizeWebLanguage(input: string | null | undefined): string {
  const value = (input || "").trim();
  if (!value) return browserLanguage();
  if (WEB_LANGUAGE_VALUES.has(value)) return value;
  return DEFAULT_WEB_LANGUAGE;
}

export function readWebLanguageFromStorage(): string {
  if (typeof window === "undefined") return DEFAULT_WEB_LANGUAGE;
  const stored = localStorage.getItem(WEB_LANGUAGE_STORAGE_KEY);
  return normalizeWebLanguage(stored);
}

export function writeWebLanguageToStorage(language: string) {
  if (typeof window === "undefined") return;
  const normalized = normalizeWebLanguage(language);
  localStorage.setItem(WEB_LANGUAGE_STORAGE_KEY, normalized);
  window.dispatchEvent(
    new CustomEvent(WEB_LANGUAGE_CHANGE_EVENT, { detail: { language: normalized } })
  );
}

export function asWebLanguageOption(language: string): WebLanguageOption {
  const normalized = normalizeWebLanguage(language);
  if (WEB_LANGUAGE_VALUES.has(normalized)) {
    return normalized as WebLanguageOption;
  }
  return DEFAULT_WEB_LANGUAGE;
}
