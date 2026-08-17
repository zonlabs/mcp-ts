import type { Tool } from "@modelcontextprotocol/client";
import {
  createToolRouter,
  mcpServer,
  type ToolClient,
  type ToolRouter,
  type ToolSchemaResult,
  type ToolSearchResult,
} from "@mcp-ts/tool-router";
import { estimateToolTokens, estimateToolsTokens } from "./token-estimator.js";

export interface SearchResult extends ToolSearchResult {
  name: string;
  estimatedTokens: number;
}

export type ToolRouterStrategy = "all" | "search" | "groups";

export interface StrategyBenchmark {
  strategy: ToolRouterStrategy;
  exposedTools: number;
  estimatedTokens: number;
}

export interface ResolvedTool extends ToolSchemaResult {
  name: string;
}

const routerServerIds = new WeakMap<ToolRouter, string>();

export async function createRouter(client: ToolClient): Promise<ToolRouter> {
  const serverId = client.getServerId?.() ?? "remote";
  const router = await createToolRouter({
    servers: [mcpServer(serverId, client, client.getServerName?.())],
  });
  routerServerIds.set(router, serverId);
  return router;
}

function parseMetaSearchResults(raw: unknown): SearchResult[] {
  let text = "";
  if (raw && typeof raw === "object" && "content" in raw && Array.isArray((raw as { content: unknown[] }).content)) {
    const firstText = (raw as { content: Array<{ type?: string; text?: string }> }).content.find(
      (c) => c.type === "text",
    );
    text = firstText?.text ?? "";
  } else if (typeof raw === "string") {
    text = raw;
  }
  if (!text) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  const items = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).tools)
      ? ((parsed as Record<string, unknown>).tools as unknown[])
      : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).results)
        ? ((parsed as Record<string, unknown>).results as unknown[])
        : [];

  return items.map((item: Record<string, unknown>) => {
    const toolName = String(item.tool_name ?? item.name ?? "");
    const serverName = String(item.server_name ?? item.serverName ?? item.server_id ?? item.serverId ?? "remote");
    const serverId = String(item.server_id ?? item.serverId ?? serverName);
    const toolId = String(item.tool_id ?? item.toolId ?? `${serverId}::${toolName}`);
    const description = item.description ? String(item.description) : "";
    return {
      toolId,
      toolName,
      name: toolName,
      serverId,
      serverName,
      description,
      score: 1,
      estimatedTokens: 0,
    };
  });
}

export async function searchTools(
  router: ToolRouter,
  query: string,
  limit = 10,
): Promise<SearchResult[]> {
  const metaSearchTool =
    resolveTool(router, "search_mcp_tools") ?? resolveTool(router, "search_tools");
  if (metaSearchTool) {
    try {
      const rawResult = await router.callTool({
        toolId: metaSearchTool.toolId,
        args: { query, limit },
      });
      const metaResults = parseMetaSearchResults(rawResult);
      if (metaResults.length > 0) {
        return metaResults;
      }
    } catch {
      // Fallback to router.searchTools
    }
  }

  const results = await router.searchTools({ query, limit });
  return results.map((result) => {
    const [tool] = router.getToolSchemas({ toolIds: [result.toolId] });
    return {
      ...result,
      name: result.toolName,
      estimatedTokens: tool
        ? estimateToolTokens({
            name: tool.toolName,
            description: tool.description,
            inputSchema: tool.inputSchema as Tool["inputSchema"],
          })
        : 0,
    };
  });
}

export function resolveTool(router: ToolRouter, reference: string): ResolvedTool | undefined {
  const toolId = reference.includes("::")
    ? reference
    : `${routerServerIds.get(router) ?? "remote"}::${reference}`;
  try {
    const [tool] = router.getToolSchemas({ toolIds: [toolId] });
    return tool ? { ...tool, name: tool.toolName } : undefined;
  } catch {
    return undefined;
  }
}

export async function benchmarkStrategies(client: ToolClient): Promise<StrategyBenchmark[]> {
  const router = await createRouter(client);
  const directTools = (await client.listTools()).tools as Tool[];
  const metaTools = router.getMetaTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema as Tool["inputSchema"],
  }));
  return [
    {
      strategy: "all",
      exposedTools: directTools.length,
      estimatedTokens: estimateToolsTokens(directTools),
    },
    {
      strategy: "search",
      exposedTools: metaTools.length,
      estimatedTokens: estimateToolsTokens(metaTools),
    },
    {
      strategy: "groups",
      exposedTools: directTools.length,
      estimatedTokens: estimateToolsTokens(directTools),
    },
  ];
}

type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
};

function literal(value: unknown): string {
  if (value === null) return "null";
  if (["string", "number", "boolean"].includes(typeof value)) return JSON.stringify(value);
  return "unknown";
}

function schemaToType(schema: unknown): string {
  if (!schema || typeof schema !== "object") return "unknown";
  const value = schema as JsonSchema;
  if (value.const !== undefined) return literal(value.const);
  if (value.enum?.length) return value.enum.map(literal).join(" | ");
  if (value.oneOf?.length) return value.oneOf.map(schemaToType).join(" | ");
  if (value.anyOf?.length) return value.anyOf.map(schemaToType).join(" | ");
  if (value.allOf?.length) return value.allOf.map(schemaToType).join(" & ");
  if (Array.isArray(value.type)) {
    return value.type.map((type) => schemaToType({ ...value, type })).join(" | ");
  }

  switch (value.type) {
    case "string": return "string";
    case "integer":
    case "number": return "number";
    case "boolean": return "boolean";
    case "null": return "null";
    case "array": return `Array<${schemaToType(value.items)}>`;
    case "object": {
      const required = new Set(value.required ?? []);
      const properties = Object.entries(value.properties ?? {}).map(
        ([name, property]) => `${JSON.stringify(name)}${required.has(name) ? "" : "?"}: ${schemaToType(property)};`
      );
      if (value.additionalProperties && value.additionalProperties !== true) {
        properties.push(`[key: string]: ${schemaToType(value.additionalProperties)};`);
      } else if (value.additionalProperties === true) {
        properties.push("[key: string]: unknown;");
      }
      return `{ ${properties.join(" ")} }`;
    }
    default: return "unknown";
  }
}

function words(value: string): string[] {
  return value.split(/[^a-zA-Z0-9]+/).filter(Boolean);
}

function pascalCase(value: string): string {
  const result = words(value).map((word) => word[0].toUpperCase() + word.slice(1)).join("");
  return /^[0-9]/.test(result) ? `Tool${result}` : result || "Tool";
}

function camelCase(value: string): string {
  const pascal = pascalCase(value);
  return pascal[0].toLowerCase() + pascal.slice(1);
}

function uniqueName(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}${suffix++}`;
  used.add(candidate);
  return candidate;
}

function jsDoc(description: string | undefined, indent = ""): string {
  if (!description) return "";
  const safe = description.replace(/\*\//g, "*\\/").split("\n");
  return `${indent}/**\n${safe.map((line) => `${indent} * ${line}`).join("\n")}\n${indent} */\n`;
}

export function generateWrappers(tools: Tool[]): string {
  const typeNames = new Set<string>();
  const methodNames = new Set(["constructor", "callTool"]);
  const definitions: string[] = [];
  const methods: string[] = [];

  for (const tool of tools) {
    const typeBase = uniqueName(pascalCase(tool.name), typeNames);
    const methodName = uniqueName(camelCase(tool.name), methodNames);
    const inputType = `${typeBase}Input`;
    const outputType = `${typeBase}Output`;
    definitions.push(
      `${jsDoc(tool.description)}export type ${inputType} = ${schemaToType(tool.inputSchema)};`,
      `export type ${outputType} = ${schemaToType(tool.outputSchema)};`
    );
    methods.push(
      `${jsDoc(tool.description, "  ")}  async ${methodName}(input: ${inputType}): Promise<${outputType}> {\n` +
        `    return this.callTool(${JSON.stringify(tool.name)}, input) as Promise<${outputType}>;\n` +
        "  }"
    );
  }

  return [
    "// Generated by @mcp-ts/cli. Do not edit manually.",
    "",
    "export type McpToolCaller = (name: string, args: unknown) => Promise<unknown>;",
    "",
    ...definitions.flatMap((definition) => [definition, ""]),
    "export class McpTools {",
    "  constructor(private readonly callTool: McpToolCaller) {}",
    "",
    methods.join("\n\n"),
    "}",
    ""
  ].join("\n");
}
