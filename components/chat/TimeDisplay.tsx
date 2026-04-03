"use client";

import React from "react";

export const TimeDisplay = React.memo(() => {
  const [currentDateTime, setCurrentDateTime] = React.useState(new Date());
  const [language, setLanguage] = React.useState<string>("en-US");

  React.useEffect(() => {
    // Update time every second
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);

    // Get browser language
    if (typeof navigator !== 'undefined') {
      setLanguage(navigator.language || "en-US");
    }

    return () => clearInterval(timer);
  }, []);

  // Format date and time for different screen sizes
  const formattedDateFull = currentDateTime.toLocaleDateString(language, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const formattedDateShort = currentDateTime.toLocaleDateString(language, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  const formattedTime = currentDateTime.toLocaleTimeString(language, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  return (
    <div className="flex items-center justify-center px-3 sm:px-6 py-2 sm:py-3 bg-background/50 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 md:gap-4 text-xs sm:text-sm text-muted-foreground">
        {/* Mobile: Show short date and time */}
        <div className="flex items-center gap-1.5 md:hidden">
          <span className="font-medium">{formattedDateShort}</span>
          <span>•</span>
          <span className="font-mono">{formattedTime}</span>
        </div>

        {/* Desktop: Show full date and time */}
        <div className="hidden md:flex items-center gap-2">
          <span className="font-medium">{formattedDateFull}</span>
          <span>•</span>
          <span className="font-mono">{formattedTime}</span>
        </div>

        {/* Language - hidden on very small screens */}
        <span className="hidden sm:inline">•</span>
        <div className="hidden sm:flex items-center gap-2">
          <span>Language:</span>
          <span className="font-medium">{language}</span>
        </div>
      </div>
    </div>
  );
});

TimeDisplay.displayName = "TimeDisplay";
