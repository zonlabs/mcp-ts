import { MCPClient } from '../server/mcp/oauth-client';
import { MultiSessionClient } from '../server/mcp/multi-session-client';
import type { ToolClient } from '../shared/types.js';
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



    private async transformTools(client: ToolClient): Promise<Record<string, MastraTool>> {
        if (!client.isConnected()) {
            return {};
        }

        await this.ensureZod();

        const result = await client.listTools();
        const prefix = this.options.prefix ?? client.getServerId?.()?.replace(/-/g, '').substring(0, 8) ?? 'mcp';
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
            // eslint-disable-next-line
            return new Function('z', 'return ' + zodSchemaString)(this.z);
        } catch (error: any) {
            // Fallback: Accept any object if conversion fails
            if (error.code === 'MODULE_NOT_FOUND') {
                console.warn('[MastraAdapter] json-schema-to-zod is not installed. To improve type checking, install it with: npm install json-schema-to-zod');
            } else {
                console.warn('[MastraAdapter] Failed to convert JSON Schema to Zod, using fallback:', error);
            }
            return this.z!.record(this.z!.string(), this.z!.any()).optional().describe("Dynamic Input");
        }
    }

    /**
     * Fetches tools from the MCP server and converts them to Mastra tools.
     */
    async getTools(): Promise<Record<string, MastraTool>> {
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
                    console.error(`[MastraAdapter] Failed to fetch tools from ${client.getServerId?.() ?? "unknown"}:`, error);
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

