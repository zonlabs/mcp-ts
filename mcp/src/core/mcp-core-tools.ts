import { McpServer } from "@modelcontextprotocol/server";
import { McpManager } from "@mcp-ts/client";
import type { McpObservabilityEvent } from "@mcp-ts/client";
import { ToolIndex, ToolRouter, type IndexedTool } from "@mcp-ts/client/shared";
import { z } from "zod";
import { createWorkflowCodeModeRuntime } from "./codemode-runtime";
import { getRequestContext } from "./request-context";
import { asJsonObject, errorResponse, jsonResponse } from "./tool-result";
import { recordSelectedDownstreamToolSchemaInspection } from "./instrumentation";
import { publishRemoteCatalogForUser } from "./bridge-session-access";
import { buildRemoteCatalogFromClients } from "./remote-catalog";
import {
  buildLocalToolServers,
  listLocalServers,
  listLocalTools,
  invokeLocalTool,
  resolveLocalToolSchema,
} from "./local-bridge-tools";

const MCP_RESULT_EXTRACTION_HINT =
  "In CodeMode, `callTool(serverId, toolName, args)` and namespaced helpers return normalized tool results. Structured MCP payloads are unwrapped automatically; use raw helpers only when you explicitly need the MCP envelope.";

function handleObservability(event: McpObservabilityEvent): void {
  if (event.type === "db:read" || event.type === "db:write") {
    console.log(
      `[mcp-db][${event.type}] ${event.message} ${event.payload?.durationMs?.toFixed?.(1) ?? ""}ms`
    );
    return;
  }

  const prefix = event.serverId ? `[${event.serverId}]` : "[mcp]";
  const msg = event.message ?? "";
  switch (event.level) {
    case "error":
      console.error(`${prefix} ${msg}`);
      break;
    case "warn":
      console.warn(`${prefix} ${msg}`);
      break;
    default:
      console.log(`${prefix} ${msg}`);
  }
}

export async function getMcpManager(userId: string): Promise<McpManager> {
  const context = getRequestContext();
  let manager!: McpManager;
  const publishCatalog = async () => {
    if (!context.env) return;
    try {
      const catalog = await buildRemoteCatalogFromClients(manager.getClients());
      await publishRemoteCatalogForUser(context.env, userId, catalog);
    } catch {
      // A downstream catalog refresh is best effort.
    }
  };
  manager = new McpManager(userId, {
    onObservabilityEvent: handleObservability,
    onToolsChanged: () => void publishCatalog(),
  });
  await manager.connect();
  await publishCatalog();
  return manager;
}

type ResponseVerbosity = "compact" | "full";

const COMPACT_DESCRIPTION_MAX_CHARS = 240;
const DEFAULT_MCP_TOOL_SEARCH_LIMIT = 5;

function compactText(value: string | undefined, verbosity: ResponseVerbosity): string {
  const text = value ?? "";
  if (verbosity === "full" || text.length <= COMPACT_DESCRIPTION_MAX_CHARS) {
    return text;
  }
  return `${text.slice(0, COMPACT_DESCRIPTION_MAX_CHARS - 3).trimEnd()}...`;
}

function compactSchema(value: unknown, verbosity: ResponseVerbosity): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => compactSchema(item, verbosity));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const compacted: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "annotations") continue;
    if (key === "description" && typeof child === "string") {
      compacted[key] = compactText(child, verbosity);
      continue;
    }
    compacted[key] = compactSchema(child, verbosity);
  }
  return compacted;
}

function toSearchResultTool(
  tool: {
    name: string;
    description?: string;
    serverId: string;
    serverName: string;
  },
  verbosity: ResponseVerbosity = "compact"
) {
  return {
    serverId: tool.serverId,
    toolName: tool.name,
    title: tool.name,
    description: compactText(tool.description, verbosity),
    serverName: tool.serverName,
    usageHint: `Use \`callTool("${tool.serverId}", "${tool.name}", args)\` or call the namespaced helper directly in CodeMode.`,
  };
}

function toNormalizedToolSchema(
  tool: {
    name: string;
    description?: string;
    inputSchema?: unknown;
    outputSchema?: unknown;
    annotations?: unknown;
    serverId: string;
    serverName: string;
  },
  verbosity: ResponseVerbosity = "compact"
) {
  return {
    serverId: tool.serverId,
    serverName: tool.serverName,
    toolName: tool.name,
    title: tool.name,
    description: compactText(tool.description, verbosity),
    inputSchema: asRecord(compactSchema(tool.inputSchema, verbosity)),
    outputSchema: asRecord(compactSchema(tool.outputSchema, verbosity)),
    resultExtractionHint: MCP_RESULT_EXTRACTION_HINT,
  };
}

async function withMcpManager<T>(
  userId: string,
  fn: (manager: McpManager) => Promise<T>
): Promise<T> {
  const manager = await getMcpManager(userId);
  return await fn(manager);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeCodeModeScript(script: string): string {
  const trimmed = script.trim();
  if (/[\r\n]/.test(trimmed) || !/(?:\\r\\n|\\n)/.test(trimmed)) {
    return trimmed;
  }

  return trimmed.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
}

async function withToolRouter<T>(
  userId: string,
  fn: (router: ToolRouter, manager: McpManager) => Promise<T> | T
): Promise<T> {
  return withMcpManager(userId, async (manager) => {
    const router = new ToolRouter(manager, {
      strategy: "search",
      excludeTools: [
        "list_mcp_servers",
        "search_mcp_tools",
        "get_mcp_tool_schema",
        "call_mcp_tool",
        "codemode_run",
        "index_mcp_server",
        "delete_mcp_server",
        "find_mcp_servers",
      ],
    });
    return await fn(router, manager);
  });
}

type AsyncSchemaToolRouter = ToolRouter & {
  resolveToolSchema: (
    toolName: string,
    namespace?: string,
    options?: Record<string, unknown>
  ) => Promise<
    | {
        name: string;
        description?: string;
        inputSchema?: unknown;
        outputSchema?: unknown;
        annotations?: unknown;
        serverId: string;
        serverName: string;
        sessionId: string;
      }
    | undefined
  >;
};

export function registerMcpCoreTools(server: McpServer): void {
  server.registerTool(
    "list_mcp_servers",
    {
      title: "List MCP Servers",
      description:
        "List all connected MCP servers and the number of tools each provides. " +
        "Use this when `search_mcp_tools` returns no response or irrelevant results, to see if there is an active/connected server that might be relevant.",
      inputSchema: z.object({}),
      annotations: {
        title: "List MCP Servers",
        readOnlyHint: true,
        openWorldHint: false,
      },
      _meta: {
        tags: ["read"],
      },
    },
    async () => {
      try {
        const userId = getRequestContext().userId!;
        const connected = await withToolRouter(userId, async (router) => {
          const results = await router.listServers({});
          return results.map(({ serverName, serverId, toolCount }) => ({
            serverName,
            serverId,
            toolCount,
          }));
        });
        const localServers = await listLocalServers();
        return jsonResponse({ servers: [...connected, ...localServers] });
      } catch (err) {
        const text = err instanceof Error ? err.message : "Failed to list MCP servers";
        return { content: [{ type: "text" as const, text }], isError: true };
      }
    }
  );

  server.registerTool(
    "search_mcp_tools",
    {
      title: "Search MCP Tools",
      description:
        "Search connected MCP tools for the authenticated user and return normalized discovery results. " +
        "Use this to find candidate MCP tools before execution. Next, pass the chosen result to `get_mcp_tool_schema` to inspect the exact schema, then call the tool from `codemode_run` or a saved workflow script.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "Natural-language or exact-name query used to find relevant connected MCP tools."
          ),
        limit: z
          .number()
          .optional()
          .describe(
            `Optional maximum number of results to return. Defaults to ${DEFAULT_MCP_TOOL_SEARCH_LIMIT}.`
          ),
        verbosity: z
          .enum(["compact", "full"])
          .optional()
          .describe(
            "Controls description size. Defaults to compact; use full only when exact downstream documentation is needed."
          ),
      }),
      annotations: {
        title: "Search MCP Tools",
        readOnlyHint: true,
        openWorldHint: false,
      },
      _meta: {
        tags: ["read"],
      },
    },
    async ({ query, limit, verbosity }) => {
      try {
        const userId = getRequestContext().userId!;
        const limitN = limit ?? DEFAULT_MCP_TOOL_SEARCH_LIMIT;
        const verbosityN = verbosity ?? "compact";
        const [connectedTools, localTools] = await Promise.all([
          withToolRouter(userId, async (router) => {
            const res = await router.listTools({ limit: Number.MAX_SAFE_INTEGER });
            return res.tools as IndexedTool[];
          }),
          listLocalTools().then((tools) =>
            tools.map(
              (t) =>
                ({
                  name: t.name,
                  description: t.description,
                  inputSchema: t.inputSchema,
                  outputSchema: t.outputSchema,
                  serverId: t.serverId,
                  serverName: t.serverName,
                  sessionId: t.sessionId,
                }) as IndexedTool
            )
          ),
        ]);
        const index = new ToolIndex();
        await index.buildIndex([...connectedTools, ...localTools]);
        const hits = await index.search(query, limitN);
        const tools = hits.map((tool) => toSearchResultTool(tool, verbosityN));
        return jsonResponse({ tools, total: tools.length });
      } catch (err) {
        const text = err instanceof Error ? err.message : "Failed to search MCP tools";
        return { content: [{ type: "text" as const, text }], isError: true };
      }
    }
  );

  server.registerTool(
    "get_mcp_tool_schema",
    {
      title: "Get MCP Tool Schema",
      description:
        "Retrieve a normalized schema payload for a connected MCP tool. " +
        "Use this to inspect the exact input schema, output schema when available, and the CodeMode result extraction hint. Then call that MCP tool from `codemode_run` or a saved workflow script once the args match the schema.",
      inputSchema: z.object({
        server_id: z.string().describe("The MCP server ID returned by `search_mcp_tools`."),
        tool_name: z.string().describe("The exact tool name returned by `search_mcp_tools`."),
        verbosity: z
          .enum(["compact", "full"])
          .optional()
          .describe("Controls description size in returned schemas. Defaults to compact."),
      }),
      annotations: {
        title: "Get MCP Tool Schema",
        readOnlyHint: true,
        openWorldHint: false,
      },
      _meta: {
        tags: ["read"],
      },
    },
    async ({ server_id, tool_name, verbosity }) => {
      try {
        const userId = getRequestContext().userId!;
        const startedAt = new Date();
        const normalized = await withToolRouter(userId, async (router, manager) => {
          const schemaRouter = router as AsyncSchemaToolRouter;
          const tool =
            (await schemaRouter.resolveToolSchema(tool_name, server_id)) ??
            (await schemaRouter.resolveToolSchema(tool_name));
          if (!tool) {
            throw new Error(`Tool "${tool_name}" was not found for server "${server_id}"`);
          }
          const client = manager.getClients().find((c) => c.getSessionId?.() === tool.sessionId);
          recordSelectedDownstreamToolSchemaInspection({
            serverId: tool.serverId,
            serverName: tool.serverName,
            serverUrl: client?.getServerUrl?.(),
            toolName: tool.name,
            startedAt,
            durationMs: Date.now() - startedAt.getTime(),
          });
          return toNormalizedToolSchema(tool, verbosity ?? "compact");
        }).catch(async () => {
          const localTool = await resolveLocalToolSchema(tool_name, server_id);
          if (!localTool) {
            throw new Error(`Tool "${tool_name}" was not found for server "${server_id}"`);
          }
          return toNormalizedToolSchema(
            {
              name: localTool.name,
              description: localTool.description,
              inputSchema: localTool.inputSchema,
              outputSchema: localTool.outputSchema,
              annotations: localTool.annotations,
              serverId: localTool.serverId,
              serverName: localTool.serverName,
            },
            verbosity ?? "compact"
          );
        });

        return jsonResponse({ tool: normalized });
      } catch (err) {
        const text = err instanceof Error ? err.message : "Failed to load MCP tool schema";
        return { content: [{ type: "text" as const, text }], isError: true };
      }
    }
  );

  server.registerTool(
    "call_mcp_tool",
    {
      title: "Call MCP Tool",
      description: "Call an exact tool on a connected local or remote MCP server.",
      inputSchema: z.object({
        server_id: z.string().describe("The exact server ID returned by MCP discovery."),
        tool_name: z.string().describe("The exact MCP tool name."),
        arguments: z.record(z.string(), z.unknown()).optional(),
      }),
      annotations: {
        title: "Call MCP Tool",
        readOnlyHint: false,
        openWorldHint: true,
      },
      _meta: { tags: ["execute"] },
    },
    async ({ server_id, tool_name, arguments: toolArguments }) => {
      try {
        const userId = getRequestContext().userId!;
        const remoteResult = await withMcpManager(userId, async (manager) => {
          const client = manager
            .getClients()
            .find((candidate) =>
              [candidate.getServerId?.(), candidate.getServerName?.()].includes(server_id),
            );
          return client
            ? { found: true as const, result: await client.callTool(tool_name, toolArguments ?? {}) }
            : { found: false as const };
        });
        if (remoteResult.found) return remoteResult.result as never;
        return (await invokeLocalTool({
          serverId: server_id,
          toolName: tool_name,
          arguments: toolArguments ?? {},
        })) as never;
      } catch (error) {
        return errorResponse(error instanceof Error ? error.message : "MCP tool call failed");
      }
    },
  );

  server.registerTool(
    "codemode_run",
    {
      title: "Run CodeMode Script",
      description:
        "Execute a JavaScript/TypeScript-like script in the CodeMode sandbox " +
        "with connected MCP tool servers. No queue, workflow, or schedule required. " +
        "Use this when `search_mcp_tools` or `get_mcp_tool_schema` identified an MCP tool, or when any equivalent MCP tool-discovery and schema-inspection tools identified one, and you want to inspect its output or validate its schema usage quickly without creating a saved workflow. " +
        "This is also the right tool for chaining multiple MCP tool calls in one script, avoiding repeated agent loops and context reduction, handling batch processing, or transforming, filtering, or summarizing large tool call results before returning them. " +
        "Recommended flow: First search for the right MCP tool with `search_mcp_tools`. Then inspect that tool's schema with `get_mcp_tool_schema`, or use any equivalent search/schema tools provided by the current MCP client. Finally execute the real MCP call from this script once the args match the schema. " +
        "When using `callTool(serverId, toolName, args)` or namespaced helpers, the sandbox returns the normalized tool result directly. Use raw helpers only when you explicitly need the MCP envelope. " +
        "\n" +
        "## Prerequisites\n" +
        "- Use `search_mcp_tools` then `get_mcp_tool_schema` to discover valid tool names, server IDs, and argument schemas.\n" +
        "- NEVER guess tool names or argument shapes — inspect schemas first.\n" +
        "- NEVER hardcode data values — load everything from tool responses.\n" +
        "- ALWAYS check `.ok` before using a tool result.\n" +
        "\n" +
        "## Plan & Batch\n" +
        "Before writing the script, categorize your calls:\n" +
        "- **Independent** (no dependency) → batch with `Promise.all` in one script.\n" +
        "- **Dependent** (B needs A's result) → chain sequentially in one script.\n" +
        "- **Exploratory** (next step depends on inspection) → separate call.\n" +
        "Prefer one script per task. Each `codemode_run` call spins up a new sandbox.\n" +
        "\n" +
        "## Patterns\n" +
        "✅ Namespaced: const r = await s1.toolName(args);\n" +
        "✅ Raw callTool: const r = await callTool(\"s1\", \"toolName\", args);\n" +
        "✅ Batch: const [a, b] = await Promise.all([s1.fn1(), s2.fn2()]);\n" +
        "✅ Chain: const u = await s1.get_user(e); await s2.send_msg(u.id);\n" +
        "✅ Bulk: iterate in batches of 5: await Promise.all(batch.map(s1.fn));\n" +
        "✅ Exploratory: first call searches, inspect, second call acts.\n" +
        "❌ Multiple `codemode_run` calls for steps that fit in one script.\n" +
        "\n" +
        "## Defensive Parsing\n" +
        "Always check `.ok` before using a result, and unwrap safely:\n" +
        "  const res = await s1.search_issues({ q });\n" +
        "  if (!res.ok) return { error: `Failed: ${res.error}` };\n" +
        "  const items = res.items ?? [];\n" +
        "\n" +
        "## Response\n" +
        "Returns `{ success, value, error, toolCalls, durationMs }`. " +
        "Each `toolCall` has `{ serverId, toolName, ok, error? }`. " +
        "Process small results inline. For large data, summarize/filter before returning.\n" +
        "\n" +
        "## Timeout\n" +
        "Default: 240s (4 min). For long multi-step workflows, save progress by returning intermediate state between calls.",
      inputSchema: z.object({
        script: z.string().describe("Code to execute inside CodeMode runtime."),
        input: z
          .record(z.string(), z.any())
          .optional()
          .describe("Optional object exposed as `input` in the sandbox."),
        timeout_ms: z
          .number()
          .optional()
          .describe("Optional execution timeout in milliseconds."),
        return_mode: z
          .enum(["final", "debug"])
          .optional()
          .describe(
            "Defaults to final. Use debug to also include logs."
          ),
      }),
      annotations: {
        title: "Run CodeMode Script",
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
      _meta: {
        tags: ["execute"],
      },
    },
    async ({ script, input, timeout_ms, return_mode }) => {
      const normalizedScript = normalizeCodeModeScript(script);
      if (!normalizedScript) {
        return errorResponse("script is required");
      }

      try {
        const userId = getRequestContext().userId!;
        const manager = await getMcpManager(userId);

        const timeoutMs = Number(timeout_ms ?? process.env.MCP_SCRIPT_TIMEOUT_MS ?? 240000);
        const requestContext = getRequestContext();
        const localServers = await buildLocalToolServers();
        const runtime = await createWorkflowCodeModeRuntime(
          manager,
          {
            timeoutMs,
            memoryLimitMb: 128,
            maxToolCalls: 50,
            maxConcurrentToolCalls: 5,
          },
          {
            userId: userId,
            requestId: requestContext.requestId,
            mcpSessionId: requestContext.mcpSessionId,
          },
          {
            loader: requestContext.env?.LOADER,
          },
          localServers
        );

        const result = await runtime.run(normalizedScript, asJsonObject(input), { timeoutMs });

        const toolCalls = (result.toolCalls ?? []) as Array<Record<string, unknown>>;
        const payload: Record<string, any> = {
          success: !result.error,
          value: result.value ?? null,
          error: result.error ?? null,
          durationMs: result.durationMs,
          toolCalls: toolCalls.map((tc) => ({
            serverId: tc.serverId,
            toolName: tc.toolName,
            ok: tc.ok,
            ...(tc.durationMs !== undefined ? { durationMs: tc.durationMs } : {}),
            ...(tc.error ? { error: tc.error } : {}),
          })),
          toolCallCount: toolCalls.length,
        };

        if (return_mode === "debug") {
          payload.logs = result.logs;
        }

        payload.logCount = (result.logs ?? []).length;

        const response = jsonResponse(payload);
        if (result.error) {
          response.isError = true;
        }
        return response;
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : "CodeMode execution failed");
      }
    }
  );

  server.registerTool(
    "index_mcp_server",
    {
      title: "Index/Update MCP Server",
      description:
        "Index a new MCP server or update an existing one in the global MCP directory. " +
        "Before calling this tool, the AI assistant must research the MCP server's name and URL, determine what it does, and generate relevant keywords/tags to categorize it. " +
        "If a server with the same name already exists, it will be overwritten with the new URL, description, and keywords.",
      inputSchema: z.object({
        name: z
          .string()
          .describe("The user-friendly name of the MCP server (e.g. 'Supabase' or 'Playwright')."),
        url: z
          .string()
          .url()
          .describe("The official connection URL or repository link of the MCP server."),
        description: z
          .string()
          .describe(
            "A detailed, structured description of the server's features and use cases, gathered from research."
          ),
        keywords: z
          .array(z.string())
          .describe(
            "Search keywords and categorization tags for vector matching (e.g. ['database', 'postgres', 'sql'])."
          ),
      }),
      annotations: {
        title: "Index MCP Server",
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
      _meta: {
        tags: ["admin"],
      },
    },
    async ({ name, url, description, keywords }) => {
      try {
        const client = await getDirectoryClient();
        const customId = deriveCustomId(name);

        // Delete existing document if present to support update/overwrite
        await client.documents.delete(customId).catch(() => {});

        const content = [
          `## ${name}`,
          `- **URL:** <${url}>`,
          "",
          "**Description:**",
          description,
          "",
          `**Search Keywords:** ${keywords.join(", ")}`,
        ].join("\n");

        await client.add({
          content,
          containerTag: "mcp-directory",
          customId,
          metadata: {
            source: "admin_mcp_indexer",
            server_name: name,
            url,
            keywords,
          },
        });

        return jsonResponse({
          success: true,
          message: `Successfully indexed server "${name}" into the global MCP directory.`,
        });
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : "Failed to index MCP server");
      }
    }
  );

  server.registerTool(
    "delete_mcp_server",
    {
      title: "Delete MCP Server",
      description: "Delete an indexed MCP server from the global MCP directory using its name.",
      inputSchema: z.object({
        name: z.string().describe("The exact name of the MCP server to delete (e.g. 'Supabase')."),
      }),
      annotations: {
        title: "Delete MCP Server",
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      },
      _meta: {
        tags: ["admin"],
      },
    },
    async ({ name }) => {
      try {
        const client = await getDirectoryClient();
        const customId = deriveCustomId(name);

        await client.documents.delete(customId);

        return jsonResponse({
          success: true,
          message: `Successfully deleted server "${name}" from the global MCP directory.`,
        });
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : "Failed to delete MCP server");
      }
    }
  );

  server.registerTool(
    "find_mcp_servers",
    {
      title: "Find MCP Servers",
      description:
        "Search the global MCP directory for appropriate MCP servers matching the query (e.g. databases, browser automation, etc.). " +
        "Use this when the user requests features or integrations that are not supported by the currently connected MCP tools, to discover which MCP servers could be added.",
      inputSchema: z.object({
        query: z
          .string()
          .describe("The search query or keyword (e.g. 'postgres' or 'web scraping')."),
      }),
      annotations: {
        title: "Find MCP Servers",
        readOnlyHint: true,
        openWorldHint: true,
      },
      _meta: {
        tags: ["admin"],
      },
    },
    async ({ query }) => {
      try {
        const client = await getDirectoryClient();
        const response = await client.search.documents({
          q: query,
          containerTags: ["mcp-directory"],
          includeFullDocs: true,
          documentThreshold: 0.6,
          rerank: true,
          rewriteQuery: true,
        });

        const servers = response.results.map((result) => ({
          title: result.title,
          score: result.score,
          content: result.content || result.chunks?.map((c) => c.content).join("\n") || "",
          metadata: result.metadata,
        }));

        return jsonResponse({ servers });
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : "Failed to search MCP servers");
      }
    }
  );
}

/**
 * Helper to retrieve and configure the Supermemory client.
 * Refers to the global MCP directory without exposing specific backend naming.
 */
async function getDirectoryClient() {
  const apiKey = process.env.SUPERMEMORY_API_KEY;
  if (!apiKey) {
    throw new Error("MCP directory service is not configured on the server.");
  }

  const { Supermemory } = await import("supermemory");
  return new Supermemory({ apiKey });
}

/**
 * Derives a sanitized custom slug identifier for an MCP server document.
 */
function deriveCustomId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-")
    .slice(0, 100);
}
