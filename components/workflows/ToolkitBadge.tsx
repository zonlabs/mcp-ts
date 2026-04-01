"use client";

import {
  Github,
  Mail,
  MessageSquare,
  Globe,
  Sparkles,
  Wrench,
  Webhook,
  Database,
  FileText,
  Calendar,
  Box,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TOOLKIT_MAP: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  github: { icon: Github, color: "text-gray-900 dark:text-gray-100", bg: "bg-gray-100 dark:bg-gray-800" },
  email: { icon: Mail, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/30" },
  slack: { icon: MessageSquare, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/30" },
  webhook: { icon: Webhook, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-900/30" },
  http: { icon: Globe, color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/30" },
  ai: { icon: Sparkles, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-900/30" },
  database: { icon: Database, color: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-50 dark:bg-cyan-900/30" },
  file: { icon: FileText, color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-900/30" },
  calendar: { icon: Calendar, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/30" },
  custom: { icon: Wrench, color: "text-muted-foreground", bg: "bg-muted" },
};

interface ToolkitBadgeProps {
  toolkit: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export function ToolkitBadge({
  toolkit,
  size = "md",
  showLabel = false,
  className,
}: ToolkitBadgeProps) {
  const key = toolkit.toLowerCase();
  const config = TOOLKIT_MAP[key] ?? {
    icon: Box,
    color: "text-muted-foreground",
    bg: "bg-muted",
  };
  const Icon = config.icon;

  const sizeClasses = {
    sm: "w-6 h-6 p-1",
    md: "w-7 h-7 p-1.5",
    lg: "w-9 h-9 p-2",
  };
  const iconSizes = { sm: "w-3 h-3", md: "w-3.5 h-3.5", lg: "w-4.5 h-4.5" };

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "rounded-lg flex items-center justify-center flex-shrink-0",
          sizeClasses[size],
          config.bg
        )}
        title={toolkit}
      >
        <Icon className={cn(iconSizes[size], config.color)} />
      </span>
      {showLabel && (
        <span className="text-xs text-muted-foreground capitalize">{toolkit}</span>
      )}
    </span>
  );
}

interface ToolkitGroupProps {
  toolkits: string[];
  max?: number;
  size?: "sm" | "md";
}

export function ToolkitGroup({ toolkits, max = 3, size = "sm" }: ToolkitGroupProps) {
  const visible = toolkits.slice(0, max);
  const overflow = toolkits.length - max;

  return (
    <div className="flex items-center gap-1">
      {visible.map((tk) => (
        <ToolkitBadge key={tk} toolkit={tk} size={size} />
      ))}
      {overflow > 0 && (
        <span className="text-xs text-muted-foreground font-medium">+{overflow}</span>
      )}
    </div>
  );
}
