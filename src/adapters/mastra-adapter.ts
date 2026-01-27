import { MCPClient } from '../server/oauth-client';
import { MultiSessionClient } from '../server/multi-session-client';
import type { z } from 'zod';

export interface MastraAdapterOptions {
    /** 
     * Prefix for tool names to avoid collision with other tools.
     * Defaults to the client's serverId.
     */
    prefix?: string;
}

/**
 * Interface definition for a Mastra tool since we might not have the SDK installed.
 * Based on Mastra documentation.
 */
export interface MastraTool {
    id: string;
    description: string;
    inputSchema: z.ZodType<any>;
    execute: (args: any) => Promise<any>;
}

/**
 * Adapter to use MCP tools within Mastra agents.
 */
export class MastraAdapter {
    private z: typeof z | undefined;

    constructor(
        private client: MCPClient | MultiSessionClient,
        private options: MastraAdapterOptions = {}
    ) { }

    /**
     * Lazy-loads Zod dependency
     */
    private async ensureZod() {
        if (!this.z) {
            try {
                const zod = await import('zod');
                this.z = zod.z;
            } catch (error) {
                throw new Error(
                    'zod is not installed. Install with:\n' +
                    '  npm install zod'
                );
            }
        }
    }



    private async transformTools(client: MCPClient): Promise<Record<string, MastraTool>> {
        if (!client.isConnected()) {
            return {};
        }

        await this.ensureZod();

        const result = await client.listTools();
        const prefix = this.options.prefix ?? client.getServerId() ?? 'mcp';
        const tools: Record<string, MastraTool> = {};

        for (const tool of result.tools) {
            const toolName = `${prefix}_${tool.name}`;

            // In a real implementation, you would use a library like 'json-schema-to-zod'
            const schema = this.jsonSchemaToZod(tool.inputSchema);

            tools[toolName] = {
                id: toolName,
                description: tool.description || `Tool ${tool.name}`,
                inputSchema: schema,
                execute: async (args: any) => {
                    return await client.callTool(tool.name, args);
                },
            };
        }

        return tools;
    }

    private jsonSchemaToZod(schema: any): z.ZodType<any> {
        try {
            const { parseSchema } = require('json-schema-to-zod');
            const zodSchemaString = parseSchema(schema);
            // eslint-disable-next-line no-eval
            return eval(zodSchemaString);
        } catch (error) {
            // Fallback: Accept any object if conversion fails
            console.warn('[MastraAdapter] Failed to convert JSON Schema to Zod, using fallback:', error);
            return this.z!.record(this.z!.any()).optional().describe("Dynamic Input");
        }
    }

    /**
     * Fetches tools from the MCP server and converts them to Mastra tools.
     */
    async getTools(): Promise<Record<string, MastraTool>> {
        const clients = this.client instanceof MultiSessionClient
            ? this.client.getClients()
            : [this.client];

        const results = await Promise.all(
            clients.map(async (client) => {
                try {
                    return await this.transformTools(client);
                } catch (error) {
                    console.error(`[MastraAdapter] Failed to fetch tools from ${client.getServerId()}:`, error);
                    return {};
                }
            })
        );
        return results.reduce((acc, tools) => ({ ...acc, ...tools }), {});
    }

    /**
     * Convenience static method to fetch tools in a single line.
     */
    static async getTools(client: MCPClient | MultiSessionClient, options: MastraAdapterOptions = {}): Promise<Record<string, MastraTool>> {
        return new MastraAdapter(client, options).getTools();
    }
}
