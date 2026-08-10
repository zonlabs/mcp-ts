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
 * import { AguiAdapter } from '@mcp-ts/sdk/adapters/agui-adapter';
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
 * agent.use(createMcpMiddleware({ tools }));
 * ```
 */

import { MCPClient } from '../server/mcp/oauth-client.js';
import { MultiSessionClient } from '../server/mcp/multi-session-client.js';
import { ToolRouter } from '../shared/tool-router.js';
import type { ToolClient } from '../shared/types.js';
import { executeMetaTool, isMetaTool } from '../shared/meta-tools.js';

/**
 * Extended JSON Schema properties that Pydantic's strict validation rejects.
 * These are valid JSON Schema extensions but not part of the core spec.
 */
const PYDANTIC_FORBIDDEN_PROPS = [
    // JSON Schema meta-properties
    '$schema', '$id', '$comment', '$defs', 'definitions',
    // Extended properties used by some MCP servers (e.g., Apify)
    'prefill', 'examples', 'enumTitles', 'enumDescriptions',
    // Other common extensions
    'deprecated', 'readOnly', 'writeOnly', 'contentMediaType', 'contentEncoding',
];

/**
 * Cleans a JSON Schema by removing meta-properties that cause issues with
 * strict Pydantic validation (e.g., Google ADK, LangGraph).
 *
 * @param schema - The JSON Schema to clean
 * @returns Cleaned schema without forbidden properties
 */
export function cleanSchema(schema: Record<string, any> | undefined): Record<string, any> {
    if (!schema) {
        return { type: 'object', properties: {} };
    }

    const cleaned = { ...schema };

    // Remove all forbidden properties
    for (const prop of PYDANTIC_FORBIDDEN_PROPS) {
        delete cleaned[prop];
    }

    // Recursively clean nested properties
    if (cleaned.properties && typeof cleaned.properties === 'object') {
        const cleanedProps: Record<string, any> = {};
        for (const [key, value] of Object.entries(cleaned.properties)) {
            if (typeof value === 'object' && value !== null) {
                cleanedProps[key] = cleanSchema(value as Record<string, any>);
            } else {
                cleanedProps[key] = value;
            }
        }
        cleaned.properties = cleanedProps;
    }

    // Clean items if it's an array schema
    if (cleaned.items && typeof cleaned.items === 'object') {
        cleaned.items = cleanSchema(cleaned.items);
    }

    // Clean additionalProperties if it's an object schema
    if (cleaned.additionalProperties && typeof cleaned.additionalProperties === 'object') {
        cleaned.additionalProperties = cleanSchema(cleaned.additionalProperties);
    }

    return cleaned;
}

/**
 * Configuration options for AguiAdapter
 */
export interface AguiAdapterOptions {
    /**
     * Prefix for tool names to avoid collision with other tools.
     * @default serverId or 'mcp'
     */
    prefix?: string;

    /**
     * Optional ToolRouter for intelligent tool selection.
     */
    toolRouter?: ToolRouter;
}

/**
 * AG-UI Tool with handler for server-side execution.
 */
export interface AguiTool {
    name: string;
    description: string;
    parameters?: Record<string, any>;
    _meta?: Record<string, any>; // Add _meta to AguiTool
    handler?: (args: any) => any | Promise<any>;
}

/**
 * Tool definition format for passing to remote agents (without handler).
 */
export interface AguiToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, any>;
    _meta?: Record<string, any>; // Add _meta to AguiToolDefinition
}

/**
 * Adapter that transforms MCP tools into AG-UI compatible formats.
 */
export class AguiAdapter {
    constructor(
        private client: MCPClient | MultiSessionClient,
        private options: AguiAdapterOptions = {}
    ) { }

    /**
     * Get tools with handlers for MCP tool execution.
     */
    async getTools(): Promise<AguiTool[]> {
        if (this.options.toolRouter) {
            return this.getToolsViaRouter(this.options.toolRouter);
        }

        if (this.isMultiSession()) {
            const clients = (this.client as MultiSessionClient).getClients();
            const allTools: AguiTool[] = [];
            for (const client of clients) {
                allTools.push(...await this.transformTools(client));
            }
            return allTools;
        }
        return this.transformTools(this.client as MCPClient);
    }

    /**
     * Get tool definitions in JSON Schema format for passing to remote agents.
     */
    async getToolDefinitions(): Promise<AguiToolDefinition[]> {
        if (this.options.toolRouter) {
            return this.getToolDefinitionsViaRouter(this.options.toolRouter);
        }

        if (this.isMultiSession()) {
            const clients = (this.client as MultiSessionClient).getClients();
            const allTools: AguiToolDefinition[] = [];
            for (const client of clients) {
                allTools.push(...await this.transformToolDefinitions(client));
            }
            return allTools;
        }
        return this.transformToolDefinitions(this.client as MCPClient);
    }

    /**
     * Get tools as a function (for dynamic loading).
     */
    getToolsFunction(): () => Promise<AguiTool[]> {
        return () => this.getTools();
    }

    private isMultiSession(): boolean {
        return typeof (this.client as any).getClients === 'function';
    }

    private async transformTools(client: ToolClient): Promise<AguiTool[]> {
        if (!client.isConnected()) return [];

        const result = await client.listTools();
        const serverId = (typeof (client as any).getServerId === 'function'
            ? (client as any).getServerId()
            : undefined) as string | undefined;
        const normalizedPrefix = this.options.prefix?.replace(/-/g, '') ?? serverId?.replace(/-/g, '').substring(0, 8) ?? 'mcp';
        const prefix = `tool_${normalizedPrefix}`;

        return result.tools.map(tool => {
            // Type assertion to access _meta if it exists on the tool object (it comes from MCP SDK)
            const mcpTool = tool as any;
            const mcpToolName = tool.name;
            return {
                name: `${prefix}_${tool.name}`,
                description: tool.description || `Execute ${tool.name}`,
                parameters: cleanSchema(tool.inputSchema),
                _meta: { ...mcpTool._meta, sessionId: (client as any).getSessionId?.() },
                handler: async (args: any) => {
                    // Call the actual MCP tool
                    const callResult = await (client as any).callTool(mcpToolName, args ?? {});

                    // Return the raw result object so middleware can inspect `_meta` (e.g. for UI triggers)
                    return callResult;
                }
            }
        });
    }

    private async transformToolDefinitions(client: ToolClient): Promise<AguiToolDefinition[]> {
        if (!client.isConnected()) return [];

        const result = await client.listTools();
        const serverId = (typeof (client as any).getServerId === 'function'
            ? (client as any).getServerId()
            : undefined) as string | undefined;
        const normalizedPrefix = this.options.prefix?.replace(/-/g, '') ?? serverId?.replace(/-/g, '').substring(0, 8) ?? 'mcp';
        const prefix = `tool_${normalizedPrefix}`;

        return result.tools.map(tool => {
            const mcpTool = tool as any;
            return {
                name: `${prefix}_${tool.name}`,
                description: tool.description || `Execute ${tool.name}`,
                parameters: cleanSchema(tool.inputSchema),
                _meta: { ...mcpTool._meta, sessionId: (client as any).getSessionId?.() },
            };
        });
    }

    /**
     * Build AG-UI tools from a ToolRouter's filtered output.
     *
     * In `search` strategy, only meta-tools are registered with the framework.
     * Real tool execution is proxied through `mcp_execute_tool` which uses
     * `router.callTool()` to route to the correct MCP client.
     */
    private async getToolsViaRouter(router: ToolRouter): Promise<AguiTool[]> {
        const filteredTools = await router.getFilteredTools();

        return filteredTools.map(tool => {
            const routedTool = tool as typeof tool & { sessionId?: string; serverId?: string; serverName?: string };
            const namespace = routedTool.serverId ?? routedTool.sessionId;
            return {
                name: isMetaTool(tool.name)
                    ? tool.name
                    : this.getRouterToolKey(tool.name, routedTool.sessionId, routedTool.serverId),
                description: tool.description || `Execute ${tool.name}`,
                parameters: cleanSchema(tool.inputSchema),
                handler: async (args: any) => {
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
                        return "Failed to execute meta-tool";
                    }

                    // For non-meta tools in 'all' or 'groups' strategy,
                    // route directly to the correct MCP client
                    return await router.callTool(tool.name, args, namespace);
                }
            };
        });
    }

    private async getToolDefinitionsViaRouter(router: ToolRouter): Promise<AguiToolDefinition[]> {
        const filteredTools = await router.getFilteredTools();
        return filteredTools.map(tool => {
            const routedTool = tool as typeof tool & { sessionId?: string; serverId?: string; serverName?: string };
            return {
                name: isMetaTool(tool.name)
                    ? tool.name
                    : this.getRouterToolKey(tool.name, routedTool.sessionId, routedTool.serverId),
                description: tool.description || `Execute ${tool.name}`,
                parameters: cleanSchema(tool.inputSchema)
            };
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
}



