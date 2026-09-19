export function normalizeServerId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "source";
}

/** Enforces the tool's declared inputSchema (required fields + basic types) before args are forwarded. */
export function validateToolArgs(schema: unknown, args: Record<string, unknown>): void {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return;
  }
  const record = schema as Record<string, unknown>;
  const properties = (record.properties ?? {}) as Record<string, { type?: string }>;
  const required = Array.isArray(record.required) ? record.required : [];

  for (const name of required) {
    if (typeof name === "string" && !Object.prototype.hasOwnProperty.call(args, name)) {
      throw new Error(`Missing required argument "${name}".`);
    }
  }

  for (const [key, value] of Object.entries(args)) {
    const expectedType = properties[key]?.type;
    if (typeof expectedType === "string" && !matchesJsonSchemaType(value, expectedType)) {
      throw new Error(`Argument "${key}" does not match expected type "${expectedType}".`);
    }
  }
}

function matchesJsonSchemaType(value: unknown, type: string): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
    case "integer":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "null":
      return value === null;
    default:
      return true;
  }
}
