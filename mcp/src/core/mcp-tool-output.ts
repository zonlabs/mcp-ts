export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function extractContentErrorText(result: Record<string, unknown>): string | undefined {
  const content = result.content;
  if (typeof content === "string") {
    return content.replace(/^Error:\s*/i, "");
  }
  if (Array.isArray(content) && content.length > 0) {
    const first = content[0];
    if (isRecord(first) && typeof first.text === "string") return first.text.replace(/^Error:\s*/i, "");
    if (typeof first === "string") return first.replace(/^Error:\s*/i, "");
    return JSON.stringify(first);
  }
  if (isRecord(content)) {
    const maybeError = (content as Record<string, unknown>).error ?? (content as Record<string, unknown>).message;
    if (typeof maybeError === "string") return maybeError;
    return JSON.stringify(content);
  }
  return undefined;
}

export function extractReturnedError(result: unknown): string | undefined {
  if (!isRecord(result)) return undefined;
  if (result.isError !== true) return undefined;
  return extractContentErrorText(result) || "MCP tool returned an error";
}
