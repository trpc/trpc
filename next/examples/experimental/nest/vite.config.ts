import { defineConfig } from 'vite-plus';

// Node's type stripping can't run decorators, so the server is bundled first.
// Workspace packages are bundled too; node_modules stay external.
export default defineConfig({
  build: {
    ssr: 'src/main.ts',
    outDir: 'dist',
    target: 'node24',
    sourcemap: true,
  },
});
