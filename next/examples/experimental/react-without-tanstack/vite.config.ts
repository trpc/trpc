import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {
  defineConfig,
  type Plugin,
  type PreviewServer,
  type ViteDevServer,
} from 'vite-plus';

/** Serves the router at `/trpc` from Vite's dev and preview servers. */
function trpcServer(): Plugin {
  const mount = async (server: ViteDevServer | PreviewServer) => {
    const app = await import('./server.ts');
    const trpc = await app.trpcMiddleware();
    server.middlewares.use(trpc.middleware);
    server.httpServer?.once('close', () => void trpc.close());
  };
  return {
    name: 'trpc-server',
    configureServer: mount,
    configurePreviewServer: mount,
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), trpcServer()],
  test: {
    environment: 'happy-dom',
    // The test server listens on another port than happy-dom's page.
    environmentOptions: {
      happyDOM: { settings: { fetch: { disableSameOriginPolicy: true } } },
    },
  },
});
