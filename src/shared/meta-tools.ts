/**
 * Meta-tools — Injectable tool definitions that let the LLM discover and
 * load MCP tools on-demand, following Anthropic's Tool Search pattern.
 *
 * Instead of injecting 50+ full tool schemas into the context window, you
 * inject just these 4 meta-tools. The LLM calls them to find and load
 * only the tools it actually needs.
 *
 * Meta-tools:
 *   • `mcp_search_tool_bm25`  — BM25 natural language search
 *   • `mcp_search_tool_regex` — Regex pattern search
 *   • `mcp_get_tool_schema`   — Get full inputSchema for a discovered tool
 *   • `mcp_execute_tool`      — Execute a discovered tool
 *
 * @packageDocumentation
 */

import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolRouter } from './tool-router.js';
import type { IndexedTool } from './tool-index.js';

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

/**
 * Creates the `mcp_search_tool_bm25` tool definition.
 *
 * This tool lets the LLM search the full catalog of available MCP tools
 * using a BM25 natural-language query. Returns tool names and descriptions
 * without the full inputSchema to save context space.
 */
export function createSearchToolDefinition(): Tool {
  return {
    name: 'mcp_search_tool_bm25',
    description:
      'Search the catalog of available tools. Returns tool names, descriptions, and server info. ' +
      'Use this FIRST to find relevant tools before calling them.\n\n' +
      'Query forms:\n' +
      '- "select:Read,Edit,Grep" — fetch these exact tools by name\n' +
      '- "notebook jupyter" — keyword search, up to limit best matches\n' +
      '- "+slack send" — require "slack" in the name, rank by remaining terms',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Query to find tools. Use "select:<tool_name>" for direct selection, or keywords to search. Prefix keywords with + to require them.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5, max: 20).',
        },
      },
      required: ['query'],
    },
  };
}

/**
 * Creates the `mcp_search_tool_regex` tool definition.
 * 
 * Matches Anthropic's tool_search_tool_regex exactly (takes a 'query' regex pattern).
 */
export function createRegexSearchToolDefinition(): Tool {
  return {
    name: 'mcp_search_tool_regex',
    description:
      'Search the catalog of available tools using a Python-style regex pattern. ' +
      'Matches against tool names, descriptions, and parameter descriptions. ' +
      'Example patterns: "^github_", "weather", "(?i)slack".',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Regex pattern to search for (e.g., "^get_.*_data", "database").',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5, max: 20).',
        },
      },
      required: ['query'],
    },
  };
}

/**
 * Creates the `mcp_get_tool_schema` tool definition.
 *
 * After discovering tools via `mcp_search_tool_bm25` or
 * `mcp_search_tool_regex`, the LLM calls this to load the full
 * inputSchema for a specific tool so it can construct the correct
 * arguments.
 */
export function createGetSchemaToolDefinition(): Tool {
  return {
    name: 'mcp_get_tool_schema',
    description:
      'Get the full input schema (parameters) for a specific tool. ' +
      'Call this after mcp_search_tool_bm25 to get the parameter details ' +
      'needed to call a tool correctly. ' +
      'Do NOT call the discovered tool directly; after reading the schema, call mcp_execute_tool.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        toolName: {
          type: 'string',
          description: 'The exact tool name returned by mcp_search_tool_bm25.',
        },
        serverId: {
          type: 'string',
          description:
            'Optional: The server ID provided in mcp_search_tool_bm25. Required if multiple tools have the same name.',
        },
      },
      required: ['toolName'],
    },
  };
}

/**
 * Creates the `mcp_execute_tool` tool definition.
 *
 * This is the execution meta-tool — the LLM calls this to execute any
 * tool discovered via `mcp_search_tool_bm25` or `mcp_search_tool_regex`.
 * The LLM should first call `mcp_get_tool_schema` to know the correct
 * arguments.
 *
 * Instead of registering every real tool with the framework, we proxy
 * all execution through a single meta-tool.
 */
export function createExecuteToolDefinition(): Tool {
  return {
    name: 'mcp_execute_tool',
    description:
      'Execute a tool that was discovered via mcp_search_tool_bm25. ' +
      'You MUST call mcp_get_tool_schema first to know the correct parameters. ' +
      'Pass the exact tool name and its arguments.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        toolName: {
          type: 'string',
          description: 'The exact tool name from mcp_search_tool_bm25 results.',
        },
        serverId: {
          type: 'string',
          description:
            'Optional: The server ID provided in mcp_search_tool_bm25. Required if multiple tools have the same name.',
        },
        args: {
          type: 'object',
          description:
            "Arguments matching the tool's inputSchema. Omit or pass {} if the tool takes no parameters.",
          additionalProperties: true,
        },
      },
      required: ['toolName'],
    },
  };
}

// ---------------------------------------------------------------------------
// Meta-tool Executors
// ---------------------------------------------------------------------------

/**
 * Callback for executing a real MCP tool via the correct client.
 * Provided by adapters that wire up client routing.
 */
export type CallToolFn = (
  toolName: string,
  args: Record<string, unknown>,
  namespace?: string
) => Promise<any>;

/**
 * Execute a meta-tool call and return the result in MCP CallToolResult format.
 *
 * @param toolName - One of the meta-tool names (mcp_search_tool_bm25, mcp_search_tool_regex, etc.)
 * @param args - The arguments from the LLM's tool call
 * @param router - The ToolRouter to query
 * @param callToolFn - Optional callback for executing real tools (required for mcp_execute_tool)
 * @returns MCP-compatible CallToolResult, or null if this isn't a meta-tool
 */
export async function executeMetaTool(
  toolName: string,
  args: Record<string, unknown>,
  router: ToolRouter,
  callToolFn?: CallToolFn
): Promise<CallToolResult | null> {
  const resolveToolSchema = (name: string, namespace?: string): { tool?: IndexedTool; error?: CallToolResult } => {
    try {
      return { tool: router.getToolSchema(name, namespace) };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        error: {
          content: [{ type: 'text', text: errorMessage }],
          isError: true,
        },
      };
    }
  };

  switch (toolName) {
    case 'mcp_search_tool_bm25': {
      const query = String(args.query ?? '');
      const limit = Math.min(Number(args.limit) || 5, 20);

      // Fast path: Check for select: prefix
      const selectMatch = query.match(/^select:(.+)$/i);
      if (selectMatch) {
        const requested = selectMatch[1]!
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

        const found: any[] = [];
        const errors: string[] = [];
        
        for (const requestedToolName of requested) {
          const { tool, error } = resolveToolSchema(requestedToolName);
          if (error) {
            const errorMsg = error.content[0]?.type === 'text' ? error.content[0].text : 'Unknown error';
            errors.push(`- **${requestedToolName}**: ${errorMsg}`);
          } else if (tool) {
            found.push(tool);
          } else {
            errors.push(`- **${requestedToolName}**: Tool not found. Try searching with mcp_search_tool_bm25.`);
          }
        }

        const lines: string[] = [];

        if (found.length > 0) {
          lines.push(...found.map((t, i) =>
            `${i + 1}. **${t.name}** (server: ${t.serverName}, serverId: ${t.serverId})\n   ${t.description}`
          ));
        }
        
        if (errors.length > 0) {
          if (lines.length > 0) lines.push(""); // Add empty line spacing
          lines.push("Errors resolving some tools:");
          lines.push(...errors);
        }

        const text = lines.length > 0 
          ? lines.join('\n') 
          : `No tools found matching select query: ${requested.join(', ')}`;

        return {
          content: [{ type: 'text', text }],
          isError: found.length === 0,
        };
      }

      const results = await router.searchTools(query, limit);

      const text = results.length === 0
        ? 'No tools found matching your query. Try different keywords.'
        : results
            .map(
              (t, i) =>
                `${i + 1}. **${t.name}** (server: ${t.serverName}, serverId: ${t.serverId})\n` +
                `   ${t.description}\n` +
                `   Estimated tokens: ${t.estimatedTokens}`
            )
            .join('\n');

      return {
        content: [{ type: 'text', text }],
        isError: false,
      };
    }

    case 'mcp_search_tool_regex': {
      const pattern = String(args.query ?? '');
      const limit = Math.min(Number(args.limit) || 5, 20);

      const results = await router.searchToolsRegex(pattern, limit);

      const text = results.length === 0
        ? 'No tools matched your regex pattern. Try a broader pattern.'
        : results
            .map(
              (t, i) =>
                `${i + 1}. **${t.name}** (server: ${t.serverName}, serverId: ${t.serverId})\n` +
                `   ${t.description}\n` +
                `   Estimated tokens: ${t.estimatedTokens}`
            )
            .join('\n');

      return {
        content: [{ type: 'text', text }],
        isError: false,
      };
    }

    case 'mcp_get_tool_schema': {
      const name = String(args.toolName ?? '');
      const namespace = String(args.serverId ?? '') || undefined;
      const { tool, error } = resolveToolSchema(name, namespace);

      if (error) {
        return error;
      }

      if (!tool) {
        return {
          content: [
            {
              type: 'text',
              text: `Tool "${name}" not found. Use mcp_search_tool_bm25 to find available tools first.`,
            },
          ],
          isError: true,
        };
      }

      const schema = {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        executionInstructions: {
          nextTool: 'mcp_execute_tool',
          toolName: tool.name,
          serverId: tool.serverId,
          note:
            'Do not call this discovered tool directly unless it was explicitly registered as a runtime tool. Execute it via mcp_execute_tool and pass these parameters inside args.',
        },
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(schema, null, 2) }],
        isError: false,
      };
    }

    case 'mcp_execute_tool': {
      const targetToolName = String(args.toolName ?? '');
      const namespace = String(args.serverId ?? '') || undefined;
      const toolArgs = (args.args as Record<string, unknown>) ?? {};

      if (!targetToolName) {
        return {
          content: [{ type: 'text', text: 'Missing required parameter "toolName". Specify which tool to execute.' }],
          isError: true,
        };
      }

      // Verify the tool exists in our index
      const { tool, error } = resolveToolSchema(targetToolName, namespace);
      if (error) {
        return error;
      }

      if (!tool) {
        return {
          content: [
            {
              type: 'text',
              text: `Tool "${targetToolName}" not found. Use mcp_search_tool_bm25 to discover available tools first.`,
            },
          ],
          isError: true,
        };
      }

      if (!callToolFn) {
        return {
          content: [{ type: 'text', text: 'Tool execution is not available. No callToolFn was configured.' }],
          isError: true,
        };
      }

      try {
        const result = await callToolFn(targetToolName, toolArgs, namespace);

        // Normalize result to text
        if (result && typeof result === 'object' && 'content' in result) {
          // Already MCP CallToolResult format
          return result as CallToolResult;
        }

        const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        return {
          content: [{ type: 'text', text }],
          isError: false,
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text', text: `Tool execution failed: ${errorMessage}` }],
          isError: true,
        };
      }
    }

    default:
      return null;
  }
}

/** Check if a tool name is one of the meta-tools. */
export function isMetaTool(toolName: string): boolean {
  return (
    toolName === 'mcp_search_tool_bm25' ||
    toolName === 'mcp_search_tool_regex' ||
    toolName === 'mcp_get_tool_schema' ||
    toolName === 'mcp_execute_tool'
  );
}

/**
 * Unwraps a meta-tool proxy call (like mcp_execute_tool) to find the real target tool name and arguments.
 * Also automatically strips routing prefixes like tool_{serverId}_.
 * 
 * Useful for frontend components that need to determine the actual tool being executed by an AI agent.
 */
export function resolveMetaToolProxy(
  toolName: string,
  args: Record<string, unknown> | null | undefined
): { toolName: string; args: Record<string, unknown> } {
  // Unwrap mcp_execute_tool proxy arguments
  if (toolName === 'mcp_execute_tool') {
    const innerName = args?.toolName;
    const innerArgs = args?.args;
    return {
      toolName: typeof innerName === 'string' && innerName ? innerName : toolName,
      args: innerArgs && typeof innerArgs === 'object' && !Array.isArray(innerArgs)
        ? (innerArgs as Record<string, unknown>)
        : {},
    };
  }

  // Strip tool_<serverId>_ prefix used by AIAdapter
  const match = toolName.match(/(?:tool_[^_]+_)?(.+)$/);
  const resolvedName = match?.[1] ?? toolName;

  return { toolName: resolvedName, args: args ?? {} };
}

