import { MultiSessionClient } from "@mcp-ts/sdk/server";
import type { McpObservabilityEvent } from "@mcp-ts/sdk/server";

function handleObservability(event: McpObservabilityEvent): void {
  if (event.type === "db:read" || event.type === "db:write") {
    console.log(`[mcp-db][${event.type}] ${event.message} ${event.payload?.durationMs?.toFixed?.(1) ?? ""}ms`);
    return;
  }

  const prefix = event.serverId ? `[${event.serverId}]` : "[mcp]";
  const msg = event.message ?? "";
  switch (event.level) {
    case "error":
      console.error(`${prefix} ${msg}`);
      break;
    case "warn":
      console.warn(`${prefix} ${msg}`);
      break;
    default:
      console.log(`${prefix} ${msg}`);
  }
}

export async function getMultiSessionClient(userId: string): Promise<MultiSessionClient> {
  const client = new MultiSessionClient(userId, {
    onObservabilityEvent: handleObservability,
  });
  await client.connect();
  return client;
}

export function invalidateMultiSessionClient(_userId: string): void {}

export function invalidateAllMultiSessionClients(): void {}

export function closeAllCachedClients(): void {}

export const resetMultiSessionClientRegistryForTests = closeAllCachedClients;

export async function removeCachedSession(_userId: string, _sessionId: string): Promise<void> {}
