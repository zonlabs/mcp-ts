import type { CatalogSnapshot } from "@mcp-ts/bridge-protocol";
import type { BridgeSessionEnv } from "../durable-objects/bridge-session";

type BridgeCatalogRpc = {
  publishRemoteCatalog(catalog: CatalogSnapshot): Promise<void>;
};

export async function publishRemoteCatalogForUser(
  env: Record<string, unknown> | undefined,
  userId: string,
  catalog: CatalogSnapshot,
): Promise<void> {
  const namespace = (env as unknown as BridgeSessionEnv | undefined)?.BRIDGE_SESSION;
  if (!namespace) return;
  const stub = namespace.get(namespace.idFromName(userId)) as unknown as BridgeCatalogRpc;
  await stub.publishRemoteCatalog(catalog);
}
