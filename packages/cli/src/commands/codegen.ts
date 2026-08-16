import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { connectRemote } from "../client.js";
import { generateWrappers } from "../core.js";
import { success } from "../ux.js";

export async function cmdCodegen(endpoint: string, outPath: string): Promise<void> {
  const client = await connectRemote(endpoint);
  try {
    const { tools } = await client.listTools();
    const target = resolve(outPath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, generateWrappers(tools), "utf8");
    success(`Generated ${tools.length} tool wrappers in ${target}`);
  } finally {
    await client.close();
  }
}
