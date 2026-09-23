import type { JSONSchema7 } from 'json-schema';
import type { ToolSet } from 'ai';
import { ToolRouter } from '../shared/tool-router.js';
import type { BaseClient, BaseClientProvider, ToolClient } from '../shared/types.js';
import { executeMetaTool, isMetaTool } from '../shared/meta-tools.js';

export interface AIAdapterOptions {
    /** 
     * Prefix for tool names to avoid collision with other tools.
     * Defaults to the client's serverId in prefixed mode.
     */
    prefix?: string;

    /**
     * Optional ToolRouter for discovery, BM25 indexing, meta-tools, and pinned tools.
     * When provided, exposes meta-tools (and pinned tools) for multi-turn search/execution,
     * or indexes tools for search while routing calls through the router.
     */
    toolRouter?: ToolRouter;

    /**
     * When true, tools are marked with `deferLoading: true` for AI SDK's
     * dynamic tool search mechanism (zero initial context tokens).
     * Uses clean, collision-safe tool names.
     * @default false
     */
    deferLoading?: boolean;

    /**
     * Optional custom callback to determine if a tool requires user approval.
     * Can return a boolean or a Promise<boolean>.
     * If not provided, defaults to checking the tool's `destructiveHint` annotation.
     */
    needsApproval?: (tool: any, args: any) => boolean | Promise<boolean>;
}

/**
 * Adapter to use MCP tools with the Vercel AI SDK.
 */
export class AIAdapter {
    private jsonSchema: typeof import('ai').jsonSchema | undefined;

    constructor(
        private client: BaseClient | BaseClientProvider,
        private options: AIAdapterOptions = {}
    ) { }

    /**
     * Lazy-loads the jsonSchema function from the AI SDK.
     */
    private async ensureJsonSchema() {
        if (!this.jsonSchema) {
            const { jsonSchema } = await import('ai');
            this.jsonSchema = jsonSchema;
        }
    }

    /**
     * Fetches all MCP tools across client(s) with an execution handler.
     */
    private async fetchTools(): Promise<Array<{
        tool: any;
        serverId?: string;
        execute: (args: any) => Promise<any>;
    }>> {
        const isProvider = typeof (this.client as BaseClientProvider).getClients === 'function';
        if (isProvider) {
            const clients = (this.client as BaseClientProvider).getClients();
            const results = await Promise.all(
                clients.map(async (client) => {
                    const isConnected = typeof client.isConnected === 'function' ? client.isConnected() : false;
                    if (!isConnected) return [];

                    try {
                        const res = await client.listTools();
                        const serverId = client.getServerId?.();
                        return (res.tools ?? []).map((tool) => ({
                            tool,
                            serverId,
                            execute: (args: any) => client.callTool(tool.name, args),
                        }));
                    } catch (error) {
                        const serverId = client.getServerId?.() ?? 'unknown';
                        console.error(`[AIAdapter] Failed to fetch tools from ${serverId}:`, error);
                        return [];
                    }
                })
            );
            return results.flat();
        }

        const isConnected = typeof (this.client as BaseClient).isConnected === 'function'
            ? (this.client as BaseClient).isConnected()
            : false;
        if (!isConnected) {
            return [];
        }

        try {
            const res = await (this.client as BaseClient).listTools();
            const serverId = (this.client as BaseClient).getServerId?.();
            return (res.tools ?? []).map((tool) => ({
                tool,
                serverId,
                execute: (args: any) => (this.client as BaseClient).callTool(tool.name, args),
            }));
        } catch (error) {
            console.error('[AIAdapter] Failed to list tools from client:', error);
            return [];
        }
    }

    /**
     * Transforms raw client tools into an AI SDK ToolSet.
     */
    private transformTools(
        tools: Array<{
            tool: any;
            serverId?: string;
            execute: (args: any) => Promise<any>;
        }>
    ): ToolSet {
        const isDefer = Boolean(this.options.deferLoading ?? false);

        // @ts-ignore: ToolSet type inference can be tricky with dynamic imports
        return Object.fromEntries(
            tools.map(({ tool, serverId, execute }) => {
                let toolKey: string;
                if (isDefer) {
                    const safeName = tool.name.replace(/[^a-zA-Z0-9_-]/g, '_');
                    toolKey = this.options.prefix ? `tool_${this.options.prefix}_${safeName}` : safeName;
                } else {
                    const prefix = this.options.prefix ?? serverId?.replace(/-/g, '').substring(0, 8) ?? 'mcp';
                    toolKey = `tool_${prefix}_${tool.name}`;
                }

                return [
                    toolKey,
                    {
                        description: tool.description || (isDefer ? `MCP Tool: ${tool.name}` : undefined),
                        inputSchema: this.jsonSchema!((tool.inputSchema as JSONSchema7) ?? { type: 'object' }),
                        ...(isDefer ? { deferLoading: true } : {}),
                        execute: async (args: any) => {
                            try {
                                return await execute(args ?? {});
                            } catch (error) {
                                const errorMessage = error instanceof Error ? error.message : String(error);
                                throw new Error(`Tool execution failed: ${errorMessage}`);
                            }
                        },
                        needsApproval: this.options.needsApproval
                            ? (args: any) => this.options.needsApproval!(tool, args)
                            : (tool.annotations as any)?.destructiveHint === true
                                ? () => true
                                : undefined,
                    },
                ];
            })
        );
    }

    /**
     * Fetches tools from the client(s) and converts them to AI SDK tools.
     */
    async getTools(): Promise<ToolSet> {
        await this.ensureJsonSchema();

        // 1. Resolve base tools through ToolRouter if configured
        if (this.options.toolRouter) {
            return await this.getToolsViaRouter(this.options.toolRouter);
        }

        // 2. Fetch and transform tools directly from client(s)
        const tools = await this.fetchTools();
        return this.transformTools(tools);
    }

    /**
     * Build a ToolSet from a ToolRouter's filtered output.
     *
     *  • When deferLoading is true: all tools have `deferLoading: true` (unless pinned) and clean direct execution via router.
     *  • When deferLoading is false: direct tools are exposed directly.
     */
    private async getToolsViaRouter(router: ToolRouter): Promise<ToolSet> {
        const filteredTools = await router.getFilteredTools();
        const isDefer = Boolean(this.options.deferLoading ?? false);

        const nameCounts = new Map<string, number>();
        for (const tool of filteredTools) {
            nameCounts.set(tool.name, (nameCounts.get(tool.name) ?? 0) + 1);
        }

        // @ts-ignore: ToolSet type inference can be tricky with dynamic imports
        return Object.fromEntries(
            filteredTools.map((tool) => {
                const routedTool = tool as typeof tool & {
                    sessionId?: string;
                    serverId?: string;
                    serverName?: string;
                    deferLoading?: boolean;
                };
                const namespace = routedTool.serverId ?? routedTool.sessionId;
                const isDuplicate = (nameCounts.get(tool.name) ?? 0) > 1;

                let toolKey: string;
                if (isMetaTool(tool.name)) {
                    toolKey = tool.name;
                } else if (isDefer && !this.options.prefix && !isDuplicate) {
                    toolKey = tool.name.replace(/[^a-zA-Z0-9_-]/g, '_');
                } else {
                    toolKey = this.getRouterToolKey(tool.name, routedTool.sessionId, routedTool.serverId);
                }

                const isPinned = typeof (router as any).isPinned === 'function' ? (router as any).isPinned(tool.name) : false;
                const deferValue = isPinned ? false : (isDefer && !isMetaTool(tool.name));

                return [
                    toolKey,
                    {
                        description: tool.description,
                        inputSchema: this.jsonSchema!(tool.inputSchema as JSONSchema7),
                        ...(isDefer ? { deferLoading: deferValue } : {}),
                        execute: async (args: any) => {
                            if (isMetaTool(tool.name)) {
                                const result = await executeMetaTool(
                                    tool.name,
                                    args,
                                    router,
                                    (name, toolArgs, targetNamespace) => router.callTool(name, toolArgs, targetNamespace)
                                );
                                if (result) {
                                    return result;
                                }
                            }

                            return await router.callTool(tool.name, args, namespace);
                        },
                        needsApproval: this.options.needsApproval
                            ? (args: any) => this.options.needsApproval!(tool, args)
                            : (args: any) => {
                                if (tool.name === 'mcp_execute_tool') {
                                    const targetToolName = String(args?.toolName ?? "");
                                    const targetNamespace = String(args?.serverId ?? "") || undefined;
                                    if (!targetToolName) return false;
                                    try {
                                        const targetTool = router.getToolSchema(targetToolName, targetNamespace);
                                        return (targetTool as any)?.annotations?.destructiveHint === true;
                                    } catch {
                                        return false;
                                    }
                                }
                                return (tool.annotations as any)?.destructiveHint === true;
                            }
                    },
                ];
            })
        );
    }

    private getRouterToolKey(toolName: string, sessionId?: string, serverId?: string): string {
        const namespace = sessionId ?? serverId ?? 'mcp';
        const normalized = namespace
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '') || 'mcp';
        return `tool_${normalized}_${toolName}`;
    }

    /**
     * Convenience static method to fetch tools in a single line.
     */
    static async getTools(client: BaseClient | BaseClientProvider, options: AIAdapterOptions = {}): Promise<ToolSet> {
        return new AIAdapter(client, options).getTools();
    }
}
