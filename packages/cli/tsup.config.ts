import { defineConfig } from "tsup";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

export default defineConfig({
  entry: { index: "src/index.ts", "bin/mcp-ts": "src/bin/mcp-ts.ts" },
  format: ["esm"],
  clean: true,
  dts: { resolve: ["@mcp-ts/bridge-protocol", "@mcp-ts/tool-router"] },
  platform: "node",
  target: "node20",
  bundle: true,
  noExternal: ["@mcp-ts/bridge-protocol", "@mcp-ts/tool-router"],
  minify: false,
  sourcemap: true,
  external: ["@mcp-ts/client", "@modelcontextprotocol/client", "@modelcontextprotocol/server", "ai"],
  define: { __CLI_VERSION__: JSON.stringify(packageJson.version) },
});
