import { MCPClient } from '../server/mcp/oauth-client';
import { MultiSessionClient } from '../server/mcp/multi-session-client';
import type { DynamicStructuredTool, StructuredTool } from '@langchain/core/tools';
import type { z } from 'zod';

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
}

/**
 * Adapter to use MCP tools within LangChain/LangGraph agents.
 */
export class LangChainAdapter {
    private DynamicStructuredTool: typeof DynamicStructuredTool | undefined;
    private z: typeof z | undefined;

    constructor(
        private client: MCPClient | MultiSessionClient,
        private options: LangChainAdapterOptions = {}
    ) { }

    /**
     * Lazy-loads LangChain and Zod dependencies
     */
    private async ensureDependencies() {
        if (!this.DynamicStructuredTool) {
            try {
                const langchain = await import('@langchain/core/tools');
                this.DynamicStructuredTool = langchain.DynamicStructuredTool;

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

    private async transformTools(client: MCPClient): Promise<StructuredTool[]> {
        if (!client.isConnected()) {
            return [];
        }

        await this.ensureDependencies();

        const result = await client.listTools();
        const prefix = this.options.prefix ?? client.getServerId() ?? 'mcp';

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
        } catch (error) {
            // Fallback: Accept any object if conversion fails
            console.warn('[LangChainAdapter] Failed to convert JSON Schema to Zod, using fallback:', error);
            return this.z!.record(this.z!.any()).optional().describe("Dynamic Input");
        }
    }

    /**
     * Fetches tools from the MCP server and converts them to LangChain StructuredTools.
     */
    async getTools(): Promise<StructuredTool[]> {
        // Use duck typing instead of instanceof to handle module bundling issues
        const isMultiSession = typeof (this.client as any).getClients === 'function';
        const clients = isMultiSession
            ? (this.client as MultiSessionClient).getClients()
            : [this.client as MCPClient];

        const results = await Promise.all(
            clients.map(async (client) => {
                try {
                    return await this.transformTools(client);
                } catch (error) {
                    console.error(`[LangChainAdapter] Failed to fetch tools from ${client.getServerId()}:`, error);
                    return [];
                }
            })
        );
        return results.flat();
    }

    /**
     * Convenience static method to fetch tools in a single line.
     */
    static async getTools(client: MCPClient | MultiSessionClient, options: LangChainAdapterOptions = {}): Promise<StructuredTool[]> {
        return new LangChainAdapter(client, options).getTools();
    }
}
