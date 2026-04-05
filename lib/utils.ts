import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Pretty-print workflow default params for JSON textareas; empty → "{}" */
export function defaultParamsToJson(
  defaults: Record<string, unknown> | undefined | null
): string {
  const o =
    defaults && typeof defaults === "object" && !Array.isArray(defaults) ? defaults : {};
  if (Object.keys(o).length === 0) return "{}";
  return JSON.stringify(o, null, 2);
}
