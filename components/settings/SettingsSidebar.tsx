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
    { label: t("account"), href: "/settings/account", icon: User },
    { label: t("preferences"), href: "/settings/preferences", icon: SlidersHorizontal },
    { label: t("apiKeys"), href: "/settings/api-keys", icon: KeyRound },
    { label: t("connectors"), href: "/settings/connectors", icon: Plug },
  ];

  return (
    <aside className="hidden w-56 shrink-0 border-r border-border md:flex md:flex-col bg-background select-none">
      <div className="flex h-full min-h-0 flex-col px-3 py-6">
        <h2 className="mb-3 px-2 text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground/70">
          {t("settings")}
        </h2>
        <nav className="space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[13px] font-medium transition-colors text-left",
                  isActive
                    ? "bg-card font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
                )}
              >
                <Icon className="size-[18px] shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
