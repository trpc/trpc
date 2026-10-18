import { defineConfig } from 'vite-plus';

// Node's type stripping can't run decorators, so the Nest modules are compiled
// to dist/app.module.js; server.ts, client.ts and start.ts run as they are.
// Workspace packages are bundled too; node_modules stay external.
export default defineConfig({
  build: {
    ssr: 'src/app.module.ts',
    outDir: 'dist',
    target: 'node24',
    sourcemap: true,
  },
});
