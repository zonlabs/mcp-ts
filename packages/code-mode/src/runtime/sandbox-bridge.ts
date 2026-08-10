import type { IndexedTool, ToolServer } from "../types.js";

// ---------------------------------------------------------------------------
// Identifier helpers
// ---------------------------------------------------------------------------

/**
 * Sanitizes a string to be a valid JavaScript identifier.
 */
export function sanitizeIdentifier(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/^[0-9]/, "_$&");
}

function jsonSchemaToTsType(schema: Record<string, unknown> | undefined): string {
  if (!schema || typeof schema !== "object") return "any";

  if (schema.enum && Array.isArray(schema.enum)) {
    return (schema.enum as unknown[])
      .map((v) => (typeof v === "string" ? JSON.stringify(v) : String(v)))
      .join(" | ");
  }

  switch (schema.type) {
    case "object": {
      const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
      if (!props) return "{ [key: string]: any }";
      const required = (schema.required as string[]) ?? [];
      const entries = Object.entries(props).map(([key, propSchema]) => {
        const opt = required.includes(key) ? "" : "?";
        const propType = jsonSchemaToTsType(propSchema);
        return `${key}${opt}: ${propType}`;
      });
      return `{ ${entries.join("; ")} }`;
    }
    case "array": {
      if (!schema.items) return "any[]";
      const itemSchema = schema.items as Record<string, unknown>;
      const itemType = Array.isArray(itemSchema)
        ? itemSchema.map((s) => jsonSchemaToTsType(s as Record<string, unknown>)).join(" | ")
        : jsonSchemaToTsType(itemSchema);
      return `(${itemType})[]`;
    }
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    default:
      if (Array.isArray(schema.type)) {
        return (schema.type as string[])
          .map((t) => {
            switch (t) {
              case "string": return "string";
              case "number":
              case "integer": return "number";
              case "boolean": return "boolean";
              case "null": return "null";
              case "object": return "object";
              case "array": return "any[]";
              default: return "any";
            }
          })
          .join(" | ");
      }
      return "any";
  }
}

function jsonSchemaToObjectContent(schema: Record<string, unknown> | undefined): string {
  if (!schema || typeof schema !== "object" || schema.type !== "object") {
    return "    [key: string]: any;";
  }

  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = (schema.required ?? []) as string[];
  const lines: string[] = [];

  for (const [propName, propSchema] of Object.entries(properties)) {
    const isRequired = required.includes(propName);
    const optionalMarker = isRequired ? "" : "?";
    const description = propSchema.description ? String(propSchema.description) : "";
    const tsType = jsonSchemaToTsType(propSchema);

    if (description) {
      lines.push(`    /** ${escapeComment(description)} */`);
    }
    lines.push(`    ${propName}${optionalMarker}: ${tsType};`);
  }

  return lines.length > 0 ? lines.join("\n") : "    [key: string]: any;";
}

function escapeComment(text: string): string {
  return text.replace(/\*\//g, "*\\/").replace(/\n/g, " ");
}

/**
 * Generates a TypeScript interface definition for a single tool,
 * grouped under its server namespace.
 */
export function toolToTypeScriptInterface(tool: IndexedTool): string {
  const sanitizedServer = sanitizeIdentifier(tool.serverId);
  const sanitizedTool = sanitizeIdentifier(tool.toolName);
  const accessPattern = `${sanitizedServer}.${sanitizedTool}`;

  const inputContent = jsonSchemaToObjectContent(tool.inputSchema);

  return `
namespace ${sanitizedServer} {
  interface ${sanitizedTool}Input {
${inputContent}
  }
}

/**
 * ${escapeComment(tool.description || "No description")}
 * Server: ${tool.serverId}
 * Access as: ${accessPattern}(args)
 */`;
}

export function generateAllInterfaces(tools: IndexedTool[]): string {
  const interfaces = tools.map((tool) => toolToTypeScriptInterface(tool));
  return `// Auto-generated TypeScript interfaces for available tools\n${interfaces.join("\n\n")}`;
}

/**
 * Generates a lookup map of tool name -> TypeScript interface string.
 * Keys use the format "serverId.toolName".
 */
export function generateInterfaceMap(tools: IndexedTool[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const tool of tools) {
    const key = `${tool.serverId}.${tool.toolName}`;
    map[key] = toolToTypeScriptInterface(tool);
  }
  return map;
}

/**
 * Generates JavaScript code to set up namespace functions in the sandbox.
 */
export function generateNamespaceBridgeCode(
  tools: IndexedTool[],
  _servers: Map<string, ToolServer>,
  asyncPattern?: boolean,
): string {
  const parts: string[] = [];
  const namespaces = new Set<string>();

  for (const tool of tools) {
    const sanitizedServer = sanitizeIdentifier(tool.serverId);
    const sanitizedTool = sanitizeIdentifier(tool.toolName);

    if (!namespaces.has(sanitizedServer)) {
      namespaces.add(sanitizedServer);
      parts.push(`globalThis.${sanitizedServer} = globalThis.${sanitizedServer} || {};`);
    }

    if (asyncPattern) {
      parts.push(`
      globalThis.${sanitizedServer}.${sanitizedTool} = async function(args) {
        var resultJson = await __callToolRef(${JSON.stringify(tool.serverId)}, ${JSON.stringify(tool.toolName)}, JSON.stringify(args || {}));
        var parsed = JSON.parse(resultJson);
        if (!parsed.success) throw new Error(parsed.error);
        return parsed.result;
      };
    `);
    } else {
      parts.push(`
      globalThis.${sanitizedServer}.${sanitizedTool} = function(args) {
        var resultJson = __callToolRef.applySyncPromise(undefined, [${JSON.stringify(tool.serverId)}, ${JSON.stringify(tool.toolName)}, JSON.stringify(args || {})]);
        var parsed = JSON.parse(resultJson);
        if (!parsed.success) throw new Error(parsed.error);
        return parsed.result;
      };
    `);
    }
  }

  // servers map: also expose via keyed access (servers["id"].tool()) for dynamic lookups
  parts.push("globalThis.servers = globalThis.servers || {};");
  for (const ns of namespaces) {
    parts.push(`globalThis.servers[${JSON.stringify(ns)}] = globalThis.${ns};`);
  }

  return parts.join("\n");
}

export function generateBootstrapCode(
  interfacesString: string,
  interfaceMapJson: string,
  quickjs?: boolean,
): string {
  const stringifyHelper = `function(a) { return typeof a === "object" && a !== null ? JSON.stringify(a, null, 2) : String(a); }`;

  const callConsole = (level: string, ref: string) => {
    return `${ref}(...args.map(${stringifyHelper}))`;
  };

  if (quickjs) {
    return `
"use strict";

globalThis.console = {
  log: function(...args) { ${callConsole("log", "__logRef")} },
  error: function(...args) { ${callConsole("error", "__errorRef")} },
  warn: function(...args) { ${callConsole("warn", "__warnRef")} },
  info: function(...args) { ${callConsole("info", "__infoRef")} },
};

globalThis.callTool = async function(serverId, toolName, args) {
  var resultJson = await __callToolRef(serverId, toolName, JSON.stringify(args || {}));
  var parsed = JSON.parse(resultJson);
  if (!parsed.success) throw new Error(parsed.error);
  return parsed.result;
};

globalThis.callToolRaw = async function(serverId, toolName, args) {
  var resultJson = await __callToolRawRef(serverId, toolName, JSON.stringify(args || {}));
  var parsed = JSON.parse(resultJson);
  if (!parsed.success) throw new Error(parsed.error);
  return parsed.result;
};

globalThis.searchTools = async function(query, limit) {
  var resultJson = await __searchToolsRef(query || "", limit || 10);
  return JSON.parse(resultJson);
};

globalThis.getToolSchema = async function(serverId, toolName) {
  var resultJson = await __getToolSchemaRef(serverId, toolName);
  return JSON.parse(resultJson);
};

globalThis.__interfaces = ${JSON.stringify(interfacesString)};
const __interfaceMap = ${interfaceMapJson};
globalThis.__getToolInterface = function(toolName) {
  return __interfaceMap[toolName] || null;
};

var __inputParsed = JSON.parse(typeof __input === "string" ? __input : "null");
globalThis.input = typeof __inputParsed === "undefined" || __inputParsed === null ? undefined : __inputParsed;
`;
  }

  return `
"use strict";

const __stringify = (a) => typeof a === "object" && a !== null ? JSON.stringify(a, null, 2) : String(a);
globalThis.console = {
  log: (...args) => __logRef.applySync(undefined, args.map(__stringify)),
  error: (...args) => __errorRef.applySync(undefined, args.map(__stringify)),
  warn: (...args) => __warnRef.applySync(undefined, args.map(__stringify)),
  info: (...args) => __infoRef.applySync(undefined, args.map(__stringify)),
};

globalThis.callTool = function(serverId, toolName, args) {
  var resultJson = __callToolRef.applySyncPromise(undefined, [serverId, toolName, JSON.stringify(args || {})]);
  var parsed = JSON.parse(resultJson);
  if (!parsed.success) throw new Error(parsed.error);
  return parsed.result;
};

globalThis.callToolRaw = function(serverId, toolName, args) {
  var resultJson = __callToolRawRef.applySyncPromise(undefined, [serverId, toolName, JSON.stringify(args || {})]);
  var parsed = JSON.parse(resultJson);
  if (!parsed.success) throw new Error(parsed.error);
  return parsed.result;
};

globalThis.searchTools = function(query, limit) {
  var resultJson = __searchToolsRef.applySyncPromise(undefined, [query || "", limit || 10]);
  return JSON.parse(resultJson);
};

globalThis.getToolSchema = function(serverId, toolName) {
  var resultJson = __getToolSchemaRef.applySyncPromise(undefined, [serverId, toolName]);
  return JSON.parse(resultJson);
};

globalThis.__interfaces = ${JSON.stringify(interfacesString)};
const __interfaceMap = ${interfaceMapJson};
globalThis.__getToolInterface = function(toolName) {
  return __interfaceMap[toolName] || null;
};

globalThis.input = typeof __input !== "undefined" ? __input : undefined;
`;
}
