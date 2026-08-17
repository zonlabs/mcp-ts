import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  clean: true,
  dts: true,
  platform: "neutral",
  target: "es2022",
  bundle: true,
  sourcemap: true,
});
