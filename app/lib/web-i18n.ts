import { useCallback, useMemo } from "react";
import { useWebLanguage } from "@/hooks/useWebLanguage";
import {
  formatWebMessage,
  translateWebMessage,
  type WebMessageKey,
} from "@/lib/web-i18n-dictionaries";

export type { WebMessageKey };

export function useI18n() {
  const language = useWebLanguage();
  const t = useCallback(
    (key: WebMessageKey): string => translateWebMessage(language, key),
    [language]
  );
  const format = useCallback(
    (key: WebMessageKey, values: Record<string, string | number>): string =>
      formatWebMessage(language, key, values),
    [language]
  );

  return useMemo(() => ({ t, format, language }), [t, format, language]);
}
