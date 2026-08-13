import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  clean: true,
  dts: false,
  platform: "node",
  target: "node20",
  bundle: true,
  minify: false,
  sourcemap: true,
  external: [
    "@modelcontextprotocol/client",
    "@modelcontextprotocol/server",
    "zod",
    "ws",
  ],
  config: false,
});
