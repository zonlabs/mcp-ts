import type { McpEndpointClient } from "../client.js";
import { MCP_META_TOOL_NAMES } from "../constants.js";
import { parseToolRef } from "../core.js";

export interface GatewayServerSummary {
  serverId: string;
  serverName: string;
  toolCount: number;
  source: "local" | "remote";
  discoveryState: "complete" | "timeout" | "error";
  error?: string;
}

export interface GatewayToolSummary {
  toolId: string;
  serverId: string;
  serverName: string;
  toolName: string;
  description: string;
}

export interface GatewayToolSearchRequest {
  query: string;
  serverId?: string;
  limit?: number;
  detail?: "brief" | "detailed" | "full";
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function throwIfGatewayError(result: unknown, metaToolName: string): void {
  if (!isRecord(result) || result.isError !== true) return;
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content.find(
    (entry): entry is { type: "text"; text: string } =>
      isRecord(entry) && entry.type === "text" && typeof entry.text === "string",
  )?.text;
  throw new Error(`${metaToolName} failed: ${text || "gateway returned an error"}`);
}

function parseGatewayJsonResult(result: unknown, metaToolName: string): unknown {
  if (!isRecord(result)) {
    throw new Error(`${metaToolName} returned no text content.`);
  }

  const content = Array.isArray(result.content) ? result.content : [];
  const text = content.find(
    (entry): entry is { type: "text"; text: string } =>
      isRecord(entry) && entry.type === "text" && typeof entry.text === "string",
  )?.text;

  throwIfGatewayError(result, metaToolName);
  if (!text) {
    throw new Error(`${metaToolName} returned no text content.`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${metaToolName} returned invalid JSON.`);
  }
}

function requireArrayProperty(value: unknown, property: string, metaToolName: string): unknown[] {
  if (!isRecord(value) || !Array.isArray(value[property])) {
    throw new Error(`${metaToolName} returned invalid JSON data.`);
  }
  return value[property];
}

function requireString(item: unknown, properties: string[], metaToolName: string): string {
  if (!isRecord(item)) {
    throw new Error(`${metaToolName} returned invalid JSON data.`);
  }
  const value = properties.map((property) => item[property]).find((candidate) => typeof candidate === "string");
  if (typeof value !== "string" || !value) {
    throw new Error(`${metaToolName} returned invalid JSON data.`);
  }
  return value;
}

function requireNumber(item: unknown, properties: string[], metaToolName: string): number {
  if (!isRecord(item)) {
    throw new Error(`${metaToolName} returned invalid JSON data.`);
  }
  const value = properties.map((property) => item[property]).find((candidate) => typeof candidate === "number");
  if (typeof value !== "number") {
    throw new Error(`${metaToolName} returned invalid JSON data.`);
  }
  return value;
}

function requireEnum<T extends string>(
  item: unknown,
  properties: string[],
  allowed: readonly T[],
  metaToolName: string,
): T {
  const value = requireString(item, properties, metaToolName);
  if (!allowed.includes(value as T)) {
    throw new Error(`${metaToolName} returned invalid JSON data.`);
  }
  return value as T;
}

function isCanonicalToolId(toolId: string): boolean {
  const { serverId, toolName } = parseToolRef(toolId);
  return toolId.includes("::") && Boolean(serverId?.trim() && toolName.trim());
}

function requireCanonicalToolId(toolId: string): void {
  if (!isCanonicalToolId(toolId)) {
    throw new Error(`Use a canonical server::tool ID, not ${JSON.stringify(toolId)}.`);
  }
}

export async function fetchGatewayServers(
  client: McpEndpointClient,
  query: string,
): Promise<GatewayServerSummary[]> {
  const result = await client.callTool(MCP_META_TOOL_NAMES.listServers, { query });
  const servers = requireArrayProperty(
    parseGatewayJsonResult(result, MCP_META_TOOL_NAMES.listServers),
    "servers",
    MCP_META_TOOL_NAMES.listServers,
  );
  return servers.map((server) => {
    const discoveryState = requireEnum(
      server,
      ["discoveryState", "discovery_state"],
      ["complete", "timeout", "error"] as const,
      MCP_META_TOOL_NAMES.listServers,
    );
    const error = isRecord(server) && typeof server.error === "string" ? server.error : undefined;
    return {
      serverId: requireString(server, ["serverId", "server_id"], MCP_META_TOOL_NAMES.listServers),
      serverName: requireString(server, ["serverName", "server_name"], MCP_META_TOOL_NAMES.listServers),
      source: requireEnum(
        server,
        ["source"],
        ["local", "remote"] as const,
        MCP_META_TOOL_NAMES.listServers,
      ),
      toolCount: requireNumber(server, ["toolCount", "tool_count"], MCP_META_TOOL_NAMES.listServers),
      discoveryState,
      ...(error ? { error } : {}),
    };
  });
}

export async function searchGatewayTools(
  client: McpEndpointClient,
  request: GatewayToolSearchRequest,
): Promise<GatewayToolSummary[]> {
  const args: Record<string, unknown> = { query: request.query };
  if (request.serverId !== undefined) args.serverId = request.serverId;
  if (request.limit !== undefined) args.limit = request.limit;
  if (request.detail !== undefined) args.detail = request.detail;

  const result = await client.callTool(MCP_META_TOOL_NAMES.searchTools, args);
  const tools = requireArrayProperty(
    parseGatewayJsonResult(result, MCP_META_TOOL_NAMES.searchTools),
    "tools",
    MCP_META_TOOL_NAMES.searchTools,
  );
  return tools.map((tool) => ({
    toolId: requireString(tool, ["toolId", "tool_id"], MCP_META_TOOL_NAMES.searchTools),
    serverId: requireString(tool, ["serverId", "server_id"], MCP_META_TOOL_NAMES.searchTools),
    serverName: requireString(tool, ["serverName", "server_name"], MCP_META_TOOL_NAMES.searchTools),
    toolName: requireString(tool, ["toolName", "tool_name"], MCP_META_TOOL_NAMES.searchTools),
    description: isRecord(tool) && typeof tool.description === "string" ? tool.description : "",
  }));
}

export async function fetchGatewayToolSchemas(
  client: McpEndpointClient,
  toolIds: string[],
): Promise<unknown[]> {
  toolIds.forEach(requireCanonicalToolId);
  const result = await client.callTool(MCP_META_TOOL_NAMES.getToolSchemas, { toolIds });
  return requireArrayProperty(
    parseGatewayJsonResult(result, MCP_META_TOOL_NAMES.getToolSchemas),
    "tools",
    MCP_META_TOOL_NAMES.getToolSchemas,
  );
}

export async function resolveGatewayToolId(
  client: McpEndpointClient,
  reference: string,
): Promise<string> {
  if (isCanonicalToolId(reference)) return reference;

  const parsed = parseToolRef(reference);
  if (parsed.serverId) {
    throw new Error(`Use a canonical server::tool ID, not ${JSON.stringify(reference)}.`);
  }

  const matches = (await searchGatewayTools(client, { query: reference }))
    .filter((tool) => tool.toolName.toLowerCase() === parsed.toolName.toLowerCase());
  if (matches.length === 1) return matches[0].toolId;
  if (matches.length === 0) {
    throw new Error(`No exact tool named ${JSON.stringify(parsed.toolName)} was found; use a canonical server::tool ID.`);
  }
  throw new Error(`Multiple tools are named ${JSON.stringify(parsed.toolName)}; use a canonical server::tool ID.`);
}

export async function callGatewayTool(
  client: McpEndpointClient,
  toolId: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  requireCanonicalToolId(toolId);
  const result = await client.callTool(MCP_META_TOOL_NAMES.callTool, { toolId, args });
  throwIfGatewayError(result, MCP_META_TOOL_NAMES.callTool);
  return result;
}
