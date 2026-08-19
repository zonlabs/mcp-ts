"use client";

import * as React from "react";
import { Moon, Sun, Monitor, Check } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();
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

  const options = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ] as const;

  const active = theme ?? "system";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          aria-label="Toggle theme"
          className="h-8 size-8 shrink-0 gap-1.5 rounded-sm px-0 hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
        >
          {active === "light" && <Sun className="size-4" strokeWidth={1.8} />}
          {active === "dark" && <Moon className="size-4" strokeWidth={1.8} />}
          {active === "system" && <Monitor className="size-4" strokeWidth={1.8} />}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-56 p-1.5 bg-popover border-border rounded-sm shadow-md font-sans text-xs"
      >
        {options.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className={cn(
              "cursor-pointer gap-2.5 rounded-xs px-2.5 py-1.5 text-xs text-foreground hover:bg-card",
              active === value && "bg-card font-medium text-foreground"
            )}
          >
            <Icon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
            <span className="flex-1">{label}</span>
            {active === value && <Check className="size-3.5 shrink-0 text-foreground" strokeWidth={2} />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
