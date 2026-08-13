import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/device.ts"],
  format: ["esm"],
  clean: true,
  dts: true,
  platform: "neutral",
  target: "es2022",
  bundle: true,
  minify: false,
  sourcemap: true,
  external: [
    "@cloudflare/workers-oauth-provider",
    "@modelcontextprotocol/server",
    "zod",
    "cloudflare:workers",
  ],
  config: false,
});
