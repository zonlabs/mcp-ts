import type { DynamicStructuredTool, StructuredTool } from '@langchain/core/tools';
import type { z } from 'zod';
import { ToolRouter } from '../shared/tool-router.js';
import type { BaseClient, BaseClientProvider, ToolClient } from '../shared/types.js';
import { executeMetaTool, isMetaTool } from '../shared/meta-tools.js';

export interface LangChainAdapterOptions {
    /** 
     * Prefix for tool names to avoid collision with other tools.
     * Defaults to the client's serverId.
     */
    prefix?: string;

    /**
     * Whether to simplify error messages returned to the LLM.
     * If true, returns "Error: <message>" string instead of throwing.
     * @default false
     */
    simplifyErrors?: boolean;

    /**
     * Optional ToolRouter for intelligent tool selection.
     * See AIAdapterOptions.toolRouter for details.
     */
    toolRouter?: ToolRouter;
}

/**
 * Adapter to use MCP tools within LangChain/LangGraph agents.
 */
export class LangChainAdapter {
    private DynamicStructuredTool: typeof DynamicStructuredTool | undefined;
    private z: typeof z | undefined;

    constructor(
        private client: BaseClient | BaseClientProvider,
        private options: LangChainAdapterOptions = {}
    ) { }

    /**
     * Lazy-loads LangChain and Zod dependencies
     */
    private async ensureDependencies() {
        if (!this.DynamicStructuredTool) {
            try {
                const langchain = await import('@langchain/core/tools');
                this.DynamicStructuredTool = langchain.DynamicStructuredTool as any;

                const zod = await import('zod');
                this.z = zod.z;
            } catch (error) {
                throw new Error(
                    'LangChain dependencies not installed. Install with:\n' +
                    '  npm install @langchain/core zod'
                );
            }
        }
    }

    private async transformTools(client: ToolClient): Promise<StructuredTool[]> {
        if (!client.isConnected()) {
            return [];
        }

        await this.ensureDependencies();

        const result = await client.listTools();
        const prefix = this.options.prefix ?? client.getServerId?.()?.replace(/-/g, '').substring(0, 8) ?? 'mcp';

        return result.tools.map((tool) => {
            // In a real implementation, you would use a library like 'json-schema-to-zod'
            const schema = this.jsonSchemaToZod(tool.inputSchema);

            return new this.DynamicStructuredTool!({
                name: `${prefix}_${tool.name}`,
                description: tool.description || `Tool ${tool.name}`,
                schema: schema,
                func: async (args: any) => {
                    try {
                        return await client.callTool(tool.name, args);
                    } catch (error: any) {
                        if (this.options.simplifyErrors) {
                            return `Error: ${error.message}`;
                        }
                        throw error;
                    }
                },
            });
        });
    }

    private jsonSchemaToZod(schema: any): z.ZodType<any> {
        try {
            const { parseSchema } = require('json-schema-to-zod');
            const zodSchemaString = parseSchema(schema);
            // eslint-disable-next-line
            return new Function('z', 'return ' + zodSchemaString)(this.z);
        } catch (error: any) {
            // Fallback: Accept any object if conversion fails
            if (error.code === 'MODULE_NOT_FOUND') {
                console.warn('[LangChainAdapter] json-schema-to-zod is not installed. To improve type checking, install it with: npm install json-schema-to-zod');
            } else {
                console.warn('[LangChainAdapter] Failed to convert JSON Schema to Zod, using fallback:', error);
            }
            return this.z!.record(this.z!.string(), this.z!.any()).optional().describe("Dynamic Input");
        }
    }

    /**
     * Fetches tools from the MCP server and converts them to LangChain StructuredTools.
     */
    async getTools(): Promise<StructuredTool[]> {
        // If a ToolRouter is provided, use its filtered output
        if (this.options.toolRouter) {
            return this.getToolsViaRouter(this.options.toolRouter);
        }

        // Use duck typing instead of instanceof to handle module bundling issues
        const isProvider = typeof (this.client as BaseClientProvider).getClients === 'function';
        const clients = isProvider
            ? (this.client as BaseClientProvider).getClients()
            : [this.client as BaseClient];

        const results = await Promise.all(
            clients.map(async (client) => {
                try {
                    return await this.transformTools(client);
                } catch (error) {
                    console.error(`[LangChainAdapter] Failed to fetch tools from ${client.getServerId?.() ?? "unknown"}:`, error);
                    return [];
                }
            })
        );
        return results.flat();
    }

    /**
     * Build StructuredTools from a ToolRouter's filtered output.
     *
     * In `search` strategy, only meta-tools are registered with the framework.
     * Real tool execution is proxied through `mcp_execute_tool` which uses
     * `router.callTool()` to route to the correct MCP client.
     */
    private async getToolsViaRouter(router: ToolRouter): Promise<StructuredTool[]> {
        await this.ensureDependencies();

        const filteredTools = await router.getFilteredTools();

        return filteredTools.map((tool) => {
            const routedTool = tool as typeof tool & { sessionId?: string; serverId?: string; serverName?: string };
            const namespace = routedTool.serverId ?? routedTool.sessionId;
            const schema = this.jsonSchemaToZod(tool.inputSchema);

            return new this.DynamicStructuredTool!({
                name: isMetaTool(tool.name)
                    ? tool.name
                    : this.getRouterToolKey(tool.name, routedTool.sessionId, routedTool.serverId),
                description: tool.description || `Tool ${tool.name}`,
                schema: schema,
                func: async (args: any) => {
                    try {
                        // Handle meta-tool calls via the router
                        if (isMetaTool(tool.name)) {
                            const result = await executeMetaTool(
                                tool.name,
                                args,
                                router,
                                (name, toolArgs, namespace) => router.callTool(name, toolArgs, namespace)
                            );
                            if (result) {
                                return result.content.map((c: any) => c.text ?? '').join('\n');
                            }
                        }

                        // For non-meta tools in 'all' or 'groups' strategy,
                        // route directly to the correct MCP client
                        return await router.callTool(tool.name, args, namespace);
                    } catch (error: any) {
                        if (this.options.simplifyErrors) {
                            return `Error: ${error.message}`;
                        }
                        throw error;
                    }
                },
            });
        });
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
    static async getTools(client: BaseClient | BaseClientProvider, options: LangChainAdapterOptions = {}): Promise<StructuredTool[]> {
        return new LangChainAdapter(client, options).getTools();
    }
}

