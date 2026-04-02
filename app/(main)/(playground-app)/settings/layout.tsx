"use client";

import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { User, Plug, KeyRound, Network } from "lucide-react";

interface SettingsNavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: SettingsNavItem[] = [
  { label: "Account", href: "/settings", icon: User },
  { label: "API Keys", href: "/settings/api-keys", icon: KeyRound },
  { label: "Connectors", href: "/settings/connectors", icon: Plug },
  // { label: "A2A Agents", href: "/settings/agents", icon: Network },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row px-3 py-4 md:p-6 md:mt-8 gap-4 md:gap-0 overflow-x-hidden">
      {/* Navigation */}
      <div className="md:w-64 md:pr-6 shrink-0">
        <div className="md:border-r border-border h-full md:pr-6">
          <h2 className="text-lg font-semibold mb-3 md:mb-6">Settings</h2>

          {/* Desktop Nav */}
          <nav className="hidden md:block space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer",
                    isActive
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
