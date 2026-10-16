import type { FetchModuleOptions, Plugin } from 'vite'

/**
 * Stop Vite from inlining source maps into the server-side modules of `blume dev`.
 *
 * Vite's module runner evaluates every page module of the Node `prerender`
 * environment (and the workerd `ssr` one) from a code string that carries its
 * whole source map as a base64 data URL, and turns on Node's own source-map
 * support, which parses and caches each of those maps for the life of the
 * process. On these docs that is most of the dev server's memory: a page with
 * twoslash blocks compiles to a module of several megabytes of highlighted HTML,
 * so every page visited kept tens of megabytes alive — around 3 GB of heap after
 * a full crawl, past the ~2 GB Node allows by default on an 8 GB machine.
 *
 * Without the inline copy the module graph still holds each transform's map, and
 * Astro's error overlay maps server stack traces through it
 * (`ssrFixStacktrace`), so errors still point at the source line.
 */
export function serverSourcemapsPlugin(): Plugin {
  return {
    name: 'orpc:server-sourcemaps',
    apply: 'serve',
    configureServer(server) {
      for (const environment of Object.values(server.environments)) {
        // The browser fetches its modules (and their maps) over HTTP instead.
        if (environment.name === 'client') {
          continue
        }

        // Runners reach this method through the environment's invoke handler. It
        // forwards its options to Vite's `fetchModule`, which reads
        // `inlineSourceMap` although the method's own type leaves it out.
        const fetchModule: (id: string, importer: string | undefined, options: FetchModuleOptions) => ReturnType<typeof environment.fetchModule>
          = environment.fetchModule.bind(environment)
        environment.fetchModule = (id, importer, options) =>
          fetchModule(id, importer, { ...options, inlineSourceMap: false })
      }
    },
  }
}
