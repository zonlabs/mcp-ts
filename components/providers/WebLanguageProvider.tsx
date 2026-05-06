"use client";

import { useEffect } from "react";
import { readWebLanguageFromStorage, WEB_LANGUAGE_CHANGE_EVENT } from "@/lib/web-language";

export function WebLanguageProvider() {
  useEffect(() => {
    const applyLanguage = () => {
      const language = readWebLanguageFromStorage();
      document.documentElement.lang = language;
    };

    applyLanguage();
    window.addEventListener(WEB_LANGUAGE_CHANGE_EVENT, applyLanguage as EventListener);
    window.addEventListener("storage", applyLanguage);

    return () => {
      window.removeEventListener(WEB_LANGUAGE_CHANGE_EVENT, applyLanguage as EventListener);
      window.removeEventListener("storage", applyLanguage);
    };
  }, []);

  return null;
}
