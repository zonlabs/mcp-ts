import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", "bin/mcp-ts": "src/bin/mcp-ts.ts" },
  format: ["esm"],
  clean: true,
  dts: { resolve: ["@mcp-ts/bridge-protocol"] },
  platform: "node",
  target: "node20",
  bundle: true,
  noExternal: ["@mcp-ts/bridge-protocol"],
  minify: false,
  sourcemap: true,
  external: ["@mcp-ts/client", "@modelcontextprotocol/client", "@modelcontextprotocol/server"]
});
