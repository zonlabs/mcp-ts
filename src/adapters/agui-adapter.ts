/**
 * MCP Adapter for AG-UI Integration
 *
 * This adapter transforms MCP tools into formats compatible with AG-UI agents.
 * It provides tools with handlers for server-side execution and tool definitions
 * in JSON Schema format for passing to remote agents.
 *
 * @example
 * ```typescript
 * import { MultiSessionClient } from '@mcp-ts/sdk/server';
 * import { AguiAdapter } from '@mcp-ts/sdk/adapters/mcp-adapter';
 * import { createMcpMiddleware } from '@mcp-ts/sdk/adapters/agui-middleware';
 * import { HttpAgent } from '@ag-ui/client';
 *
 * // Create MCP client
 * const mcpClient = new MultiSessionClient('user_123');
 * await mcpClient.connect();
 *
 * // Create adapter and get tools
 * const adapter = new AguiAdapter(mcpClient);
 * const tools = await adapter.getTools();
 *
 * // Use with AG-UI middleware
 * const agent = new HttpAgent({ url: 'http://localhost:8000/agent' });
 * agent.use(createMcpMiddleware(mcpClient, { tools }));
 * ```
 */

import { MCPClient } from '../server/mcp/oauth-client.js';
import { MultiSessionClient } from '../server/mcp/multi-session-client.js';

/**
 * Configuration options for AguiAdapter
 */
export interface AguiAdapterOptions {
    /**
     * Prefix for tool names to avoid collision with other tools.
     * @default serverId or 'mcp'
     */
    prefix?: string;
}

/**
 * AG-UI Tool with handler for server-side execution.
 *
 * Tools contain:
 * - `name`: Unique identifier (prefixed with server ID)
 * - `description`: Human-readable description for the LLM
 * - `parameters`: JSON Schema defining the input format
 * - `handler`: Function that executes the tool via MCP client
 */
export interface AguiTool {
    /** Unique tool name (e.g., "server-abc_get_weather") */
    name: string;
    /** Human-readable description for the LLM */
    description: string;
    /** JSON Schema format parameters */
    parameters?: Record<string, any>;
    /** Handler function that executes the MCP tool */
    handler?: (args: any) => any | Promise<any>;
}

/**
 * Tool definition format for passing to remote agents (without handler).
 * Compatible with OpenAI's function calling API.
 */
export interface AguiToolDefinition {
    /** Tool name (e.g., "server-abc_get_weather") */
    name: string;
    /** Human-readable description */
    description: string;
    /** JSON Schema format parameters */
    parameters: Record<string, any>;
}

/**
 * Adapter that transforms MCP tools into AG-UI compatible formats.
 *
 * This adapter provides two main outputs:
 * - `getTools()`: Returns tools with handlers for server-side execution
 * - `getToolDefinitions()`: Returns tool definitions in JSON Schema format for remote agents
 */
export class AguiAdapter {
    constructor(
        private client: MCPClient | MultiSessionClient,
        private options: AguiAdapterOptions = {}
    ) { }

    /**
     * Get tools with handlers for MCP tool execution.
     *
     * Each tool includes a handler function that:
     * 1. Calls the MCP tool via the client
     * 2. Extracts text content from the result
     * 3. Returns the result as a string or JSON
     *
     * @returns Array of AguiTool objects
     */
    async getTools(): Promise<AguiTool[]> {
        const isMultiSession = typeof (this.client as any).getClients === 'function';

        if (isMultiSession) {
            const clients = (this.client as MultiSessionClient).getClients();
            const allTools: AguiTool[] = [];

            for (const client of clients) {
                const tools = await this.transformTools(client);
                allTools.push(...tools);
            }

            return allTools;
        }

        return this.transformTools(this.client as MCPClient);
    }

    private async transformTools(client: MCPClient): Promise<AguiTool[]> {
        if (!client.isConnected()) {
            return [];
        }

        const result = await client.listTools();
        const prefix = this.options.prefix ?? client.getServerId() ?? 'mcp';
        const tools: AguiTool[] = [];

        for (const tool of result.tools) {
            const toolName = `${prefix}_${tool.name}`;

            tools.push({
                name: toolName,
                description: tool.description || `Execute ${tool.name}`,
                parameters: tool.inputSchema || { type: 'object', properties: {} },
                handler: async (args: any) => {
                    console.log(`[AguiAdapter] Executing MCP tool: ${tool.name}`, args);
                    const result = await client.callTool(tool.name, args);

                    // Extract text content from result
                    if (result.content && Array.isArray(result.content)) {
                        const textContent = result.content
                            .filter((c: any) => c.type === 'text')
                            .map((c: any) => c.text)
                            .join('\n');
                        return textContent || result;
                    }

                    return result;
                }
            });
        }

        return tools;
    }

    /**
     * Get tools as a function (for dynamic loading).
     *
     * @returns Function that returns a Promise of tools
     */
    getToolsFunction(): () => Promise<AguiTool[]> {
        return async () => this.getTools();
    }

    /**
     * Get tool definitions in JSON Schema format for passing to remote agents.
     *
     * This format is compatible with:
     * - OpenAI's function calling API
     * - AG-UI input.tools format
     * - Most LLM tool/function calling implementations
     *
     * @returns Array of AguiToolDefinition objects
     */
    async getToolDefinitions(): Promise<AguiToolDefinition[]> {
        const isMultiSession = typeof (this.client as any).getClients === 'function';

        if (isMultiSession) {
            const clients = (this.client as MultiSessionClient).getClients();
            const allTools: AguiToolDefinition[] = [];

            for (const client of clients) {
                const tools = await this.transformToolDefinitions(client);
                allTools.push(...tools);
            }

            return allTools;
        }

        return this.transformToolDefinitions(this.client as MCPClient);
    }

    private async transformToolDefinitions(client: MCPClient): Promise<AguiToolDefinition[]> {
        if (!client.isConnected()) {
            return [];
        }

        const result = await client.listTools();
        const prefix = this.options.prefix ?? client.getServerId() ?? 'mcp';
        const tools: AguiToolDefinition[] = [];

        for (const tool of result.tools) {
            tools.push({
                name: `${prefix}_${tool.name}`,
                description: tool.description || `Execute ${tool.name}`,
                parameters: tool.inputSchema || { type: 'object', properties: {} },
            });
        }

        return tools;
    }
}
