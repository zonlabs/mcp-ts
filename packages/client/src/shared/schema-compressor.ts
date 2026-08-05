/**
 * SchemaCompressor — Utilities for compact tool representations.
 *
 * Provides compact representations of tools (name + description only,
 * no inputSchema).
 *
 * @packageDocumentation
 */
import type { Tool } from "@modelcontextprotocol/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A minimal tool representation containing only what an LLM needs to
 * *decide whether* to use a tool.  The full `inputSchema` is deferred.
 */
export interface CompactTool {
  name: string;
  description?: string;
  /**
   * Human-readable hint about the expected parameters.
   * e.g. "(location: string, unit?: 'celsius' | 'fahrenheit')"
   */
  parameterHint?: string;
}

// ---------------------------------------------------------------------------
// SchemaCompressor
// ---------------------------------------------------------------------------

export class SchemaCompressor {
  /**
   * Convert a full MCP Tool definition to a compact summary.
   *
   * The compact form omits `inputSchema` entirely and optionally generates
   * a short `parameterHint` from the schema's top-level properties.
   */
  static toCompact(tool: Tool): CompactTool {
    const compact: CompactTool = {
      name: tool.name,
      description: tool.description,
    };

    // Build parameter hint from schema
    if (tool.inputSchema && typeof tool.inputSchema === 'object') {
      const schema = tool.inputSchema as {
        properties?: Record<string, { type?: string; enum?: unknown[] }>;
        required?: string[];
      };

      if (schema.properties) {
        const required = new Set(schema.required ?? []);
        const parts: string[] = [];

        for (const [key, val] of Object.entries(schema.properties)) {
          const type = val?.type ?? 'any';
          const enumSuffix =
            val?.enum && Array.isArray(val.enum)
              ? `: ${val.enum.map((e) => `'${e}'`).join(' | ')}`
              : `: ${type}`;

          parts.push(required.has(key) ? `${key}${enumSuffix}` : `${key}?${enumSuffix}`);
        }

        if (parts.length > 0) {
          compact.parameterHint = `(${parts.join(', ')})`;
        }
      }
    }

    return compact;
  }

  /**
   * Convert an array of tools to compact form, optionally limiting the count.
   */
  static compactAll(tools: Tool[], options?: { maxTools?: number }): CompactTool[] {
    const limited = options?.maxTools ? tools.slice(0, options.maxTools) : tools;
    return limited.map((t) => SchemaCompressor.toCompact(t));
  }
}
