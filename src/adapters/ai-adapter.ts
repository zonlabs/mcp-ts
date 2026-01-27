import { MCPClient } from '../server/mcp/oauth-client';
import { MultiSessionClient } from '../server/mcp/multi-session-client';
import type { JSONSchema7 } from 'json-schema';
import type { ToolSet } from 'ai';

export interface AIAdapterOptions {
    /** 
     * Prefix for tool names to avoid collision with other tools.
     * Defaults to the client's serverId.
     */
    prefix?: string;
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

    private async transformTools(client: MCPClient): Promise<ToolSet> {
        if (!client.isConnected()) {
            // Treat disconnected as empty tools for robust multi-session handling
            return {};
        }

        const result = await client.listTools();



        // @ts-ignore: ToolSet type inference can be tricky with dynamic imports
        return Object.fromEntries(
            result.tools.map((tool) => {
                const prefix = this.options.prefix ?? client.getServerId()?.replace(/-/g, '') ?? 'mcp';
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
                        }
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

        const clients = this.client instanceof MultiSessionClient
            ? this.client.getClients()
            : [this.client];

        const results = await Promise.all(
            clients.map(async (client) => {
                try {
                    return await this.transformTools(client);
                } catch (error) {
                    // For multi-client, we log and continue. 
                    // This is safer than throwing.
                    console.error(`[AIAdapter] Failed to fetch tools from ${client.getServerId()}:`, error);
                    return {};
                }
            })
        );

        return results.reduce((acc, tools) => ({ ...acc, ...tools }), {});
    }

    /**
     * Convenience static method to fetch tools in a single line.
     */
    static async getTools(client: MCPClient | MultiSessionClient, options: AIAdapterOptions = {}): Promise<ToolSet> {
        return new AIAdapter(client, options).getTools();
    }
}
