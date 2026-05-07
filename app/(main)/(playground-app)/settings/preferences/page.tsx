"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Globe2, Languages, Palette, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
    <div className="grid gap-6 border-b border-border/70 py-6 last:border-b-0 lg:grid-cols-[1fr_260px] lg:items-center lg:min-h-[110px]">
      <div className="flex min-w-0 gap-4">
        <span className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/50 text-muted-foreground shadow-sm">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex flex-col justify-center">
          <Label className="text-[16px] font-semibold tracking-tight">{title}</Label>
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground/80 lg:max-w-[440px]">{description}</p>
        </div>
      </div>
      <div className="min-w-0 flex flex-col justify-center lg:items-end">{children}</div>
    </div>
  );
}

export default function PreferencesPage() {
  const { t } = useI18n();
  const [preferences, setPreferences] = useState<AgentPreferences>(DEFAULT_AGENT_PREFERENCES);
  const [webLanguage, setWebLanguage] = useState("en-US");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    setPreferences(readAgentPreferencesFromStorage());
    setWebLanguage(readWebLanguageFromStorage());
    setHasLoaded(true);
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;
    writeAgentPreferencesToStorage(preferences);
    setSavedAt(new Date());
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
    <div className="px-1 pb-16 md:px-6">
      <div className="max-w-3xl space-y-7">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h1 className="text-3xl">{t("preferences")}</h1>
            <Badge variant="outline" className="gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {savedAt ? t("saved") : t("local")}
            </Badge>
          </div>
          <p className="text-[15px] text-muted-foreground">
            {t("chooseAgentBehavior")}
          </p>
        </div>

        <section className="px-4">
          <PreferenceRow
            icon={Palette}
            title={t("theme")}
            description={t("themeDescription")}
          >
            <ThemeSelector />
          </PreferenceRow>

          <PreferenceRow
            icon={Globe2}
            title={t("timezone")}
            description={t("timezoneDescription")}
          >
            <Select
              value={preferences.timezone}
              onValueChange={(timezone) => updatePreferences({ timezone })}
            >
              <SelectTrigger className="h-9 rounded-md">
                <SelectValue placeholder={t("selectTimezone")}>
                  {timezoneTriggerLabel}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TIMEZONE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex flex-col">
                      <span>{option.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatTimezoneOptionLabel(option.value, now)}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("currentTime")}: {timezoneCurrentTimeLabel}
            </p>
          </PreferenceRow>

          <PreferenceRow
            icon={Languages}
            title={t("language")}
            description={t("languageWebOnly")}
          >
              <Select
              value={webLanguage}
              onValueChange={(language) => {
                const selectedLanguage = asWebLanguageOption(language);
                setWebLanguage(selectedLanguage);
                writeWebLanguageToStorage(selectedLanguage);
              }}
            >
              <SelectTrigger className="h-9 rounded-md">
                <SelectValue placeholder={t("selectLanguage")} />
              </SelectTrigger>
              <SelectContent>
                {WEB_LANGUAGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PreferenceRow>

          <PreferenceRow
            icon={ShieldCheck}
            title={t("mcpToolApproval")}
            description={policyDescription}
          >
            <Select
              value={preferences.toolApprovalMode}
              onValueChange={(toolApprovalMode: ToolApprovalMode) =>
                updatePreferences({ toolApprovalMode })
              }
            >
              <SelectTrigger className="h-9 rounded-md">
                <SelectValue placeholder={t("selectApprovalPolicy")} />
              </SelectTrigger>
              <SelectContent>
                {TOOL_POLICY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PreferenceRow>
        </section>
      </div>
    </div>
  );
}
