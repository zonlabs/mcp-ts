import type { CodeModeLimits } from "../types.js";

export const DEFAULT_LIMITS: Required<CodeModeLimits> = {
  timeoutMs: 10_000,
  memoryLimitMb: 64,
  maxToolCalls: 20,
  maxConcurrentToolCalls: 3,
  maxResultBytes: 1024 * 1024,
  maxLogEntries: 100
};

export function resolveLimits(limits: CodeModeLimits | undefined): Required<CodeModeLimits> {
  if (!limits) return { ...DEFAULT_LIMITS };
  // Filter out undefined values so they don't override defaults
  const defined = Object.fromEntries(
    Object.entries(limits).filter(([, v]) => v !== undefined)
  );
  return { ...DEFAULT_LIMITS, ...defined };
}

export function estimateJsonBytes(value: unknown): number {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return 0;
  return utf8ByteLength(serialized);
}

function utf8ByteLength(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < str.length ? str.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}
