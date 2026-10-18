import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import solid from 'vite-plugin-solid';
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

/**
 * vite-plugin-solid adds `@testing-library/jest-dom` to the tests' setup
 * files whenever Node resolves it, from any `node_modules` above; these tests
 * don't use it.
 */
const noJestDom: Plugin = {
  name: 'no-jest-dom',
  config(config) {
    if (config.test) config.test.setupFiles = [];
  },
};

export default defineConfig((env) => ({
  plugins: [
    solid({ include: 'src/solid/**' }),
    noJestDom,
    svelte({ configFile: false }),
    tailwindcss(),
    trpcServer(),
  ],
  // Solid and Svelte resolve to server builds under Node's conditions; the
  // tests render in happy-dom, so they need the browser builds.
  ...(env.mode === 'test' && {
    resolve: { conditions: ['browser', 'development'] },
  }),
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        vue: 'vue.html',
        solid: 'solid.html',
        svelte: 'svelte.html',
      },
    },
  },
  test: {
    name: 'framework-matrix',
    environment: 'happy-dom',
    // The test server listens on another port than happy-dom's page.
    environmentOptions: {
      happyDOM: { settings: { fetch: { disableSameOriginPolicy: true } } },
    },
    server: {
      deps: {
        inline: [
          'solid-js',
          '@tanstack/solid-query',
          'svelte',
          '@tanstack/svelte-query',
        ],
      },
    },
  },
}));
