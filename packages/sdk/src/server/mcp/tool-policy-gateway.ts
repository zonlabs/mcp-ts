import type { Tool, ListToolsResult, CallToolResult, Implementation } from "@modelcontextprotocol/client";
import type { ToolClient } from '../../shared/types.js';
import { sessions } from '../storage/index.js';
import type { Session } from '../storage/types.js';
import { assertToolAllowed, filterToolsByPolicy } from '../storage/tool-policy.js';

/**
 * Internal shape expected from the underlying MCP client.
 * Extends `ToolClient` with the raw `fetchTools` / `listTools` / `callTool`
 * methods so the gateway can fetch unfiltered results and apply policy on top.
 */
type RawToolClient = ToolClient & {
    fetchTools(): Promise<Tool[]>;
    listTools(): Promise<{ tools: Tool[] }>;
    callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult>;
    getServerInfo?(): Implementation | undefined;
};

/**
 * A thin policy-enforcement layer that wraps a raw `MCPClient`.
 *
 * Every public method on this class loads the current session's `toolPolicy`
 * from the session store and uses it to filter or guard tool access before
 * delegating to the underlying client.
 *
 * This keeps security logic in one place and prevents agents from calling
 * tools that a user has explicitly blocked via the management UI.
 */
export class ToolPolicyGateway implements ToolClient {
    constructor(
        private readonly userId: string,
        private readonly sessionId: string,
        private readonly client: RawToolClient
    ) {}

    /**
     * Returns whether the underlying MCP client transport is currently connected.
     */
    isConnected(): boolean {
        return this.client.isConnected();
    }

    /**
     * Returns the server ID from the underlying client, if available.
     */
    getServerId(): string | undefined {
        return this.client.getServerId?.();
    }

    /**
     * Returns the full server metadata from the underlying client, if available.
     * Includes name, version, icons, title, description, and website URL.
     * Available only after the client has connected and completed initialization.
     */
    getServerInfo(): Implementation | undefined {
        return this.client.getServerInfo?.();
    }

    /**
     * Returns the human-readable server name from the underlying client, if available.
     */
    getServerName(): string | undefined {
        return this.client.getServerName?.();
    }

    /**
     * Returns the server URL from the underlying client, if available.
     */
    getServerUrl(): string | undefined {
        return this.client.getServerUrl?.();
    }

    /**
     * Returns the session ID — prefers the value reported by the underlying
     * client, falling back to the one injected at construction time.
     */
    getSessionId(): string {
        return this.client.getSessionId?.() ?? this.sessionId;
    }

    /**
     * Returns the list of tools for the current session.
     *
     * By default, this returns the **complete, unfiltered** list of tools from
     * the remote server, bypassing any tool-access policy. Pass
     * `{ filtered: true }` to apply the session's `toolPolicy` and **exclude**
     * tools that the policy denies.
     *
     * Internally calls `client.fetchTools()` (which is cache-backed) so no
     * extra network round-trip is incurred when called after `fetchTools()`.
     *
     * @param options.filtered - When `true`, apply the policy filter.
     *                           Defaults to `false`.
     * @returns A `ListToolsResult` containing the matching tools.
     */
    async listTools(options?: { filtered?: boolean }): Promise<ListToolsResult> {
        if (options?.filtered) {
            const session = await this.getSession();
            const allTools = await this.client.fetchTools();
            return { tools: this.filterTools(session, allTools) } as ListToolsResult;
        }
        const tools = await this.client.fetchTools();
        return { tools } as ListToolsResult;
    }

    /**
     * Executes a tool call on the remote server after verifying that the tool
     * is permitted by the current session's policy.
     *
     * @param name - The exact tool name to invoke.
     * @param args - Key/value arguments to pass to the tool.
     * @returns The tool's `CallToolResult`.
     * @throws {Error} When the tool is blocked by the session's policy.
     * @throws {Error} When the session does not exist in the store.
     */
    async callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
        const session = await this.getSession();
        this.assertAllowed(session, name);
        return await this.client.callTool(name, args);
    }

    /**
     * Filters a raw tools array down to only those permitted by the session's
     * `toolPolicy`.
     *
     * @param session - The session whose policy should be applied.
     * @param tools   - The unfiltered list of tools from the remote server.
     * @returns A subset of `tools` that the policy allows.
     */
    filterTools(session: Session, tools: Tool[]): Tool[] {
        return filterToolsByPolicy(tools, session.toolPolicy, this.getPolicyServerId(session));
    }

    /**
     * Throws if `toolName` is blocked by the session's policy.
     * Call this before proxying a `callTool` request to the remote server.
     *
     * @param session  - The session whose policy should be enforced.
     * @param toolName - The tool being invoked.
     * @throws {Error} When the tool is not permitted.
     */
    assertAllowed(session: Session, toolName: string): void {
        assertToolAllowed(session.toolPolicy, toolName, this.getPolicyServerId(session));
    }

    /**
     * Loads the session from the store and throws if it does not exist.
     *
     * @returns The fully-hydrated `Session` record.
     * @throws {Error} When the session cannot be found.
     */
    private async getSession(): Promise<Session> {
        const session = await sessions.get(this.userId, this.sessionId);
        if (!session) {
            throw new Error('Session not found');
        }
        return session;
    }

    /**
     * Resolves the server ID to use when evaluating tool policy.
     * Prefers the value from the live client (most accurate) and falls back
     * to the server ID stored on the session record.
     */
    private getPolicyServerId(session: Session): string | undefined {
        return this.client.getServerId?.() ?? session.serverId;
    }
}

/**
 * Factory function that creates a `ToolPolicyGateway` for a specific session.
 *
 * Prefer this over constructing `ToolPolicyGateway` directly — it keeps call
 * sites concise and makes it easier to swap the implementation in tests.
 *
 * @param userId    - The owner of the session (used for storage lookups).
 * @param sessionId - The session to enforce policy for.
 * @param client    - The raw MCP client that the gateway wraps.
 * @returns A fully configured `ToolPolicyGateway` instance.
 */
export function createToolPolicyGateway(
    userId: string,
    sessionId: string,
    client: RawToolClient
): ToolPolicyGateway {
    return new ToolPolicyGateway(userId, sessionId, client);
}
