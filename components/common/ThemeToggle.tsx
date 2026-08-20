"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { SimpleTooltip } from "@/components/ui/tooltip";

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="h-8 size-8 shrink-0 gap-1.5 rounded-sm px-0 hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="sr-only">Toggle theme</span>
      </Button>
    );
  }

  const isDark = resolvedTheme === "dark";
  const tooltipText = `Switch to ${isDark ? "light" : "dark"} mode`;

  return (
    <SimpleTooltip content={tooltipText} side="bottom">
      <Button
        type="button"
        variant="ghost"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label={tooltipText}
        className="h-8 size-8 shrink-0 gap-1.5 rounded-sm px-0 hover:bg-card text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        {isDark ? (
          <Sun className="size-4 text-white" strokeWidth={1.8} />
        ) : (
          <Moon className="size-4 text-muted-foreground hover:text-foreground" strokeWidth={1.8} />
        )}
        <span className="sr-only">Toggle theme</span>
      </Button>
    </SimpleTooltip>
  );
}
