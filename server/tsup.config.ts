import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // The shared package ships TypeScript source, so it must be compiled INTO the
  // bundle. Left external, Node would try to `import` a .ts file at runtime.
  noExternal: ['@shop/shared'],
});
