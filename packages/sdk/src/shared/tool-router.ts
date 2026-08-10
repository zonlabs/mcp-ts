/**
 * ToolRouter — Middleware layer for intelligent MCP tool selection.
 *
 * Sits between your AI framework adapter and MultiSessionClient to reduce
 * context window usage. Supports three strategies:
 *
 *  • `all`    — Pass through every tool (backward-compatible default)
 *  • `search` — Expose only meta-tools; LLM discovers tools on-demand
 *  • `groups` — Expose tools from active groups only
 *
 * Inspired by Anthropic's `defer_loading` + `tool_search_tool` pattern.
 *
 * @example
 * ```ts
 * import { ToolRouter } from '@mcp-ts/sdk/shared';
 * import { AIAdapter } from '@mcp-ts/sdk/adapters/ai';
 *
 * const router = new ToolRouter(multiSessionClient, {
 *   strategy: 'search',
 *   maxTools: 5,
 * });
 *
 * const tools = await AIAdapter.getTools(multiSessionClient, { toolRouter: router });
 * ```
 *
 * @packageDocumentation
 */
import type { Tool } from "@modelcontextprotocol/client";
import type { ToolClient, ToolClientProvider } from './types.js';
import {
  ToolIndex,
  type IndexedTool,
  type ToolLookupOptions,
  type ToolListResult,
  type ToolSearchOptions,
  type ToolServerSummary,
  type ToolSummary,
  type EmbedFn,
} from './tool-index.js';
import { SchemaCompressor, type CompactTool } from './schema-compressor.js';
import {
  createSearchToolDefinition,
  createListServersToolDefinition,
  createRegexSearchToolDefinition,
  createGetSchemaToolDefinition,
  createExecuteToolDefinition,
} from './meta-tools.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToolRouterStrategy = 'all' | 'search' | 'groups';

export interface ToolRouterOptions {
  /**
   * Strategy for tool selection.
   *
   *  • `all`    — Expose all tools (default, backward-compatible)
   *  • `search` — Expose only meta-tools; LLM discovers real tools via search
   *  • `groups` — Expose only tools from active groups
   *
   * @default 'all'
   */
  strategy?: ToolRouterStrategy;

  /**
   * Maximum tools to expose to the LLM at once.
   * Only applies to `groups` strategy and search results.
   * @default 40
   */
  maxTools?: number;

  /**
   * Tool groups configuration — map of group name to tool names.
   * When not provided, groups are auto-generated from server names.
   *
   * @example
   * ```ts
   * groups: {
   *   database: ['query_db', 'list_tables', 'describe_table'],
   *   github: ['create_pr', 'list_issues', 'search_code'],
   * }
   * ```
   */
  groups?: Record<string, string[]>;

  /**
   * Active groups (when `strategy='groups'`).
   * Only tools in these groups are exposed. Empty = all groups active.
   */
  activeGroups?: string[];

  /**
   * Whether to use compact schemas (name + description + parameterHint only, no inputSchema).
   * Reduces token usage but requires 2-turn flow: LLM picks tool → get schema → call.
   * @default false
   */
  compactSchemas?: boolean;

  /**
   * Tool names to expose directly when using `search` strategy.
   * Pinned tools are removed from discovery results and should be called directly.
   */
  pinnedTools?: string[];

  /**
   * Tool names to omit from direct exposure while keeping them indexed for
   * search/schema lookup/calls through meta-tools.
   */
  deferredTools?: string[];

  /**
   * Tool names or glob-style patterns to omit entirely from the router catalog.
   */
  excludeTools?: string[];

  /**
   * Optional embedding function for semantic search.
   * When not provided, keyword TF-IDF matching is used.
   */
  embedFn?: EmbedFn;

  /**
   * Weight of keyword score vs embedding score (0–1).
   * Only relevant when `embedFn` is provided.
   * @default 0.4
   */
  keywordWeight?: number;
}

/** Information about a tool group. */
export interface ToolGroupInfo {
  tools: string[];
  active: boolean;
}

// ---------------------------------------------------------------------------
// Client Input Types
// ---------------------------------------------------------------------------

/**
 * Accepted client input for ToolRouter.
 * Pass a `ToolClientProvider` (e.g. MultiSessionClient), or an array of `ToolClient` instances.
 */
export type ToolRouterClientInput = ToolClientProvider | ToolClient[];

// ---------------------------------------------------------------------------
// ToolRouter
// ---------------------------------------------------------------------------

export class ToolRouter {
  private index: ToolIndex;
  private allTools: IndexedTool[] = [];
  private pinnedTools: IndexedTool[] = [];
  private deferredTools: IndexedTool[] = [];
  private discoverableTools: IndexedTool[] = [];
  private groupsMap = new Map<string, ToolGroupInfo>();
  private strategy: ToolRouterStrategy;
  private maxTools: number;
  private compactSchemas: boolean;
  private activeGroups: Set<string>;
  private customGroups?: Record<string, string[]>;
  private pinnedToolNames: Set<string>;
  private deferredToolNames: Set<string>;
  private excludeToolMatchers: RegExp[];
  private initialized = false;

  constructor(
    private client: ToolRouterClientInput,
    private options: ToolRouterOptions = {}
  ) {
    this.strategy = options.strategy ?? 'all';
    this.maxTools = options.maxTools ?? 40;
    this.compactSchemas = options.compactSchemas ?? false;
    this.activeGroups = new Set(options.activeGroups ?? []);
    this.customGroups = options.groups;
    this.pinnedToolNames = new Set(options.pinnedTools ?? []);
    this.deferredToolNames = new Set(options.deferredTools ?? []);
    this.excludeToolMatchers = (options.excludeTools ?? []).map((pattern) =>
      globToRegExp(pattern)
    );

    this.index = new ToolIndex({
      embedFn: options.embedFn,
      keywordWeight: options.keywordWeight,
    });
  }

  // -----------------------------------------------------------------------
  // Core Public API
  // -----------------------------------------------------------------------

  /**
   * Get tools filtered by the current strategy.
   * This is the main method adapters should call.
   *
   * - `all`    → returns all tools (unchanged behavior)
   * - `search` → returns only meta-tools (mcp_search_tools, mcp_get_tool_schema, mcp_execute_tool)
   * - `groups` → returns tools from active groups only
   */
  async getFilteredTools(): Promise<Tool[]> {
    await this.ensureInitialized();

    switch (this.strategy) {
      case 'search':
        return [...this.getMetaToolDefinitions(), ...this.pinnedTools];

      case 'groups':
        return this.getGroupFilteredTools();

      case 'all':
      default:
        const directlyVisibleTools = this.getDirectlyVisibleTools();
        if (this.compactSchemas) {
          // Return tools with inputSchema stripped
          return directlyVisibleTools.map((t) => {
            const compact = SchemaCompressor.toCompact(t);
            return {
              name: compact.name,
              description:
                (compact.description ?? '') +
                (compact.parameterHint ? ` Parameters: ${compact.parameterHint}` : ''),
              inputSchema: { type: 'object' as const, properties: {} },
            };
          });
        }
        return [...directlyVisibleTools];
    }
  }

  /**
   * Search tools by natural-language query.
   * Works regardless of strategy.
   */
  async searchTools(
    query: string,
    topK?: number,
    options: ToolSearchOptions = {}
  ): Promise<ToolSummary[]> {
    await this.ensureInitialized();
    const limit = topK ?? this.maxTools;
    return this.index.search(query, limit, options);
  }

  /**
   * Search tools by regex pattern.
   * Matches against name, description, and parameter metadata.
   */
  async searchToolsRegex(pattern: string, topK?: number): Promise<ToolSummary[]> {
    await this.ensureInitialized();
    return this.index.searchRegex(pattern, topK ?? this.maxTools);
  }

  /** List connected MCP servers with indexed tool counts. */
  async listServers(options: ToolSearchOptions = {}): Promise<ToolServerSummary[]> {
    await this.ensureInitialized();
    return this.index.listServers(options);
  }

  /** List tools deterministically, optionally scoped to a server. */
  async listTools(options: ToolSearchOptions & { limit?: number; cursor?: string } = {}): Promise<ToolListResult> {
    await this.ensureInitialized();
    return this.index.listTools(options);
  }

  /**
   * Get the full tool definition by name.
   * If tool name is ambiguous, use namespace to specify the server.
   */
  getToolSchema(
    toolName: string,
    namespace?: string,
    options: ToolLookupOptions = {}
  ): IndexedTool | undefined {
    const matches = this.getIndexedToolMatches(toolName, namespace, options);

    if (matches.length === 0) return undefined;

    if (matches.length > 1) {
      const servers = matches.map((m) => m.serverId).join(', ');
      throw new Error(
        `Tool "${toolName}" is provided by multiple servers: [${servers}]. ` +
          `Please specify the desired "serverId" as a namespace.`
      );
    }

    return matches[0];
  }

  /**
   * Resolve the full tool definition by name, ensuring the router index has
   * been initialized first.
   */
  async resolveToolSchema(
    toolName: string,
    namespace?: string,
    options: ToolLookupOptions = {}
  ): Promise<IndexedTool | undefined> {
    await this.ensureInitialized();
    return this.getToolSchema(toolName, namespace, options);
  }

  /**
   * Get compact (schema-less) summaries for all tools.
   */
  getCompactTools(): CompactTool[] {
    return SchemaCompressor.compactAll(this.allTools);
  }

  // -----------------------------------------------------------------------
  // Group Management
  // -----------------------------------------------------------------------

  /** Get all available groups with their tool lists and active status. */
  getGroups(): Map<string, ToolGroupInfo> {
    return new Map(this.groupsMap);
  }

  /** Activate specific groups. Pass empty array to activate all. */
  setActiveGroups(groups: string[]): void {
    this.activeGroups = new Set(groups);
    // Update groupsMap active flags
    for (const [name, info] of this.groupsMap) {
      info.active = this.activeGroups.size === 0 || this.activeGroups.has(name);
    }
  }

  /** Get the names of currently active groups. */
  getActiveGroups(): string[] {
    return [...this.activeGroups];
  }

  /** Number of total indexed tools. */
  get totalToolCount(): number {
    return this.allTools.length;
  }

  /** Change strategy at runtime. */
  setStrategy(strategy: ToolRouterStrategy): void {
    this.strategy = strategy;
  }

  /**
   * Force a re-index of tools from all connected clients.
   * Call this after adding/removing MCP server connections.
   */
  async refresh(): Promise<void> {
    this.initialized = false;
    await this.ensureInitialized();
  }

  /**
   * Execute a tool by routing to the correct MCP client.
   * Used by the `mcp_execute_tool` meta-tool to proxy tool calls.
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    namespace?: string
  ): Promise<any> {
    await this.ensureInitialized();

    const indexedTool = this.getToolSchema(toolName, namespace);
    if (!indexedTool) {
      throw new Error(
        `Tool "${toolName}" not found${
          namespace ? ` on server "${namespace}"` : ''
        }. Use mcp_search_tools or mcp_search_tool_regex to discover available tools.`
      );
    }

    const clients = this.getClients();
    const targetClient =
      clients.find(
        (c) =>
          typeof c.getSessionId === 'function' &&
          c.getSessionId() === indexedTool.sessionId
      ) ?? clients.find((c) => c.isConnected());

    if (!targetClient) {
      throw new Error(`No connected client found for tool "${toolName}"`);
    }

    return await targetClient.callTool(toolName, args);
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /** Lazy initialization — fetches tools from all connected clients. */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    const fetchedTools = await this.fetchAllTools();
    this.allTools = fetchedTools.filter((tool) => !this.matchesExcludedTool(tool.name));
    this.pinnedTools = this.allTools.filter((tool) => this.matchesPinnedTool(tool.name));
    this.deferredTools = this.allTools.filter(
      (tool) => !this.matchesPinnedTool(tool.name) && this.matchesDeferredTool(tool)
    );
    this.discoverableTools = this.allTools.filter((tool) => !this.matchesPinnedTool(tool.name));
    await this.index.buildIndex(this.discoverableTools);
    this.buildGroups();
    this.initialized = true;
  }

  /** Fetch tools from all connected MCP clients. */
  private async fetchAllTools(): Promise<IndexedTool[]> {
    const clients = this.getClients();
    const result: IndexedTool[] = [];

    for (const client of clients) {
      if (!client.isConnected()) continue;

      try {
        const { tools } = await client.listTools();
        const serverId =
          typeof client.getServerId === 'function' ? client.getServerId() ?? 'unknown' : 'unknown';
        const serverName =
          (typeof client.getServerName === 'function' ? client.getServerName() : undefined) ??
          serverId;
        const sessionId =
          typeof client.getSessionId === 'function' ? client.getSessionId() ?? 'unknown' : 'unknown';

        for (const tool of tools) {
          result.push({
            ...tool,
            serverId,
            serverName: serverName,
            sessionId,
          });
        }
      } catch (err) {
        console.warn('[ToolRouter] Failed to fetch tools from client:', err);
      }
    }

    return result;
  }

  /** Resolve the client input to a flat array of ToolClient instances. */
  private getClients(): ToolClient[] {
    if (Array.isArray(this.client)) {
      return this.client;
    }
    if (typeof (this.client as ToolClientProvider).getClients === 'function') {
      return (this.client as ToolClientProvider).getClients();
    }
    // Single client
    return [this.client as unknown as ToolClient];
  }

  /** Build group map from custom config or auto-detect from server names. */
  private buildGroups(): void {
    this.groupsMap.clear();

    if (this.customGroups) {
      // Explicit groups
      for (const [name, tools] of Object.entries(this.customGroups)) {
        this.groupsMap.set(name, {
          tools,
          active: this.activeGroups.size === 0 || this.activeGroups.has(name),
        });
      }
    } else {
      // Auto-group by server ID
      const serverTools = new Map<string, string[]>();
      for (const tool of this.allTools) {
        const group = tool.serverId;
        if (!serverTools.has(group)) {
          serverTools.set(group, []);
        }
        serverTools.get(group)!.push(tool.name);
      }

      for (const [serverId, tools] of serverTools) {
        this.groupsMap.set(serverId, {
          tools,
          active: this.activeGroups.size === 0 || this.activeGroups.has(serverId),
        });
      }
    }
  }

  /** Return only tools belonging to currently active groups. */
  private getGroupFilteredTools(): Tool[] {
    const activeToolNames = new Set<string>();
    for (const [, info] of this.groupsMap) {
      if (info.active) {
        for (const name of info.tools) {
          activeToolNames.add(name);
        }
      }
    }

    const filtered = this.getDirectlyVisibleTools().filter((t) => activeToolNames.has(t.name));

    if (this.compactSchemas) {
      return filtered.slice(0, this.maxTools).map((t) => {
        const compact = SchemaCompressor.toCompact(t);
        return {
          name: compact.name,
          description:
            (compact.description ?? '') +
            (compact.parameterHint ? ` Parameters: ${compact.parameterHint}` : ''),
          inputSchema: { type: 'object' as const, properties: {} },
        };
      });
    }

    return filtered.slice(0, this.maxTools);
  }

  /** The 4 meta-tool definitions exposed in `search` strategy. */
  private getMetaToolDefinitions(): Tool[] {
    return [
      createSearchToolDefinition(),
      createListServersToolDefinition(),
      createRegexSearchToolDefinition(),
      createGetSchemaToolDefinition(),
      createExecuteToolDefinition(),
    ];
  }

  private matchesPinnedTool(toolName: string): boolean {
    return this.pinnedToolNames.has(toolName);
  }

  private matchesDeferredTool(tool: Tool): boolean {
    if (this.deferredToolNames.has(tool.name)) {
      return true;
    }

    const meta = (tool as Tool & {
      _meta?: { toolRouter?: { deferred?: boolean } };
    })._meta;
    return meta?.toolRouter?.deferred === true;
  }

  private matchesExcludedTool(toolName: string): boolean {
    return this.excludeToolMatchers.some((matcher) => matcher.test(toolName));
  }

  private getDirectlyVisibleTools(): IndexedTool[] {
    return this.allTools.filter((tool) => !this.matchesDeferredTool(tool) || this.matchesPinnedTool(tool.name));
  }

  private getIndexedToolMatches(
    toolName: string,
    namespace?: string,
    options: ToolLookupOptions = {}
  ): IndexedTool[] {
    const indexedMatches = this.index.getTool(toolName, namespace, options);
    if (indexedMatches.length > 0 || !this.matchesPinnedTool(toolName)) {
      return indexedMatches;
    }

    return this.matchTools(this.pinnedTools.filter((tool) => tool.name === toolName), namespace, options);
  }

  private matchTools(
    tools: IndexedTool[],
    namespace?: string,
    options: ToolLookupOptions = {}
  ): IndexedTool[] {
    if (!namespace) return tools;

    const exactMatches = tools.filter(
      (tool) => tool.sessionId === namespace || tool.serverId === namespace
    );
    if (exactMatches.length > 0) return exactMatches;

    if (!options.allowServerNameFragment) return [];

    const namespaceLower = namespace.toLowerCase();
    return tools.filter((tool) => tool.serverName.toLowerCase().includes(namespaceLower));
  }
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const regexPattern = `^${escaped.replace(/\*/g, '.*')}$`;
  return new RegExp(regexPattern);
}
