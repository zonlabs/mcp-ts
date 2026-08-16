import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const bundledPackages = ["@mcp-ts/bridge-protocol", "@mcp-ts/tool-router"] as const;

async function distributableFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? distributableFiles(path) : [path];
    }),
  );
  return files.flat().filter((path) => path.endsWith(".js") || path.endsWith(".d.ts"));
}

describe("published CLI package", () => {
  test("bundles internal packages without runtime dependencies", async () => {
    const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    expect(packageJson.dependencies).not.toHaveProperty("@mcp-ts/client");
    for (const packageName of bundledPackages) {
      expect(packageJson.dependencies).not.toHaveProperty(packageName);
      expect(packageJson.devDependencies).toHaveProperty(packageName);
    }

    const dist = new URL("../dist", import.meta.url);
    const files = await distributableFiles(fileURLToPath(dist));
    const contents = await Promise.all(files.map((path) => readFile(path, "utf8")));
    for (const packageName of bundledPackages) {
      expect(contents.join("\n")).not.toContain(packageName);
    }
  });
});
