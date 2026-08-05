import type { Tool } from "@modelcontextprotocol/client";
import type { ToolPolicy } from './types.js';

/**
 * Raw, unvalidated shape of a tool policy as it may arrive from an external
 * source (HTTP request body, database read, etc.). All fields are typed as
 * `unknown` so callers are forced to pass through one of the `normalize*`
 * helpers before using the value as a `ToolPolicy`.
 */
export type ToolPolicyInput = {
    mode?: unknown;
    toolIds?: unknown;
    updatedAt?: unknown;
} | null | undefined;

/**
 * Constructs the canonical tool ID string used throughout the policy system.
 *
 * Tool IDs combine the server ID and the tool name with a `::` separator so
 * they are globally unique across all connected MCP servers:
 * ```
 * "mn0v3pfwwbxv::delete_mcp_server"
 * ```
 *
 * @param serverId  - The short server identifier (e.g. `"mn0v3pfwwbxv"`).
 * @param toolName  - The exact tool name as reported by the remote server.
 * @returns A namespaced tool ID string.
 */
export function createToolId(serverId: string, toolName: string): string {
    return `${serverId}::${toolName}`;
}

/**
 * Coerces an arbitrary value into a deduplicated array of trimmed, non-empty
 * strings. Returns an empty array for any non-array or invalid input.
 *
 * @param input - Raw value to normalise (typically from user input or a DB read).
 * @returns A clean `string[]` with duplicates and blank entries removed.
 */
function normalizeToolIds(input?: unknown): string[] {
    if (!Array.isArray(input)) return [];

    return Array.from(new Set(
        input
            .filter((id): id is string => typeof id === 'string')
            .map((id) => id.trim())
            .filter(Boolean)
    ));
}

/**
 * Converts a raw, potentially untrusted `ToolPolicyInput` into a validated
 * `ToolPolicy` object, or `undefined` if the input is absent / malformed.
 *
 * - Invalid `mode` values fall back to `"all"` (no restrictions).
 * - Invalid `updatedAt` values fall back to `now`.
 * - `"all"` mode always produces an empty `toolIds` array regardless of input.
 * - An empty `toolIds` array in `"denylist"` or `"allowlist"` mode is normalised
 *   to `"all"` because clearing all selections in the UI implies no restriction
 *   intent. An empty allowlist ("block everything") is still available through
 *   the denylist path (all tools checked as denied).
 *
 * @param input - Raw policy data to normalise (from request body, DB, etc.).
 * @param now   - Unix timestamp used as the fallback for `updatedAt`. Defaults to `Date.now()`.
 * @returns A well-formed `ToolPolicy`, or `undefined` if `input` is absent.
 */
export function normalizeToolPolicy(input?: ToolPolicyInput, now = Date.now()): ToolPolicy | undefined {
    if (!input || typeof input !== 'object') {
        return undefined;
    }

    const mode = input.mode === 'allowlist' || input.mode === 'denylist'
        ? input.mode
        : 'all';
    const updatedAt = typeof input.updatedAt === 'number' && Number.isFinite(input.updatedAt)
        ? input.updatedAt
        : now;

    const toolIds = normalizeToolIds(input.toolIds);

    if (mode === 'all' || toolIds.length === 0) {
        return { mode: 'all', toolIds: [], updatedAt };
    }

    return { mode, toolIds, updatedAt };
}

/**
 * Same as `normalizeToolPolicy` but guaranteed to return a `ToolPolicy`.
 * Falls back to an unrestricted `{ mode: "all" }` policy when the input is
 * absent or invalid.
 *
 * Use this variant when a policy is required (e.g. when persisting an update)
 * rather than when reading an optional policy from the session store.
 *
 * @param input - Raw policy data to normalise.
 * @param now   - Unix timestamp used as the fallback for `updatedAt`. Defaults to `Date.now()`.
 * @returns A well-formed `ToolPolicy`, never `undefined`.
 */
export function normalizeToolPolicyForUpdate(input: ToolPolicyInput, now = Date.now()): ToolPolicy {
    return normalizeToolPolicy(input, now) ?? { mode: 'all', toolIds: [], updatedAt: now };
}

/**
 * Determines whether a specific tool is permitted under the given policy.
 *
 * | Policy mode  | Allowed when…                                    |
 * |--------------|--------------------------------------------------|
 * | `"all"`      | Always (no restrictions).                        |
 * | `"allowlist"`| The tool's ID is present in `policy.toolIds`.    |
 * | `"denylist"` | The tool's ID is **not** in `policy.toolIds`.    |
 *
 * Returns `false` when the policy requires a `serverId` for ID construction
 * but none is provided (fail-safe / deny by default).
 *
 * @param policy   - The active tool policy, or `undefined` for unrestricted access.
 * @param toolName - The tool name to check (as reported by the remote server).
 * @param serverId - The server that owns the tool (required for `allowlist`/`denylist`).
 * @returns `true` if the tool is allowed, `false` otherwise.
 */
export function isToolAllowed(policy: ToolPolicy | undefined, toolName: string, serverId?: string): boolean {
    if (!policy || policy.mode === 'all') return true;
    if (!serverId) return false;

    const toolId = createToolId(serverId, toolName);
    if (policy.mode === 'allowlist') {
        return policy.toolIds.includes(toolId);
    }

    return !policy.toolIds.includes(toolId);
}

/**
 * Asserts that a tool call is permitted under the current session policy.
 * Throws a descriptive error if the tool is blocked — call this inside
 * `ToolPolicyGateway.callTool` before proxying the request to the remote server.
 *
 * @param policy   - The active tool policy, or `undefined` for unrestricted access.
 * @param toolName - The tool being invoked.
 * @param serverId - The server that owns the tool.
 * @throws {Error} When the tool is not permitted by the policy.
 */
export function assertToolAllowed(policy: ToolPolicy | undefined, toolName: string, serverId?: string): void {
    if (isToolAllowed(policy, toolName, serverId)) return;
    const mode = policy?.mode === "denylist" ? "denylist" : policy?.mode === "allowlist" ? "allowlist" : "policy";
    throw new Error(`Tool "${toolName}" was blocked by your MCP tool access policy (${mode}).`);
}

/**
 * Returns the subset of `tools` that are permitted under the given policy.
 *
 * When no policy is set (or mode is `"all"`), the original array is returned
 * unchanged (no copy is made). Otherwise each tool is tested with
 * `isToolAllowed` and only the passing tools are included.
 *
 * @param tools    - The full, unfiltered list of tools from the remote server.
 * @param policy   - The active tool policy, or `undefined` for unrestricted access.
 * @param serverId - The server that owns the tools (required for `allowlist`/`denylist`).
 * @returns A filtered array containing only the permitted tools.
 */
export function filterToolsByPolicy<T extends Pick<Tool, 'name'>>(
    tools: T[],
    policy: ToolPolicy | undefined,
    serverId?: string
): T[] {
    if (!policy || policy.mode === 'all') return tools;
    return tools.filter((tool) => isToolAllowed(policy, tool.name, serverId));
}

/**
 * Validates that every tool ID referenced in a policy actually exists on the
 * connected MCP server. Throws if any ID is unknown.
 *
 * This prevents silent misconfigurations where a user accidentally saves a
 * policy referencing a tool that no longer exists (e.g. after a server update).
 *
 * @param policy   - The policy to validate (skipped for `"all"` mode).
 * @param tools    - The authoritative list of tools from the remote server.
 * @param serverId - Required to construct tool IDs for comparison.
 * @throws {Error} When `serverId` is missing and the policy is not `"all"`.
 * @throws {Error} When the policy contains tool IDs not present in `tools`.
 */
export function validateToolPolicyAgainstTools(
    policy: ToolPolicy,
    tools: Array<Pick<Tool, 'name'>>,
    serverId?: string
): void {
    if (policy.mode === 'all') return;
    if (!serverId) {
        throw new Error('Cannot validate MCP tool policy without a serverId');
    }

    const availableIds = new Set(tools.map((tool) => createToolId(serverId, tool.name)));
    const unknownIds = policy.toolIds.filter((id) => !availableIds.has(id));
    if (unknownIds.length > 0) {
        throw new Error(`Unknown tool id(s) for this MCP session: ${unknownIds.join(', ')}`);
    }
}
