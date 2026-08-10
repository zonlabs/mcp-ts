import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/server/index.ts",
  ],
  format: ["esm"],
  clean: true,
  dts: true,
  platform: "node",
  target: "node18",
  bundle: true,
  minify: false,
  sourcemap: true,
  external: ["isolated-vm", "quickjs-emscripten", "@modelcontextprotocol/client", "zod", "ai"],
  config: false
});
