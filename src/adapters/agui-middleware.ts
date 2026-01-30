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

/** Tool execution result for continuation */
interface ToolResult {
    toolCallId: string;
    toolName: string;
    result: string;
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
    /** Max result length in chars (default: 50000) */
    maxResultLength?: number;
}

/**
 * AG-UI Middleware that executes MCP tools server-side.
 */
export class McpMiddleware extends Middleware {
    private tools: AguiTool[];
    private toolSchemas: Tool[];
    private maxResultLength: number;

    constructor(config: McpMiddlewareConfig) {
        super();
        this.tools = config.tools;
        this.maxResultLength = config.maxResultLength ?? 50000;
        this.toolSchemas = this.tools.map((t: AguiTool) => ({
            name: t.name,
            description: t.description,
            parameters: cleanSchema(t.parameters),
        }));
    }

    private isMcpTool(toolName: string): boolean {
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

    private async executeTool(toolName: string, args: Record<string, any>): Promise<string> {
        const tool = this.tools.find(t => t.name === toolName);
        if (!tool?.handler) {
            return `Error: Tool ${tool ? 'has no handler' : 'not found'}: ${toolName}`;
        }

        try {
            console.log(`[McpMiddleware] Executing tool: ${toolName}`, args);
            const result = await tool.handler(args);
            let resultStr = typeof result === 'string' ? result : JSON.stringify(result);

            if (resultStr.length > this.maxResultLength) {
                const original = resultStr.length;
                resultStr = resultStr.slice(0, this.maxResultLength) +
                    `\n\n[... Truncated from ${original} to ${this.maxResultLength} chars]`;
                console.log(`[McpMiddleware] Tool result truncated from ${original} to ${this.maxResultLength} chars`);
            }

            console.log(`[McpMiddleware] Tool result:`, resultStr.slice(0, 200));
            return resultStr;
        } catch (error: any) {
            console.error(`[McpMiddleware] Error executing tool:`, error);
            return `Error: ${error.message || String(error)}`;
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
                console.log(`[McpMiddleware] TOOL_CALL_START: ${e.toolCallName} (id: ${e.toolCallId}, isMCP: ${this.isMcpTool(e.toolCallName)})`);
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
            const e = event as ToolCallEndEvent;
            console.log(`[McpMiddleware] TOOL_CALL_END: ${toolCallNames.get(e.toolCallId) ?? 'unknown'} (id: ${e.toolCallId})`);
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
                                    console.log(`[McpMiddleware] MESSAGES_SNAPSHOT: Discovered ${tc.function.name} (id: ${tc.id})`);
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
            console.log(`[McpMiddleware] Executing pending tool: ${toolName}`);

            const result = await this.executeTool(toolName, args);
            results.push({
                toolCallId,
                toolName,
                result,
                messageId: this.generateId('mcp_result'),
            });
            pendingMcpCalls.delete(toolCallId);
        });

        await Promise.all(promises);
        return results;
    }

    /** Emit tool results (without RUN_FINISHED - that's emitted when truly done) */
    private emitToolResults(observer: Subscriber<BaseEvent>, results: ToolResult[]): void {
        for (const { toolCallId, toolName, result, messageId } of results) {
            observer.next({
                type: EventType.TOOL_CALL_RESULT,
                toolCallId,
                messageId,
                content: result,
                role: 'tool',
                timestamp: Date.now(),
            } as any);
            console.log(`[McpMiddleware] Emitting TOOL_CALL_RESULT for: ${toolName}`);
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

            console.log(`[McpMiddleware] === NEW RUN ===`);
            console.log(`[McpMiddleware] threadId: ${anyInput.threadId}, runId: ${anyInput.runId}`);
            console.log(`[McpMiddleware] messages: ${input.messages?.length ?? 0}, tools: ${this.tools?.length ?? 0}`);

            // Inject MCP tools
            if (this.toolSchemas?.length) {
                input.tools = [...(input.tools || []), ...this.toolSchemas];
                console.log(`[McpMiddleware] Injected ${this.toolSchemas.length} tools:`, this.toolSchemas.map((t: Tool) => t.name));
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

                console.log(`[McpMiddleware] RUN_FINISHED with ${state.pendingMcpCalls.size} pending calls`);

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
                    console.log(`[McpMiddleware] Added assistant message to history before tools: ${state.textContent?.slice(0, 50)}... [${toolCalls.length} tools]`);
                }

                // Execute tools and emit results (no RUN_FINISHED yet - continuation follows)
                const results = await this.executeTools(state);
                this.emitToolResults(observer, results);

                // Prepare continuation
                console.log(`[McpMiddleware] Triggering continuation with ${results.length} results`);

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
                console.log(`[McpMiddleware] === CONTINUATION RUN === messages: ${input.messages.length}`);

                // Subscribe to continuation
                next.run(input).subscribe({
                    next: (event) => {
                        if (state.error) return;

                        this.handleToolCallEvent(event, state);

                        if (event.type === EventType.RUN_ERROR) {
                            console.log(`[McpMiddleware] RUN_ERROR received in continuation`);
                            state.error = true;
                            observer.next(event);
                            observer.complete();
                            return;
                        }

                        if (event.type === EventType.RUN_STARTED) {
                            console.log(`[McpMiddleware] Filtering RUN_STARTED from continuation`);
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
                        console.log(`[McpMiddleware] RUN_ERROR received`);
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
export function createMcpMiddleware(
    options: { tools: AguiTool[]; maxResultLength?: number }
) {
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
