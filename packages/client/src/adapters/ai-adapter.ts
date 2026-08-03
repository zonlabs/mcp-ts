import { MCPClient } from '../server/mcp/oauth-client';
import { MultiSessionClient } from '../server/mcp/multi-session-client';
import type { JSONSchema7 } from 'json-schema';
import type { ToolSet } from 'ai';
import { ToolRouter } from '../shared/tool-router.js';
import type { ToolClient } from '../shared/types.js';
import { executeMetaTool, isMetaTool } from '../shared/meta-tools.js';

export interface AIAdapterOptions {
    /** 
     * Prefix for tool names to avoid collision with other tools.
     * Defaults to the client's serverId.
     */
    prefix?: string;

    /**
     * Optional ToolRouter for intelligent tool selection.
     *
     * When provided with `strategy: 'search'`, the adapter exposes only
     * meta-tools (search_tools, get_tool_schema) instead of all tool schemas,
     * reducing context window usage by 80–95%.
     *
     * When not provided, all tools are returned as before (backward-compatible).
     */
    toolRouter?: ToolRouter;

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
        private client: MCPClient | MultiSessionClient,
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

    private async transformTools(client: ToolClient): Promise<ToolSet> {
        // Safe check for isConnected method (duck typing for bundler compatibility)
        const isConnected = typeof client.isConnected === 'function'
            ? client.isConnected()
            : false;

        if (!isConnected) {
            return {};
        }

        const result = await client.listTools();

        // @ts-ignore: ToolSet type inference can be tricky with dynamic imports
        return Object.fromEntries(
            result.tools.map((tool) => {
                // Safe access to getServerId
                const serverId = typeof client.getServerId === 'function'
                    ? client.getServerId()
                    : undefined;
                const prefix = this.options.prefix ?? serverId?.replace(/-/g, '').substring(0, 8) ?? 'mcp';
                return [
                    `tool_${prefix}_${tool.name}`,
                    {
                        description: tool.description,
                        inputSchema: this.jsonSchema!(tool.inputSchema as JSONSchema7),
                        execute: async (args: any) => {
                            try {
                                const response = await client.callTool(tool.name, args);
                                return response;
                            } catch (error) {
                                const errorMessage = error instanceof Error ? error.message : String(error);
                                throw new Error(`Tool execution failed: ${errorMessage}`);
                            }
                        },
                        needsApproval: this.options.needsApproval
                            ? (args: any) => this.options.needsApproval!(tool, args)
                            : (tool.annotations as any)?.destructiveHint === true
                                ? () => true
                                : undefined
                    }
                ];
            })
        );
    }

    /**
     * Fetches tools from the client(s) and converts them to AI SDK tools.
     */
    async getTools(): Promise<ToolSet> {
        await this.ensureJsonSchema();

        // If a ToolRouter is provided, use its filtered output
        if (this.options.toolRouter) {
            return this.getToolsViaRouter(this.options.toolRouter);
        }

        // Use duck typing instead of instanceof to handle module bundling issues
        // MultiSessionClient has getClients(), MCPClient does not
        const isMultiSession = typeof (this.client as any).getClients === 'function';
        const clients = isMultiSession
            ? (this.client as MultiSessionClient).getClients()
            : [this.client as MCPClient];

        const results = await Promise.all(
            clients.map(async (client) => {
                try {
                    return await this.transformTools(client);
                } catch (error) {
                    // For multi-client, we log and continue.
                    // This is safer than throwing.
                    const serverId = typeof client.getServerId === 'function'
                        ? client.getServerId() ?? 'unknown'
                        : 'unknown';
                    console.error(`[AIAdapter] Failed to fetch tools from ${serverId}:`, error);
                    return {};
                }
            })
        );

        return results.reduce((acc, tools) => ({ ...acc, ...tools }), {});
    }

    /**
     * Build a ToolSet from a ToolRouter's filtered output.
     *
     * In `search` strategy, only meta-tools are registered with the framework.
     * Real tool execution is proxied through `mcp_execute_tool` which uses
     * `router.callTool()` to route to the correct MCP client.
     */
    private async getToolsViaRouter(router: ToolRouter): Promise<ToolSet> {
        const filteredTools = await router.getFilteredTools();

        // @ts-ignore: ToolSet type inference can be tricky with dynamic imports
        return Object.fromEntries(
            filteredTools.map((tool) => {
                const routedTool = tool as typeof tool & { sessionId?: string; serverId?: string; serverName?: string };
                const namespace = routedTool.serverId ?? routedTool.sessionId;
                const toolKey = isMetaTool(tool.name)
                    ? tool.name
                    : this.getRouterToolKey(tool.name, routedTool.sessionId, routedTool.serverId);

                return [
                    toolKey,
                    {
                        description: tool.description,
                        inputSchema: this.jsonSchema!(tool.inputSchema as JSONSchema7),
                        execute: async (args: any) => {
                            // Handle meta-tool calls via the router
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

                            // For non-meta tools in 'all' or 'groups' strategy,
                            // route directly to the correct MCP client
                            return await router.callTool(tool.name, args, namespace);
                        },
                        needsApproval: this.options.needsApproval
                            ? (args: any) => this.options.needsApproval!(tool, args)
                            : (args: any) => {
                                // Default HITL logic using annotations
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
    static async getTools(client: MCPClient | MultiSessionClient, options: AIAdapterOptions = {}): Promise<ToolSet> {
        return new AIAdapter(client, options).getTools();
    }
}

