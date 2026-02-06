/**
 * AG-UI Middleware for MCP Tool Execution
 *
 * This middleware intercepts tool calls from remote agents and executes
 * MCP tools server-side, returning results back to the agent.
 *
 * @requires @ag-ui/client - Peer dependency for AG-UI types
 * @requires rxjs - Uses RxJS Observables for event streaming
 */

import { Observable, Subscriber } from 'rxjs';
import {
    Middleware,
    EventType,
    type AbstractAgent,
    type RunAgentInput,
    type BaseEvent,
    type ToolCallEndEvent,
    type Tool,
} from '@ag-ui/client';
import { type AguiTool, cleanSchema } from './agui-adapter.js';

/** New event type for MCP UI triggers */
export const MCP_APP_UI_EVENT = 'mcp-apps-ui';
/**
 * MCP Apps UI trigger event.
 *
 * IMPORTANT: This must be emitted as an AG-UI CustomEvent so subscribers
 * (e.g. CopilotKit `onCustomEvent`) can receive it.
 */
export interface McpAppUiEventPayload {
    toolCallId: string;
    resourceUri: string;
    sessionId?: string;
    toolName: string;
    result?: any;
}

/** Tool execution result for continuation */
interface ToolResult {
    toolCallId: string;
    toolName: string;
    result: string;
    /**
     * Raw result object (if available).
     * Used to preserve metadata (e.g. `_meta`) that is lost in the stringified `result`.
     */
    rawResult?: any;
    messageId: string;
}

/** State for tracking tool calls during a run */
interface RunState {
    toolCallArgsBuffer: Map<string, string>;
    toolCallNames: Map<string, string>;
    pendingMcpCalls: Set<string>;
    textContent?: string;
    error: boolean;
}

/**
 * Configuration for McpMiddleware
 */
export interface McpMiddlewareConfig {
    /** Pre-loaded tools with handlers (required) */
    tools: AguiTool[];
}

/**
 * AG-UI Middleware that executes MCP tools server-side.
 */
export class McpMiddleware extends Middleware {
    private tools: AguiTool[];
    private toolSchemas: Tool[];

    constructor(config: McpMiddlewareConfig) {
        super();
        this.tools = config.tools;
        this.toolSchemas = this.tools.map((t: AguiTool) => ({
            name: t.name,
            description: t.description,
            parameters: cleanSchema(t.parameters),
            _meta: t._meta, // Include _meta in the tool definition passed to the agent
        }));
    }

    /**
     * Extract base tool name from prefixed format for event emission
     * e.g., "tool_abc123_get-time" -> "get-time"
     */
    private getBaseToolName(toolName: string): string {
        const match = toolName.match(/^tool_[^_]+_(.+)$/);
        return match ? match[1] : toolName;
    }

    private isMcpTool(toolName: string): boolean {
        // Direct comparison - tool names should match as-is
        return this.tools.some(t => t.name === toolName);
    }

    private parseArgs(argsString: string): Record<string, any> {
        if (!argsString?.trim()) return {};

        try {
            return JSON.parse(argsString);
        } catch {
            // Handle duplicated JSON from streaming issues: {...}{...}
            const trimmed = argsString.trim();
            if (trimmed.includes('}{')) {
                const firstObject = trimmed.slice(0, trimmed.indexOf('}{') + 1);
                try {
                    return JSON.parse(firstObject);
                } catch {
                    console.error(`[McpMiddleware] Failed to parse JSON:`, firstObject);
                }
            }
            console.error(`[McpMiddleware] Failed to parse args:`, argsString);
            return {};
        }
    }

    private async executeTool(toolName: string, args: Record<string, any>): Promise<{ resultStr: string, rawResult?: any }> {
        const tool = this.tools.find(t => t.name === toolName);
        if (!tool?.handler) {
            return { resultStr: `Error: Tool ${tool ? 'has no handler' : 'not found'}: ${toolName}` };
        }

        try {
            // Result can be a string (legacy) or an object (MCP Result with content array)
            const result = await tool.handler(args);

            let resultStr: string;

            if (typeof result === 'string') {
                resultStr = result;
            } else if (result && typeof result === 'object') {
                // Determine if we should preserve the object structure (e.g. for MCP Tool Results)
                resultStr = JSON.stringify(result);
            } else {
                resultStr = String(result);
            }

            return { resultStr, rawResult: result };
        } catch (error: any) {
            console.error(`[McpMiddleware] Error executing tool:`, error);
            return { resultStr: `Error: ${error.message || String(error)}` };
        }
    }

    private generateId(prefix: string): string {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }

    private ensureIds(input: RunAgentInput): void {
        const anyInput = input as any;
        if (!anyInput.threadId) anyInput.threadId = this.generateId('mcp_thread');
        if (!anyInput.runId) anyInput.runId = this.generateId('mcp_run');
    }

    /** Process tool call events and update state */
    private handleToolCallEvent(event: BaseEvent, state: RunState): void {
        const { toolCallArgsBuffer, toolCallNames, pendingMcpCalls } = state;

        // Accumulate text content for reconstruction
        if (event.type === EventType.TEXT_MESSAGE_CHUNK) {
            const e = event as any;
            if (e.delta) {
                state.textContent = (state.textContent || '') + e.delta;
            }
        }

        if (event.type === EventType.TOOL_CALL_START) {
            const e = event as any;
            if (e.toolCallId && e.toolCallName) {
                toolCallNames.set(e.toolCallId, e.toolCallName);
                if (this.isMcpTool(e.toolCallName)) {
                    pendingMcpCalls.add(e.toolCallId);
                }
            }
        }

        if (event.type === EventType.TOOL_CALL_ARGS) {
            const e = event as any;
            if (e.toolCallId && e.delta) {
                const existing = toolCallArgsBuffer.get(e.toolCallId) || '';
                toolCallArgsBuffer.set(e.toolCallId, existing + e.delta);
            }
        }

        if (event.type === EventType.TOOL_CALL_END) {
            // Track tool call end event
        }

        // Workaround: Extract parallel tool calls from MESSAGES_SNAPSHOT
        if (event.type === EventType.MESSAGES_SNAPSHOT) {
            const messages = (event as any).messages || [];
            if (messages.length > 0) {
                const lastMsg = messages[messages.length - 1];
                // Update text content from snapshot if available (often more reliable)
                if (lastMsg.role === 'assistant' && lastMsg.content) {
                    state.textContent = lastMsg.content;
                }

                // Discover tools
                for (let i = messages.length - 1; i >= 0; i--) {
                    const msg = messages[i];
                    const tools = Array.isArray(msg.toolCalls) ? msg.toolCalls :
                        (Array.isArray(msg.tool_calls) ? msg.tool_calls : []);

                    if (msg.role === 'assistant' && tools.length > 0) {
                        for (const tc of tools) {
                            if (tc.id && tc.function?.name && !toolCallNames.has(tc.id)) {
                                toolCallNames.set(tc.id, tc.function.name);
                                toolCallArgsBuffer.set(tc.id, tc.function.arguments || '{}');
                                if (this.isMcpTool(tc.function.name)) {
                                    pendingMcpCalls.add(tc.id);
                                }
                            }
                        }
                        break;
                    }
                }
            }
        }
    }

    /** Execute pending MCP tools and return results */
    private async executeTools(state: RunState): Promise<ToolResult[]> {
        const { toolCallArgsBuffer, toolCallNames, pendingMcpCalls } = state;
        const results: ToolResult[] = [];

        const promises = [...pendingMcpCalls].map(async (toolCallId) => {
            const toolName = toolCallNames.get(toolCallId);
            if (!toolName) return;

            const args = this.parseArgs(toolCallArgsBuffer.get(toolCallId) || '{}');
            const { resultStr, rawResult } = await this.executeTool(toolName, args);
            results.push({
                toolCallId,
                toolName,
                result: resultStr,
                rawResult,
                messageId: this.generateId('mcp_result'),
            });
            pendingMcpCalls.delete(toolCallId);
        });

        await Promise.all(promises);
        return results;
    }

    private emitToolResults(observer: Subscriber<BaseEvent>, results: ToolResult[]): void {
        for (const { toolCallId, toolName, result, rawResult, messageId } of results) {
            // UI metadata may appear either on the tool CALL result (rawResult._meta)
            // or only on the tool DEFINITION (listTools result). We support both.
            const toolDef = this.tools.find(t => t.name === toolName);
            const sessionId = toolDef?._meta?.sessionId;
            const resourceUri =
                rawResult?._meta?.ui?.resourceUri ??
                rawResult?._meta?.['ui/resourceUri'] ??
                toolDef?._meta?.ui?.resourceUri ??
                toolDef?._meta?.['ui/resourceUri'];

            if (resourceUri) {
                // Extract base name for event emission to match metadata
                const baseToolName = this.getBaseToolName(toolName);

                const payload: McpAppUiEventPayload = {
                    toolCallId,
                    resourceUri,
                    sessionId,
                    toolName: baseToolName, // Use base name to match metadata
                    result: rawResult ?? result,
                };

                observer.next({
                    type: EventType.CUSTOM,
                    name: MCP_APP_UI_EVENT,
                    value: payload,
                    timestamp: Date.now(),
                    role: 'tool',
                } as any);
            }

            observer.next({
                type: EventType.TOOL_CALL_RESULT,
                toolCallId,
                messageId,
                content: result,
                role: 'tool',
                timestamp: Date.now(),
            } as any);
        }
    }

    run(input: RunAgentInput, next: AbstractAgent): Observable<BaseEvent> {
        return new Observable<BaseEvent>((observer: Subscriber<BaseEvent>) => {
            const state: RunState = {
                toolCallArgsBuffer: new Map(),
                toolCallNames: new Map(),
                pendingMcpCalls: new Set(),
                textContent: '',
                error: false,
            };

            this.ensureIds(input);
            const anyInput = input as any;

            // Inject MCP tools
            if (this.toolSchemas?.length) {
                input.tools = [...(input.tools || []), ...this.toolSchemas];
            }

            const handleRunFinished = async () => {
                if (state.error) return; // Don't continue after error

                if (state.pendingMcpCalls.size === 0) {
                    observer.next({
                        type: EventType.RUN_FINISHED,
                        threadId: anyInput.threadId,
                        runId: anyInput.runId,
                        timestamp: Date.now(),
                    } as any);
                    observer.complete();
                    return;
                }

                // Reconstruct the Assistant Message that triggered these tools
                const toolCalls = [];
                for (const toolCallId of state.pendingMcpCalls) {
                    const name = state.toolCallNames.get(toolCallId);
                    const args = state.toolCallArgsBuffer.get(toolCallId) || '{}';
                    if (name) {
                        toolCalls.push({
                            id: toolCallId,
                            type: 'function',
                            function: { name, arguments: args }
                        });
                    }
                }

                // Add the Assistant Message to history FIRST
                if (toolCalls.length > 0 || state.textContent) {
                    const assistantMsg = {
                        id: this.generateId('msg_ast'),
                        role: 'assistant',
                        content: state.textContent || null, // Ensure null if empty string for strict LLMs
                        tool_calls: toolCalls.length > 0 ? toolCalls : undefined
                    };
                    input.messages.push(assistantMsg as any);
                }

                // Execute tools and emit results (no RUN_FINISHED yet - continuation follows)
                const results = await this.executeTools(state);
                this.emitToolResults(observer, results);

                // Add tool result messages to history
                for (const { toolCallId, result, messageId } of results) {
                    input.messages.push({
                        id: messageId,
                        role: 'tool',
                        tool_call_id: toolCallId,
                        content: result,
                    } as any);
                }

                // Reset state for next turn
                state.toolCallArgsBuffer.clear();
                state.toolCallNames.clear();
                state.textContent = ''; // Clear text content for next turn

                anyInput.runId = this.generateId('mcp_run');

                // Subscribe to continuation
                next.run(input).subscribe({
                    next: (event) => {
                        if (state.error) return;

                        this.handleToolCallEvent(event, state);

                        if (event.type === EventType.RUN_ERROR) {
                            state.error = true;
                            observer.next(event);
                            observer.complete();
                            return;
                        }

                        if (event.type === EventType.RUN_STARTED) {
                            return;
                        }

                        if (event.type === EventType.RUN_FINISHED) {
                            if (state.pendingMcpCalls.size > 0) {
                                handleRunFinished();
                            } else {
                                observer.next(event);
                                observer.complete();
                            }
                            return;
                        }
                        observer.next(event);
                    },
                    error: (err) => {
                        state.error = true;
                        observer.error(err);
                    },
                    complete: () => {
                        if (!state.error && state.pendingMcpCalls.size === 0) observer.complete();
                    },
                });
            };

            const subscription = next.run(input).subscribe({
                next: (event) => {
                    if (state.error) return;

                    this.handleToolCallEvent(event, state);

                    if (event.type === EventType.RUN_ERROR) {
                        state.error = true;
                        observer.next(event);
                        observer.complete();
                        return;
                    }

                    if (event.type === EventType.RUN_FINISHED) {
                        handleRunFinished();
                        return;
                    }
                    observer.next(event);
                },
                error: (err) => {
                    state.error = true;
                    observer.error(err);
                },
                complete: () => {
                    if (!state.error && state.pendingMcpCalls.size === 0) observer.complete();
                },
            });

            return () => subscription.unsubscribe();
        });
    }
}

/**
 * Factory function to create MCP middleware.
 */
export function createMcpMiddleware(options: { tools: AguiTool[] }) {
    const middleware = new McpMiddleware(options);
    return (input: RunAgentInput, next: AbstractAgent): Observable<BaseEvent> => {
        return middleware.run(input, next);
    };
}

// Legacy exports
export { McpMiddleware as McpToolExecutorMiddleware };
export { createMcpMiddleware as createMcpToolMiddleware };

// Re-exports
export { Middleware, EventType };
export type { RunAgentInput, BaseEvent, AbstractAgent, ToolCallEndEvent, Tool };
