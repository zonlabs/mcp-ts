import type { Tool } from "@modelcontextprotocol/client";
import {
  ToolRouter,
  type IndexedTool,
  type ToolClient,
  type ToolRouterStrategy,
  type ToolSummary
} from "@mcp-ts/sdk/shared";
import { estimateToolTokens, estimateToolsTokens } from "./token-estimator.js";

export interface SearchResult extends ToolSummary {
  estimatedTokens: number;
}

export interface StrategyBenchmark {
  strategy: ToolRouterStrategy;
  exposedTools: number;
  estimatedTokens: number;
}

export async function createRouter(
  client: ToolClient,
  strategy: ToolRouterStrategy = "search"
): Promise<ToolRouter> {
  const router = new ToolRouter([client], { strategy });
  await router.listTools({ limit: 1 });
  return router;
}

export async function searchTools(
  router: ToolRouter,
  query: string,
  limit = 10
): Promise<SearchResult[]> {
  const results = await router.searchTools(query, limit);
  return results.map((result) => {
    const tool = router.getToolSchema(result.name, result.serverId);
    return { ...result, estimatedTokens: tool ? estimateToolTokens(tool) : 0 };
  });
}

export function resolveTool(router: ToolRouter, reference: string): IndexedTool | undefined {
  const separator = reference.indexOf("::");
  if (separator > 0) {
    return router.getToolSchema(reference.slice(separator + 2), reference.slice(0, separator));
  }
  return router.getToolSchema(reference);
}

export async function benchmarkStrategies(client: ToolClient): Promise<StrategyBenchmark[]> {
  const router = await createRouter(client, "all");
  const strategies: ToolRouterStrategy[] = ["all", "search", "groups"];
  const benchmarks: StrategyBenchmark[] = [];
  for (const strategy of strategies) {
    router.setStrategy(strategy);
    const exposed = await router.getFilteredTools();
    benchmarks.push({
      strategy,
      exposedTools: exposed.length,
      estimatedTokens: estimateToolsTokens(exposed)
    });
  }
  return benchmarks;
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
