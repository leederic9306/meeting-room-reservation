import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  outDir: 'dist',
  outExtension({ format }) {
    // ESM: .mjs, CJS: .js (package.json exports 와 일치)
    return { js: format === 'esm' ? '.mjs' : '.js' };
  },
});
