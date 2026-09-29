import { isToolUIPart, getToolName, type UIMessagePart } from "ai";
import type { McpServerMetadata } from "@/agent/chat-agent";

export type ToolIconCategory =
  | "search"
  | "read"
  | "write"
  | "terminal"
  | "memory-search"
  | "memory-remember"
  | "tool";

export interface ExecutionTimelineItem {
  id: string;
  name: string;
  rawToolName?: string;
  label?: string;
  iconCategory: ToolIconCategory;
  rawJson?: string;
  lineCount?: number;
  status: 'complete' | 'running' | 'error' | 'denied';
  approved?: boolean;
  deniedReason?: string;
  input?: unknown;
  output?: unknown;
  mcp?: McpServerMetadata;
}

/**
 * Extracts a concise summary string from tool input if available (e.g. query, url, path, name)
 */
export function extractInputSummary(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const obj = input as Record<string, unknown>;
  const candidateKeys = ["query", "q", "url", "uri", "path", "command", "cmd", "name", "id"];
  for (const key of candidateKeys) {
    const val = obj[key];
    if (typeof val === "string" && val.trim().length > 0) {
      return val.trim();
    }
  }
  return undefined;
}

/**
 * Formats any toolName dynamically (e.g. "linkos___list_mcp_servers" -> "linkos: list mcp servers")
 */
export function formatToolDisplayName(toolName: string): string {
  if (toolName.includes("___")) {
    const [server, ...rest] = toolName.split("___");
    return `${server}: ${rest.join(" ").replace(/_/g, " ")}`;
  }
  return toolName.replace(/_/g, " ");
}

/**
 * Dynamically resolves an icon category from the tool name
 */
export function resolveIconCategory(toolName: string): ToolIconCategory {
  const norm = toolName.toLowerCase();

  // Exact tool names
  if (norm === "search_memory") return "memory-search";
  if (norm === "remember_fact") return "memory-remember";

  if (norm.includes("search") || norm.includes("find") || norm.includes("query")) return "search";
  if (norm.includes("read") || norm.includes("fetch") || norm.includes("open") || norm.includes("get")) return "read";
  if (norm.includes("write") || norm.includes("create") || norm.includes("update") || norm.includes("save")) return "write";
  if (norm.includes("run") || norm.includes("exec") || norm.includes("bash") || norm.includes("command")) return "terminal";
  return "tool";
}

/**
 * Extracts and formats inner tool result, unwrapping MCP content arrays and JSON strings.
 */
export function formatToolOutput(output: unknown): { jsonString: string; lineCount: number } {
  if (output === undefined || output === null) return { jsonString: "", lineCount: 0 };

  let raw: unknown = output;

  // Unwrap standard MCP format: { content: [{ type: "text", text: "..." }] }
  if (
    typeof output === "object" &&
    output !== null &&
    "content" in output &&
    Array.isArray((output as { content: unknown[] }).content)
  ) {
    const contentArr = (output as { content: Array<{ type?: string; text?: string }> }).content;
    const textPart = contentArr.find((c) => c.type === "text");
    if (textPart?.text) {
      try {
        raw = JSON.parse(textPart.text);
      } catch {
        raw = textPart.text;
      }
    }
  }

  let jsonString = "";
  if (typeof raw === "string") {
    try {
      jsonString = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      jsonString = raw;
    }
  } else {
    try {
      jsonString = JSON.stringify(raw, null, 2);
    } catch {
      jsonString = String(raw);
    }
  }

  const lineCount = jsonString.split("\n").length;
  return { jsonString, lineCount };
}

/**
 * Builds the timeline list directly from message parts with MCP tool metadata.
 */
export function buildExecutionTimeline(
  parts: UIMessagePart<any, any>[],
  mcpMetadata?: Record<string, McpServerMetadata>
): ExecutionTimelineItem[] {
  const items: ExecutionTimelineItem[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!isToolUIPart(part)) continue;

    // Skip approval-requested since it is rendered as an interactive approval card
    if (part.state === 'approval-requested') {
      continue;
    }

    const rawToolName = getToolName(part) || 'tool';
    const isApproved = part.approval?.approved === true;
    const isDenied =
      part.state === 'output-denied' ||
      (part.state === 'approval-responded' && part.approval.approved === false);
    const isComplete = part.state === 'output-available';
    const isError = part.state === 'output-error';

    const input = part.input ?? (part as any).args ?? (part as any).approval?.descriptor;
    const output = part.state === 'output-available' ? part.output : (part as any).output ?? (part as any).result;
    const { jsonString, lineCount } = formatToolOutput(output);
    const label = extractInputSummary(input);
    const mcp = mcpMetadata?.[rawToolName];

    let deniedReason: string | undefined;
    if (isDenied) {
      deniedReason = part.approval?.reason;
    }

    const id = part.toolCallId || `tool-${i}`;
    const existingIndex = items.findIndex((it) => it.id === id);
    const item: ExecutionTimelineItem = {
      id,
      name: formatToolDisplayName(rawToolName),
      rawToolName,
      label,
      iconCategory: resolveIconCategory(rawToolName),
      input,
      output,
      rawJson: jsonString,
      lineCount,
      status: isDenied ? 'denied' : isError ? 'error' : isComplete ? 'complete' : 'running',
      approved: isApproved,
      deniedReason,
      mcp,
    };

    if (existingIndex >= 0) {
      items[existingIndex] = item;
    } else {
      items.push(item);
    }
  }

  return items;
}
