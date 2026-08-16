import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    sse: 'src/client/index.ts',
    react: 'src/client/react/index.ts',
    vue: 'src/client/vue/index.ts',
    shared: 'src/shared/index.ts',
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
    'react-dom',
    'vue',
    'ioredis',
    '@modelcontextprotocol/client',
    '@neondatabase/serverless',
    'fs',
    'path',
    'rxjs',
    '@ag-ui/client',
    'pkce-challenge',
  ],
  noExternal: ['@modelcontextprotocol/ext-apps'],
  // Platform-specific bundles
  platform: 'node',
  target: 'es2020',
  // Preserve module structure for better tree-shaking
  bundle: true,
  minify: false,
  shims: true,
});
