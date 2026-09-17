import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(import.meta.dirname, 'client'),
  // The vendored generator is CommonJS and linked from a local file package.
  // Vite otherwise treats linked packages as source and serves raw `require()`
  // calls to the browser during development instead of pre-bundling them.
  optimizeDeps: { include: ['logic-puzzle-generator'] },
  build: {
    outDir: resolve(import.meta.dirname, 'dist/client'),
    emptyOutDir: false,
  },
});
