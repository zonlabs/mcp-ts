import type { Writable } from "node:stream";
import pc from "picocolors";
import { connectMcpEndpoint } from "../client.js";
import { benchmarkStrategies } from "../core.js";
import { writeLine } from "../ux.js";

export async function cmdBench(endpoint: string, output: Writable): Promise<void> {
  const client = await connectMcpEndpoint(endpoint);
  try {
    writeLine(output, pc.dim("Strategy  Tools  Estimated tokens"));
    for (const result of await benchmarkStrategies(client)) {
      writeLine(
        output,
        `${pc.bold(result.strategy.padEnd(8))}  ${String(result.exposedTools).padStart(5)}  ${String(result.estimatedTokens).padStart(16)}`,
      );
    }
  } finally {
    await client.close();
  }
}
