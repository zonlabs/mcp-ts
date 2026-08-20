"use client";

import { useEffect, useMemo, useState } from "react";
import { Globe2, Languages, Palette, ShieldCheck } from "lucide-react";
import { Label } from "@/components/ui/label";
import { ThemeSelector } from "@/components/chat/ThemeSelector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AgentPreferences,
  DEFAULT_AGENT_PREFERENCES,
  ToolApprovalMode,
  normalizeAgentPreferences,
  readAgentPreferencesFromStorage,
  writeAgentPreferencesToStorage,
} from "@/lib/agent-preferences";
import {
  WEB_LANGUAGE_OPTIONS,
  asWebLanguageOption,
  readWebLanguageFromStorage,
  writeWebLanguageToStorage,
} from "@/lib/web-language";
import { useI18n } from "@/lib/web-i18n";

const TIMEZONE_OPTIONS = [
  { value: "Asia/Kolkata", label: "India Standard Time" },
  { value: "America/Los_Angeles", label: "Pacific Time" },
  { value: "America/Denver", label: "Mountain Time" },
  { value: "America/Chicago", label: "Central Time" },
  { value: "America/New_York", label: "Eastern Time" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Berlin", label: "Central Europe" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Tokyo", label: "Japan" },
  { value: "Australia/Sydney", label: "Sydney" },
];

const TOOL_POLICY_OPTIONS: Array<{
  value: ToolApprovalMode;
  labelKey: "askEveryTime" | "askRiskyTools" | "runAutomatically";
}> = [
  { value: "always", labelKey: "askEveryTime" },
  { value: "risky", labelKey: "askRiskyTools" },
  { value: "never", labelKey: "runAutomatically" },
];

function getGmtOffsetLabel(timezone: string, date: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "shortOffset",
    }).formatToParts(date);
    const tzName = parts.find((part) => part.type === "timeZoneName")?.value || "GMT";
    return tzName.replace("UTC", "GMT");
  } catch {
    return "GMT";
  }
}

function formatTimezoneOptionLabel(timezone: string, date: Date): string {
  return `${timezone} (${getGmtOffsetLabel(timezone, date)})`;
}

function formatCurrentTimeInTimezone(timezone: string, date: Date, locale: string): string {
  let dateText = "";
  try {
    dateText = new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    dateText = new Intl.DateTimeFormat(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }
  return `${dateText} (${getGmtOffsetLabel(timezone, date)})`;
}

function PreferenceRow({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Globe2;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 pt-4 border-t border-border first:pt-0 first:border-t-0">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Icon className="size-3.5 text-foreground" />
          <h3 className="text-xs font-semibold text-foreground">{title}</h3>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{description}</p>
      </div>

      <div className="md:col-span-2 bg-card border border-border rounded-md p-4 flex items-center justify-between gap-4 shadow-xs">
        {children}
      </div>
    </div>
  );
}

export default function PreferencesPage() {
  const { t } = useI18n();
  const [preferences, setPreferences] = useState<AgentPreferences>(DEFAULT_AGENT_PREFERENCES);
  const [webLanguage, setWebLanguage] = useState("en-US");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    setPreferences(readAgentPreferencesFromStorage());
    setWebLanguage(readWebLanguageFromStorage());
    setHasLoaded(true);
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;
    writeAgentPreferencesToStorage(preferences);
  }, [preferences, hasLoaded]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 1000 * 30);
    return () => window.clearInterval(interval);
  }, []);

  const policyDescription = useMemo(() => {
    if (preferences.toolApprovalMode === "never") {
      return t("runAutomatically");
    }
    if (preferences.toolApprovalMode === "risky") {
      return t("askRiskyTools");
    }
    return t("askEveryTime");
  }, [preferences.toolApprovalMode, t]);

  const timezoneTriggerLabel = useMemo(
    () => formatTimezoneOptionLabel(preferences.timezone, now),
    [preferences.timezone, now]
  );

  const timezoneCurrentTimeLabel = useMemo(
    () => formatCurrentTimeInTimezone(preferences.timezone, now, webLanguage),
    [preferences.timezone, now, webLanguage]
  );

  const updatePreferences = (patch: Partial<AgentPreferences>) => {
    setPreferences((current) => normalizeAgentPreferences({ ...current, ...patch }));
  };

  return (
    <div className="flex-1 h-full overflow-y-auto scrollbar-minimal w-full">
      <div className="w-full max-w-3xl px-6 py-8 pb-20 space-y-6 animate-in fade-in duration-200">
        {/* Header */}
        <div className="pb-4 border-b border-border space-y-1">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">{t("preferences")}</h1>
          <p className="text-xs text-muted-foreground">
            {t("chooseAgentBehavior")}
          </p>
        </div>

        <div className="space-y-6">
          <PreferenceRow
            icon={Palette}
            title={t("theme")}
            description={t("themeDescription")}
          >
            <span className="text-xs text-muted-foreground">Theme Mode</span>
            <ThemeSelector />
          </PreferenceRow>

          <PreferenceRow
            icon={Globe2}
            title={t("timezone")}
            description={t("timezoneDescription")}
          >
            <div className="space-y-1 min-w-0 flex-1">
              <Select
                value={preferences.timezone}
                onValueChange={(val) => updatePreferences({ timezone: val })}
              >
                <SelectTrigger className="h-8 text-xs bg-background border-border">
                  <SelectValue>{timezoneTriggerLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value} className="text-xs">
                      {formatTimezoneOptionLabel(item.value, now)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground font-mono truncate">{timezoneCurrentTimeLabel}</p>
            </div>
          </PreferenceRow>

          <PreferenceRow
            icon={Languages}
            title={t("language")}
            description={t("languageWebOnly")}
          >
            <div className="min-w-0 flex-1">
              <Select
                value={webLanguage}
                onValueChange={(val) => {
                  const opt = asWebLanguageOption(val);
                  setWebLanguage(opt);
                  writeWebLanguageToStorage(opt);
                }}
              >
                <SelectTrigger className="h-8 text-xs bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEB_LANGUAGE_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value} className="text-xs">
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </PreferenceRow>

          <PreferenceRow
            icon={ShieldCheck}
            title={t("mcpToolApproval")}
            description="Choose when the agent requires approval before executing MCP tools."
          >
            <div className="space-y-1 min-w-0 flex-1">
              <Select
                value={preferences.toolApprovalMode}
                onValueChange={(val) => updatePreferences({ toolApprovalMode: val as ToolApprovalMode })}
              >
                <SelectTrigger className="h-8 text-xs bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TOOL_POLICY_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value} className="text-xs">
                      {t(item.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground font-mono">{policyDescription}</p>
            </div>
          </PreferenceRow>
        </div>
      </div>
    </div>
  );
}
