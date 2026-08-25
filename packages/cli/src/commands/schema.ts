import type { Writable } from "node:stream";
import { withGatewayClient } from "../gateway/command-client.js";
import { fetchGatewayToolSchemas, resolveGatewayToolId } from "../gateway/meta-tools.js";
import { writeLine } from "../ux.js";

export async function cmdLocalSchema(
  names: string[],
  output: Pick<Writable, "write">,
): Promise<void> {
  await withGatewayClient(
    { onWarning: (message) => writeLine(output, message) },
    async (client) => {
      const toolIds = await Promise.all(
        names.map((name) => name.includes("::") ? name : resolveGatewayToolId(client, name)),
      );
      const results = await fetchGatewayToolSchemas(client, toolIds);
      writeLine(output, JSON.stringify(names.length === 1 ? results[0] : results, null, 2));
    },
  );
}
