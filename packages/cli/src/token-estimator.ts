import type { Tool } from "@modelcontextprotocol/client";

const CALIBRATION_DIVISOR = 3.6;

function classifyCharacter(character: string): number {
  const code = character.charCodeAt(0);
  if (
    code <= 0x20 ||
    character === "{" ||
    character === "}" ||
    character === "[" ||
    character === "]" ||
    character === ":" ||
    character === ","
  ) return 1;
  if (code >= 0x21 && code <= 0x2f) return 1.5;
  if (code >= 0x30 && code <= 0x39) return 2;
  if (code >= 0x41 && code <= 0x5a) return 3.5;
  if (code >= 0x61 && code <= 0x7a) return 4;
  return 2.5;
}

function stringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, nestedValue: unknown) => {
    if (!nestedValue || typeof nestedValue !== "object") return nestedValue;
    if (seen.has(nestedValue)) return "[Circular]";
    seen.add(nestedValue);
    return nestedValue;
  });
}

export function estimateTextTokens(text: string): number {
  let weightedLength = 0;
  for (const character of text) weightedLength += 1 / classifyCharacter(character);
  return Math.ceil(weightedLength / (1 / CALIBRATION_DIVISOR));
}

export function estimateToolTokens(tool: Pick<Tool, "name" | "description" | "inputSchema">): number {
  const parts = [tool.name];
  if (tool.description) parts.push(tool.description);
  if (tool.inputSchema) parts.push(stringify(tool.inputSchema));
  return estimateTextTokens(parts.join(" "));
}

export function estimateToolsTokens(
  tools: Array<Pick<Tool, "name" | "description" | "inputSchema">>
): number {
  return tools.reduce((total, tool) => total + estimateToolTokens(tool), 0);
}
