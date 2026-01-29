import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'server/index': 'src/server/index.ts',
    'client/index': 'src/client/index.ts',
    'client/react': 'src/client/react/index.ts',
    'client/vue': 'src/client/vue/index.ts',
    'shared/index': 'src/shared/index.ts',
    'adapters/ai-adapter': 'src/adapters/ai-adapter.ts',
    'adapters/langchain-adapter': 'src/adapters/langchain-adapter.ts',
    'adapters/mastra-adapter': 'src/adapters/mastra-adapter.ts',
    'adapters/agui-adapter': 'src/adapters/agui-adapter.ts',
    'adapters/agui-middleware': 'src/adapters/agui-middleware.ts',
  },
  format: ['cjs', 'esm'],
  dts: {
    compilerOptions: {
      skipLibCheck: true,
      skipDefaultLibCheck: true,
    },
  },
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: [
    'react',
    'vue',
    'ioredis',
    '@modelcontextprotocol/sdk',
    'fs',
    'path',
    'rxjs',
    '@ag-ui/client',
  ],
  // Platform-specific bundles
  platform: 'neutral',
  target: 'es2020',
  // Preserve module structure for better tree-shaking
  bundle: true,
  minify: false,
});
