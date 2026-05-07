"use client";

import React from "react";
import { useI18n } from "@/lib/web-i18n";

export const TimeDisplay = React.memo(() => {
  const [currentDateTime, setCurrentDateTime] = React.useState(new Date());
  const { t, language } = useI18n();

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  const formattedDateFull = currentDateTime.toLocaleDateString(language, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const formattedDateShort = currentDateTime.toLocaleDateString(language, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const formattedTime = currentDateTime.toLocaleTimeString(language, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="flex items-center justify-center bg-background/50 px-3 py-2 backdrop-blur-sm sm:px-6 sm:py-3">
      <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-muted-foreground sm:gap-2 sm:text-sm md:gap-4">
        <div className="flex items-center gap-1.5 md:hidden">
          <span className="font-medium">{formattedDateShort}</span>
          <span>•</span>
          <span className="font-mono">{formattedTime}</span>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <span className="font-medium">{formattedDateFull}</span>
          <span>•</span>
          <span className="font-mono">{formattedTime}</span>
        </div>

        <span className="hidden sm:inline">•</span>
        <div className="hidden items-center gap-2 sm:flex">
          <span>{t("language")}:</span>
          <span className="font-medium">{language}</span>
        </div>
      </div>
    </div>
  );
});

TimeDisplay.displayName = "TimeDisplay";
