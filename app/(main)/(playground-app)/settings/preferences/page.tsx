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
  describeToolApprovalMode,
  normalizeAgentPreferences,
  readAgentPreferencesFromStorage,
  writeAgentPreferencesToStorage,
} from "@/lib/agent-preferences";

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

const LANGUAGE_OPTIONS = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "hi-IN", label: "Hindi" },
  { value: "es-ES", label: "Spanish" },
  { value: "fr-FR", label: "French" },
  { value: "de-DE", label: "German" },
  { value: "ja-JP", label: "Japanese" },
];

const TOOL_POLICY_OPTIONS: Array<{
  value: ToolApprovalMode;
  label: string;
}> = [
  { value: "always", label: "Ask every time" },
  { value: "risky", label: "Ask for risky tools" },
  { value: "never", label: "Run automatically" },
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

function formatCurrentTimeInTimezone(timezone: string, date: Date): string {
  let dateText = "";
  try {
    dateText = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    dateText = new Intl.DateTimeFormat("en-US", {
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
    <div className="grid gap-3 border-b border-border/70 py-5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_260px] sm:items-center">
      <div className="flex min-w-0 gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <Label className="text-[15px] font-medium">{title}</Label>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default function PreferencesPage() {
  const [preferences, setPreferences] = useState<AgentPreferences>(DEFAULT_AGENT_PREFERENCES);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    setPreferences(readAgentPreferencesFromStorage());
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

  const policyDescription = useMemo(
    () => describeToolApprovalMode(preferences.toolApprovalMode),
    [preferences.toolApprovalMode]
  );

  const timezoneTriggerLabel = useMemo(
    () => formatTimezoneOptionLabel(preferences.timezone, now),
    [preferences.timezone, now]
  );

  const timezoneCurrentTimeLabel = useMemo(
    () => formatCurrentTimeInTimezone(preferences.timezone, now),
    [preferences.timezone, now]
  );

  const updatePreferences = (patch: Partial<AgentPreferences>) => {
    setPreferences((current) => normalizeAgentPreferences({ ...current, ...patch }));
  };

  return (
    <div className="px-1 pb-16 md:px-6">
      <div className="max-w-3xl space-y-7">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h1 className="text-3xl">Preferences</h1>
            <Badge variant="outline" className="gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {savedAt ? "Saved" : "Local"}
            </Badge>
          </div>
          <p className="text-[15px] text-muted-foreground">
            Choose how the agent localizes responses and handles MCP tool execution.
          </p>
        </div>

        <section className="rounded-lg border border-border/70 px-4">
          <PreferenceRow
            icon={Palette}
            title="Theme"
            description="Choose the app color scheme for chat, settings, and connector views."
          >
            <ThemeSelector />
          </PreferenceRow>

          <PreferenceRow
            icon={Globe2}
            title="Timezone"
            description="Used for date-sensitive answers, scheduling language, and timestamps."
          >
            <Select
              value={preferences.timezone}
              onValueChange={(timezone) => updatePreferences({ timezone })}
            >
              <SelectTrigger className="h-9 rounded-md">
                <SelectValue placeholder="Select timezone">
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
              Current time: {timezoneCurrentTimeLabel}
            </p>
          </PreferenceRow>

          <PreferenceRow
            icon={Languages}
            title="Language"
            description="The assistant will prefer this language unless the chat asks for another one."
          >
            <Select
              value={preferences.language}
              onValueChange={(language) => updatePreferences({ language })}
            >
              <SelectTrigger className="h-9 rounded-md">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PreferenceRow>

          <PreferenceRow
            icon={ShieldCheck}
            title="MCP tool approval"
            description={policyDescription}
          >
            <Select
              value={preferences.toolApprovalMode}
              onValueChange={(toolApprovalMode: ToolApprovalMode) =>
                updatePreferences({ toolApprovalMode })
              }
            >
              <SelectTrigger className="h-9 rounded-md">
                <SelectValue placeholder="Select approval policy" />
              </SelectTrigger>
              <SelectContent>
                {TOOL_POLICY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
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
