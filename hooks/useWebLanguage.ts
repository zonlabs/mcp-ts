"use client";

import { useEffect, useState } from "react";
import { readWebLanguageFromStorage, WEB_LANGUAGE_CHANGE_EVENT } from "@/lib/web-language";

export function useWebLanguage() {
  const [language, setLanguage] = useState("en-US");

  useEffect(() => {
    const syncLanguage = () => {
      setLanguage(readWebLanguageFromStorage());
    };

    syncLanguage();
    window.addEventListener(WEB_LANGUAGE_CHANGE_EVENT, syncLanguage as EventListener);
    window.addEventListener("storage", syncLanguage);

    return () => {
      window.removeEventListener(WEB_LANGUAGE_CHANGE_EVENT, syncLanguage as EventListener);
      window.removeEventListener("storage", syncLanguage);
    };
  }, []);

  return language;
}
