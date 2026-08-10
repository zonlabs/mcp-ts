import { supabase } from "../db/supabase";

export type McpToolCallStatus = "success" | "error";
export type McpToolCallEventType = "top_level" | "downstream_tool" | "schema_inspection";

export type McpToolCallEventInput = {
  userId: string;
  requestId: string;
  mcpSessionId?: string;
  serverId?: string;
  serverName?: string;
  serverUrl?: string;
  serverIcons?: { src: string; mimeType?: string; sizes?: string[]; theme?: string }[];
  toolName: string;
  toolNamespace?: string;
  eventType?: McpToolCallEventType;
  status: McpToolCallStatus;
  error?: unknown;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
};

const APP_KEY_ALIASES: Array<[RegExp, string]> = [
  [/github/i, "github"],
  [/gmail|google\s*mail/i, "gmail"],
  [/google\s*drive|gdrive/i, "google_drive"],
  [/slack/i, "slack"],
  [/notion/i, "notion"],
  [/linear/i, "linear"],
  [/jira|atlassian/i, "jira"],
  [/asana/i, "asana"],
];

const MAX_ERROR_PREVIEW_LENGTH = 240;

function clean(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function normalizeMcpAppKey(serverName?: string, serverId?: string): string | null {
  const source = [serverName, serverId].filter(Boolean).join(" ");
  if (!source.trim()) return null;

  for (const [pattern, appKey] of APP_KEY_ALIASES) {
    if (pattern.test(source)) return appKey;
  }

  const fallback = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

  return fallback || null;
}

function getErrorCode(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof Error) {
    const withCode = error as Error & { code?: unknown };
    return typeof withCode.code === "string" && withCode.code.trim()
      ? withCode.code.trim().slice(0, 80)
      : "ERROR";
  }
  return "ERROR";
}

export function sanitizeErrorPreview(error: unknown): string | null {
  if (!error) return null;

  const message = error instanceof Error ? error.message : String(error);
  const redacted = message
    .replace(/bearer\s+[a-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(
      /(api[_-]?key|access[_-]?token|refresh[_-]?token|authorization)\s*[:=]\s*\S+/gi,
      "$1=[redacted]"
    )
    .replace(/\s+/g, " ")
    .trim();

  return redacted ? redacted.slice(0, MAX_ERROR_PREVIEW_LENGTH) : null;
}

export async function recordMcpToolCallEvent(input: McpToolCallEventInput): Promise<void> {
  const userId = input.userId.trim();
  const requestId = input.requestId.trim();
  const toolName = input.toolName.trim();

  if (!userId || !requestId || !toolName) {
    return;
  }

  const payload = {
    user_id: userId,
    request_id: requestId,
    mcp_session_id: clean(input.mcpSessionId),
    server_id: clean(input.serverId),
    server_name: clean(input.serverName),
    server_url: clean(input.serverUrl),
    server_icons: input.serverIcons ?? null,
    app_key: normalizeMcpAppKey(input.serverName, input.serverId),
    tool_name: toolName,
    tool_namespace: clean(input.toolNamespace),
    event_type: input.eventType ?? "downstream_tool",
    status: input.status,
    error_code: input.status === "error" ? getErrorCode(input.error) : null,
    error_preview: input.status === "error" ? sanitizeErrorPreview(input.error) : null,
    started_at: input.startedAt.toISOString(),
    completed_at: input.completedAt.toISOString(),
    duration_ms: Math.max(0, Math.round(input.durationMs)),
  };

  try {
    const { error } = await supabase.from("mcp_tool_call_events").insert(payload);
    if (error) {
      console.warn("[mcp-analytics] Failed to record tool call event", error);
    }
  } catch (error) {
    console.warn("[mcp-analytics] Failed to record tool call event", error);
  }
}
