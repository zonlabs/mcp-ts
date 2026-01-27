import { MCPClient } from '../server/mcp/oauth-client.js';
import { MultiSessionClient } from '../server/mcp/multi-session-client.js';

export interface CopilotKitAdapterOptions {
    /** 
     * Prefix for action names to avoid collision 
     * @default serverId or 'mcp'
     */
    prefix?: string;
}

export interface CopilotKitAction {
    name: string;
    description: string;
    parameters: any; // JSON Schema
    handler: (args: any) => Promise<any>;
}

/**
 * Adapter to use MCP tools within CopilotKit agents.
 * 
 * @example
 * ```typescript
 * import { MultiSessionClient } from '@mcp-ts/sdk/server';
 * import { CopilotKitAdapter } from '@mcp-ts/sdk/adapters/copilotkit';
 * import { CopilotRuntime } from '@copilotkit/runtime';
 * 
 * const mcpClient = new MultiSessionClient('user_123');
 * await mcpClient.connect();
 * 
 * const adapter = new CopilotKitAdapter(mcpClient);
 * const actions = await adapter.getActions();
 * 
 * const runtime = new CopilotRuntime({ actions });
 * ```
 */
export class CopilotKitAdapter {
    constructor(
        private client: MCPClient | MultiSessionClient,
        private options: CopilotKitAdapterOptions = {}
    ) { }

    /**
     * Get CopilotKit actions from MCP tools
     */
    async getActions(): Promise<CopilotKitAction[]> {
        // Handle MultiSessionClient
        if (this.client instanceof MultiSessionClient) {
            const clients = this.client.getClients();
            const allActions: CopilotKitAction[] = [];

            for (const client of clients) {
                const actions = await this.transformTools(client);
                allActions.push(...actions);
            }

            return allActions;
        }

        // Handle single MCPClient
        return this.transformTools(this.client);
    }

    private async transformTools(client: MCPClient): Promise<CopilotKitAction[]> {
        if (!client.isConnected()) {
            return [];
        }

        const result = await client.listTools();
        const prefix = this.options.prefix ?? client.getServerId() ?? 'mcp';
        const actions: CopilotKitAction[] = [];

        for (const tool of result.tools) {
            const actionName = `${prefix}_${tool.name}`;

            actions.push({
                name: actionName,
                description: tool.description || `Execute ${tool.name}`,
                parameters: tool.inputSchema || {},
                handler: async (args: any) => {
                    console.log(`[CopilotKit] Executing MCP tool: ${tool.name}`);
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

        return actions;
    }

    /**
     * Get actions as a function (for dynamic loading)
     * Useful for CopilotRuntime({ actions: async () => ... })
     */
    getActionsFunction(): () => Promise<CopilotKitAction[]> {
        return async () => this.getActions();
    }
}
