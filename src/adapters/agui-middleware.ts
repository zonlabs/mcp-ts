/**
 * AG-UI Middleware for MCP Tool Execution
 *
 * This middleware intercepts tool calls from remote agents (e.g., LangGraph, AutoGen)
 * and executes MCP tools server-side, returning results back to the agent.
 *
 * ## How It Works
 *
 * 1. **Tool Injection**: When a run starts, the middleware injects MCP tool definitions
 *    into `input.tools` so the remote agent knows about available MCP tools.
 *
 * 2. **Event Interception**: The middleware subscribes to the agent's event stream and
 *    tracks tool calls using AG-UI events:
 *    - `TOOL_CALL_START`: Records tool name and ID
 *    - `TOOL_CALL_ARGS`: Accumulates streamed arguments
 *    - `TOOL_CALL_END`: Marks tool call as complete
 *    - `RUN_FINISHED`: Triggers execution of pending MCP tools
 *
 * 3. **Server-Side Execution**: When `RUN_FINISHED` arrives with pending MCP tool calls,
 *    the middleware:
 *    - Executes each MCP tool via the MCP client
 *    - Emits `TOOL_CALL_RESULT` events with the results
 *    - Adds results to `input.messages` for context
 *    - Emits `RUN_FINISHED` to close the current run
 *    - Triggers a new run so the agent can process tool results
 *
 * 4. **Recursive Processing**: If the new run makes more MCP tool calls, the cycle
 *    repeats until the agent completes without pending MCP calls.
 *
 * ## Tool Identification
 *
 * MCP tools are identified by a configurable prefix (default: `server-`).
 * Tools not matching this prefix are passed through without interception.
 *
 * @requires @ag-ui/client - This middleware requires @ag-ui/client as a peer dependency
 * @requires rxjs - Uses RxJS Observables for event streaming
 *
 * @example
 * ```typescript
 * import { HttpAgent } from '@ag-ui/client';
 * import { McpMiddleware } from '@mcp-ts/sdk/adapters/agui-middleware';
 * import { AguiAdapter } from '@mcp-ts/sdk/adapters/agui-adapter';
 *
 * // Create MCP client and adapter
 * const mcpClient = new MultiSessionClient('user_123');
 * await mcpClient.connect();
 *
 * const adapter = new AguiAdapter(mcpClient);
 * const actions = await adapter.getActions();
 *
 * // Create middleware with pre-loaded actions
 * const middleware = new McpMiddleware({
 *   client: mcpClient,
 *   actions,
 *   toolPrefix: 'server-',
 * });
 *
 * // Use with HttpAgent
 * const agent = new HttpAgent({ url: 'http://localhost:8000/agent' });
 * agent.use(middleware);
 * ```
 */

import { Observable, Subscriber } from 'rxjs';
import {
    Middleware,
    EventType,
    type AbstractAgent,
    type RunAgentInput,
    type BaseEvent,
    type ToolCallEndEvent,
} from '@ag-ui/client';
import { MCPClient } from '../server/mcp/oauth-client.js';
import { MultiSessionClient } from '../server/mcp/multi-session-client.js';
import type { AguiTool } from './agui-adapter.js';

/**
 * Tool definition format for AG-UI input.tools
 */
export interface AgUiTool {
    name: string;
    description: string;
    parameters?: Record<string, any>;
}

/**
 * Configuration for McpMiddleware
 */
export interface McpMiddlewareConfig {
    /**
     * MCP client or MultiSessionClient for executing tools
     */
    client: MCPClient | MultiSessionClient;

    /**
     * Prefix used to identify MCP tool names.
     * Tools starting with this prefix will be executed server-side.
     * @default 'server-'
     */
    toolPrefix?: string;

    /**
     * Pre-loaded tools with handlers for execution.
     * If not provided, tools will be loaded from the MCP client on first use.
     */
    tools?: AguiTool[];
}

/**
 * AG-UI Middleware that executes MCP tools server-side.
 *
 * This middleware intercepts tool calls for MCP tools (identified by prefix),
 * executes them via the MCP client, and returns results to the agent.
 *
 * @see {@link createMcpMiddleware} for a simpler factory function
 */
export class McpMiddleware extends Middleware {
    private client: MCPClient | MultiSessionClient;
    private toolPrefix: string;
    private actions: AguiTool[] | null;
    private tools: AgUiTool[] | null;
    private actionsLoaded: boolean = false;

    constructor(config: McpMiddlewareConfig) {
        super();
        this.client = config.client;
        this.toolPrefix = config.toolPrefix ?? 'server-';
        this.actions = config.tools ?? null;
        this.tools = null;
        if (this.actions) {
            this.actionsLoaded = true;
            this.tools = this.actionsToTools(this.actions);
        }
    }

    /**
     * Convert actions to AG-UI tool format
     */
    private actionsToTools(actions: AguiTool[]): AgUiTool[] {
        return actions.map(action => ({
            name: action.name,
            description: action.description,
            parameters: action.parameters || { type: 'object', properties: {} },
        }));
    }

    /**
     * Check if a tool name is an MCP tool (matches the configured prefix)
     */
    private isMcpTool(toolName: string): boolean {
        return toolName.startsWith(this.toolPrefix);
    }

    /**
     * Load actions from the MCP client if not already loaded
     */
    private async ensureActionsLoaded(): Promise<void> {
        if (this.actionsLoaded) return;

        const { AguiAdapter } = await import('./agui-adapter.js');
        const adapter = new AguiAdapter(this.client);
        this.actions = await adapter.getTools();
        this.actionsLoaded = true;
    }

    /**
     * Execute an MCP tool and return the result as a string
     */
    private async executeTool(toolName: string, args: Record<string, any>): Promise<string> {
        await this.ensureActionsLoaded();

        const action = this.actions?.find(a => a.name === toolName);
        if (!action) {
            return `Error: Tool not found: ${toolName}`;
        }

        if (!action.handler) {
            return `Error: Tool has no handler: ${toolName}`;
        }

        try {
            console.log(`[McpMiddleware] Executing tool: ${toolName}`, args);
            const result = await action.handler(args);
            console.log(`[McpMiddleware] Tool result:`, typeof result === 'string' ? result.slice(0, 200) : result);
            return typeof result === 'string' ? result : JSON.stringify(result);
        } catch (error: any) {
            console.error(`[McpMiddleware] Error executing tool:`, error);
            return `Error executing tool: ${error.message || String(error)}`;
        }
    }

    /**
     * Generate a unique message ID for tool results
     */
    private generateMessageId(): string {
        return `mcp_result_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }

    /**
     * Run the middleware, intercepting and executing MCP tool calls
     */
    run(input: RunAgentInput, next: AbstractAgent): Observable<BaseEvent> {
        return new Observable<BaseEvent>((observer: Subscriber<BaseEvent>) => {
            // State for this run
            const toolCallArgsBuffer = new Map<string, string>();
            const toolCallNames = new Map<string, string>();
            const pendingMcpCalls = new Set<string>();

            console.log(`[McpMiddleware] Starting run with ${this.actions?.length ?? 0} registered actions`);
            console.log(`[McpMiddleware] Tool prefix: "${this.toolPrefix}"`);

            // Inject MCP tools into input.tools
            if (this.tools && this.tools.length > 0) {
                const existingTools = input.tools || [];
                input.tools = [...existingTools, ...this.tools];
                console.log(`[McpMiddleware] Injected ${this.tools.length} MCP tools into input.tools`);
                console.log(`[McpMiddleware] Total tools: ${input.tools.length}`);
                console.log(`[McpMiddleware] Tool names:`, this.tools.map(t => t.name));
            }

            const handleRunFinished = async (event: BaseEvent) => {
                if (pendingMcpCalls.size === 0) {
                    observer.next(event);
                    observer.complete();
                    return;
                }

                console.log(`[McpMiddleware] RUN_FINISHED received with ${pendingMcpCalls.size} pending MCP calls`);

                // Execute all pending MCP tool calls
                const callPromises = [...pendingMcpCalls].map(async (toolCallId) => {
                    const toolName = toolCallNames.get(toolCallId);
                    if (!toolName) return;

                    const argsString = toolCallArgsBuffer.get(toolCallId) || '{}';
                    let args: Record<string, any> = {};
                    try {
                        args = JSON.parse(argsString);
                    } catch (e) {
                        console.error(`[McpMiddleware] Failed to parse args:`, argsString);
                    }

                    console.log(`[McpMiddleware] Executing pending tool: ${toolName}`);
                    const result = await this.executeTool(toolName, args);
                    const messageId = this.generateMessageId();

                    // Emit tool result event
                    const resultEvent: BaseEvent = {
                        type: EventType.TOOL_CALL_RESULT,
                        toolCallId,
                        messageId,
                        content: result,
                        role: 'tool',
                        timestamp: Date.now(),
                    } as any;

                    console.log(`[McpMiddleware] Emitting TOOL_CALL_RESULT for: ${toolName}`);
                    observer.next(resultEvent);

                    // Add tool result to messages for the next run
                    input.messages.push({
                        id: messageId,
                        role: 'tool',
                        toolCallId,
                        content: result,
                    } as any);

                    pendingMcpCalls.delete(toolCallId);
                });

                await Promise.all(callPromises);

                // Emit RUN_FINISHED before starting new run
                console.log(`[McpMiddleware] All MCP tools executed, emitting RUN_FINISHED`);
                observer.next({
                    type: EventType.RUN_FINISHED,
                    threadId: (input as any).threadId,
                    runId: (input as any).runId,
                    timestamp: Date.now(),
                } as any);

                // Trigger a new run to continue the conversation
                console.log(`[McpMiddleware] Triggering new run`);
                this.triggerNewRun(observer, input, next, toolCallArgsBuffer, toolCallNames, pendingMcpCalls);
            };

            const subscription = next.run(input).subscribe({
                next: (event: BaseEvent) => {
                    // Track tool call names from TOOL_CALL_START events
                    if (event.type === EventType.TOOL_CALL_START) {
                        const startEvent = event as any;
                        if (startEvent.toolCallId && startEvent.toolCallName) {
                            toolCallNames.set(startEvent.toolCallId, startEvent.toolCallName);
                            const isMcp = this.isMcpTool(startEvent.toolCallName);
                            console.log(`[McpMiddleware] TOOL_CALL_START: ${startEvent.toolCallName} (id: ${startEvent.toolCallId}, isMCP: ${isMcp})`);

                            if (isMcp) {
                                pendingMcpCalls.add(startEvent.toolCallId);
                            }
                        }
                    }

                    // Accumulate tool call arguments from TOOL_CALL_ARGS events
                    if (event.type === EventType.TOOL_CALL_ARGS) {
                        const argsEvent = event as any;
                        if (argsEvent.toolCallId && argsEvent.delta) {
                            const existing = toolCallArgsBuffer.get(argsEvent.toolCallId) || '';
                            toolCallArgsBuffer.set(argsEvent.toolCallId, existing + argsEvent.delta);
                        }
                    }

                    // Track TOOL_CALL_END
                    if (event.type === EventType.TOOL_CALL_END) {
                        const endEvent = event as ToolCallEndEvent;
                        const toolName = toolCallNames.get(endEvent.toolCallId);
                        console.log(`[McpMiddleware] TOOL_CALL_END: ${toolName ?? 'unknown'} (id: ${endEvent.toolCallId})`);
                    }

                    // Handle RUN_FINISHED - execute pending MCP tools
                    if (event.type === EventType.RUN_FINISHED) {
                        handleRunFinished(event);
                        return;
                    }

                    // Pass through all other events
                    observer.next(event);
                },
                error: (error) => {
                    observer.error(error);
                },
                complete: () => {
                    if (pendingMcpCalls.size === 0) {
                        observer.complete();
                    }
                },
            });

            return () => {
                subscription.unsubscribe();
            };
        });
    }

    private triggerNewRun(
        observer: Subscriber<BaseEvent>,
        input: RunAgentInput,
        next: AbstractAgent,
        toolCallArgsBuffer: Map<string, string>,
        toolCallNames: Map<string, string>,
        pendingMcpCalls: Set<string>,
    ): void {
        toolCallArgsBuffer.clear();
        toolCallNames.clear();
        pendingMcpCalls.clear();

        console.log(`[McpMiddleware] Starting new run with updated messages`);

        const subscription = next.run(input).subscribe({
            next: (event: BaseEvent) => {
                if (event.type === EventType.TOOL_CALL_START) {
                    const startEvent = event as any;
                    if (startEvent.toolCallId && startEvent.toolCallName) {
                        toolCallNames.set(startEvent.toolCallId, startEvent.toolCallName);
                        const isMcp = this.isMcpTool(startEvent.toolCallName);
                        console.log(`[McpMiddleware] TOOL_CALL_START: ${startEvent.toolCallName} (id: ${startEvent.toolCallId}, isMCP: ${isMcp})`);

                        if (isMcp) {
                            pendingMcpCalls.add(startEvent.toolCallId);
                        }
                    }
                }

                if (event.type === EventType.TOOL_CALL_ARGS) {
                    const argsEvent = event as any;
                    if (argsEvent.toolCallId && argsEvent.delta) {
                        const existing = toolCallArgsBuffer.get(argsEvent.toolCallId) || '';
                        toolCallArgsBuffer.set(argsEvent.toolCallId, existing + argsEvent.delta);
                    }
                }

                if (event.type === EventType.TOOL_CALL_END) {
                    const endEvent = event as ToolCallEndEvent;
                    const toolName = toolCallNames.get(endEvent.toolCallId);
                    console.log(`[McpMiddleware] TOOL_CALL_END: ${toolName ?? 'unknown'} (id: ${endEvent.toolCallId})`);
                }

                if (event.type === EventType.RUN_FINISHED) {
                    if (pendingMcpCalls.size > 0) {
                        console.log(`[McpMiddleware] RUN_FINISHED with ${pendingMcpCalls.size} pending calls, executing...`);
                        this.handlePendingCalls(observer, input, next, toolCallArgsBuffer, toolCallNames, pendingMcpCalls);
                    } else {
                        observer.next(event);
                        observer.complete();
                    }
                    return;
                }

                observer.next(event);
            },
            error: (error) => observer.error(error),
            complete: () => {
                if (pendingMcpCalls.size === 0) {
                    observer.complete();
                }
            },
        });
    }

    private async handlePendingCalls(
        observer: Subscriber<BaseEvent>,
        input: RunAgentInput,
        next: AbstractAgent,
        toolCallArgsBuffer: Map<string, string>,
        toolCallNames: Map<string, string>,
        pendingMcpCalls: Set<string>,
    ): Promise<void> {
        const callPromises = [...pendingMcpCalls].map(async (toolCallId) => {
            const toolName = toolCallNames.get(toolCallId);
            if (!toolName) return;

            const argsString = toolCallArgsBuffer.get(toolCallId) || '{}';
            let args: Record<string, any> = {};
            try {
                args = JSON.parse(argsString);
            } catch (e) {
                console.error(`[McpMiddleware] Failed to parse args:`, argsString);
            }

            console.log(`[McpMiddleware] Executing pending tool: ${toolName}`);
            const result = await this.executeTool(toolName, args);
            const messageId = this.generateMessageId();

            const resultEvent: BaseEvent = {
                type: EventType.TOOL_CALL_RESULT,
                toolCallId,
                messageId,
                content: result,
                role: 'tool',
                timestamp: Date.now(),
            } as any;

            console.log(`[McpMiddleware] Emitting TOOL_CALL_RESULT for: ${toolName}`);
            observer.next(resultEvent);

            input.messages.push({
                id: messageId,
                role: 'tool',
                toolCallId,
                content: result,
            } as any);

            pendingMcpCalls.delete(toolCallId);
        });

        await Promise.all(callPromises);

        console.log(`[McpMiddleware] Pending tools executed, emitting RUN_FINISHED`);
        observer.next({
            type: EventType.RUN_FINISHED,
            threadId: (input as any).threadId,
            runId: (input as any).runId,
            timestamp: Date.now(),
        } as any);

        console.log(`[McpMiddleware] Triggering new run`);
        this.triggerNewRun(observer, input, next, toolCallArgsBuffer, toolCallNames, pendingMcpCalls);
    }
}

/**
 * Factory function to create MCP middleware.
 *
 * This is a convenience wrapper around McpMiddleware that returns a function
 * compatible with the AG-UI middleware pattern.
 *
 * @param client - MCP client or MultiSessionClient
 * @param options - Configuration options
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * import { HttpAgent } from '@ag-ui/client';
 * import { createMcpMiddleware } from '@mcp-ts/sdk/adapters/agui-middleware';
 *
 * const agent = new HttpAgent({ url: 'http://localhost:8000/agent' });
 * agent.use(createMcpMiddleware(multiSessionClient, {
 *   toolPrefix: 'server-',
 *   actions: mcpActions,
 * }));
 * ```
 */
export function createMcpMiddleware(
    client: MCPClient | MultiSessionClient,
    options: { toolPrefix?: string; tools?: AguiTool[] } = {}
) {
    const middleware = new McpMiddleware({
        client,
        ...options,
    });

    return (input: RunAgentInput, next: AbstractAgent): Observable<BaseEvent> => {
        return middleware.run(input, next);
    };
}

// Legacy exports for backward compatibility
export { McpMiddleware as McpToolExecutorMiddleware };
export { createMcpMiddleware as createMcpToolMiddleware };

// Re-export types for convenience
export { Middleware, EventType };
export type { RunAgentInput, BaseEvent, AbstractAgent, ToolCallEndEvent };
