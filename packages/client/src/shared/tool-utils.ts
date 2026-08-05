/**
 * Utility functions for working with MCP tool metadata
 */

import type { ToolInfo } from './types.js';

export interface ToolUiConfig {
  resourceUri: string;
  sessionId: string;
}

/**
 * Extract UI resource URI from tool metadata
 *
 * @param tool - The tool to extract UI config from
 * @returns The resource URI if available, undefined otherwise
 *
 * @example
 * const uri = getToolUiResourceUri(tool);
 * if (uri) {
 *   // Tool has UI configuration
 * }
 */
export function getToolUiResourceUri(tool: ToolInfo): string | undefined {
  const meta = (tool as any)._meta;
  if (!meta?.ui) return undefined;

  const ui = meta.ui;
  if (typeof ui !== "object" || !ui) return undefined;

  // Check visibility filter - skip if explicitly hidden from app
  if (ui.visibility && !ui.visibility.includes("app")) return undefined;

  // Support both 'uri' and 'resourceUri' field names for flexibility
  return typeof ui.resourceUri === "string"
    ? ui.resourceUri
    : typeof ui.uri === "string"
      ? ui.uri
      : undefined;
}

/**
 * Find a tool by name within connections
 *
 * @param connections - Array of MCP connections
 * @param toolName - Name of the tool to find
 * @returns The tool if found, undefined otherwise
 *
 * @example
 * const tool = findToolByName(connections, "get_weather");
 */
export function findToolByName(
  connections: Array<{ tools: ToolInfo[] }>,
  toolName: string
): ToolInfo | undefined {
  for (const conn of connections) {
    const tool = conn.tools.find((t) => t.name === toolName);
    if (tool) return tool;
  }
  return undefined;
}
