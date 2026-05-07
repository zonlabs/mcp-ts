"use client";

import { KeyRound, Plug, SlidersHorizontal, User } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/web-i18n";

interface SettingsNavItem {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}

export function SettingsSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();

  const navItems: SettingsNavItem[] = [
    { label: t("account"), href: "/settings", icon: User },
    { label: t("preferences"), href: "/settings/preferences", icon: SlidersHorizontal },
    { label: t("apiKeys"), href: "/settings/api-keys", icon: KeyRound },
    { label: t("connectors"), href: "/settings/connectors", icon: Plug },
  ];

  return (
    <aside className="hidden w-64 shrink-0 border-r border-border md:flex md:flex-col">
      <div className="flex h-full min-h-0 flex-col px-6 py-10">
        <h2 className="mb-6 text-lg font-semibold">{t("settings")}</h2>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
