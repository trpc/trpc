import { isRunnableDevEnvironment } from 'vite'
import { NodeRequest, sendNodeResponse } from 'srvx/node'
import { ENTRY_POINTS, VITE_ENVIRONMENT_NAMES } from '../../constants'
import { ensureLatestClientBuild } from '../bundled-dev'
import {
  captureBundledDevStyles,
  collectBundledDevStyles,
  collectDevStyles,
  fetchCssFromModule,
} from './dev-styles'
import type { Connect, DevEnvironment, PluginOption } from 'vite'
import type { GetConfigFn } from '../../types'

export function devServerPlugin({
  getConfig: _getConfig,
  devSsrStylesEnabled,
  installDevServerMiddleware,
}: {
  getConfig: GetConfigFn
  devSsrStylesEnabled: boolean
  installDevServerMiddleware: boolean | undefined
}): PluginOption {
  let isTest = false
  let bundledDev = false
  let bundledStyles: ReturnType<typeof captureBundledDevStyles> | undefined

  return [
    {
      name: 'tanstack-start-core:dev-server',
      perEnvironmentWatchChangeDuringDev: true,
      config(_userConfig, { mode }) {
        isTest = isTest ? isTest : mode === 'test'
      },
      configEnvironment(name, _config, { command }) {
        if (
          command === 'serve' &&
          devSsrStylesEnabled &&
          name === VITE_ENVIRONMENT_NAMES.client
        ) {
          // Bundled dev needs code-split CSS before a browser requests chunks.
          // Declare this even if a later config hook enables bundled dev.
          return {
            build: {
              rolldownOptions: {
                experimental: { devMode: { lazy: false } },
              },
            },
          }
        }
        return undefined
      },
      configResolved(config) {
        bundledDev =
          config.command === 'serve' && !!config.experimental.bundledDev
      },
      generateBundle() {
        if (
          bundledDev &&
          devSsrStylesEnabled &&
          this.environment.name === VITE_ENVIRONMENT_NAMES.client
        ) {
          bundledStyles = captureBundledDevStyles(
            this,
            this.environment.config.root,
          )
        }
      },
      watchChange: {
        order: 'post',
        sequential: true,
        handler(id) {
          if (
            bundledDev &&
            this.environment.name === VITE_ENVIRONMENT_NAMES.server &&
            this.environment.mode === 'dev'
          ) {
            // Vite skips server HMR hooks in bundled dev. Invalidate changed
            // transforms before notifying local or external SSR module runners.
            this.environment.moduleGraph.onFileChange(id)
            this.environment.hot.send({ type: 'full-reload', triggeredBy: id })
          }
        },
      },
      configureServer(viteDevServer) {
        if (isTest) {
          return
        }

        const clientEnv =
          viteDevServer.environments[VITE_ENVIRONMENT_NAMES.client]

        // CSS middleware registered in PRE-PHASE (before Vite's internal middlewares)
        // This ensures it handles /@tanstack-start/styles.css before any catch-all middleware
        // from other plugins (like nitro) that may be registered in the post-phase.
        // This makes the CSS endpoint work regardless of plugin order in the Vite config.
        // We check pathname.endsWith() to handle basepaths (e.g., /my-app/@tanstack-start/styles.css)
        // since pre-phase runs before Vite's base middleware strips the basepath.
        if (devSsrStylesEnabled) {
          viteDevServer.middlewares.use(async (req, res, next) => {
            const url = req.url ?? ''
            const pathname = url.split('?')[0]
            if (!pathname?.endsWith('/@tanstack-start/styles.css')) {
              return next()
            }

            try {
              // Parse route IDs from query param
              const urlObj = new URL(url, 'http://localhost')
              const routesParam = urlObj.searchParams.get('routes')
              const ids = routesParam ? routesParam.split(',') : []

              // Build entries list from route file paths
              const entries: Array<string> = []

              // Look up route file paths from manifest
              // Only routes registered in the manifest are used - this prevents path injection
              const routesManifest = (globalThis as any).TSS_ROUTES_MANIFEST as
                | Record<string, { filePath: string; children?: Array<string> }>
                | undefined

              if (routesManifest && ids.length > 0) {
                for (const routeId of ids) {
                  const route = routesManifest[routeId]
                  if (route?.filePath) {
                    entries.push(route.filePath)
                  }
                }
              }

              let css = ''
              if (entries.length > 0) {
                if (bundledDev) {
                  // Wait for the bundled client's completed graph without
                  // starting Vite's separate normal client container.
                  await ensureLatestClientBuild(clientEnv)
                  css = collectBundledDevStyles(bundledStyles, entries) ?? ''
                } else {
                  css =
                    (await collectDevStyles({
                      serverEnvironment:
                        viteDevServer.environments[
                          VITE_ENVIRONMENT_NAMES.server
                        ],
                      rootDirectory: viteDevServer.config.root,
                      entries,
                      loadCssContents: (url) =>
                        fetchCssFromModule(
                          viteDevServer.environments[
                            VITE_ENVIRONMENT_NAMES.client
                          ],
                          url,
                        ),
                    })) ?? ''
                }
              }

              res.setHeader('Content-Type', 'text/css')
              res.setHeader('Cache-Control', 'no-store')
              res.end(css)
            } catch (e) {
              // Log error but still return valid CSS response to avoid MIME type issues
              console.error('[tanstack-start] Error collecting dev styles:', e)
              res.setHeader('Content-Type', 'text/css')
              res.setHeader('Cache-Control', 'no-store')
              res.end(
                `/* Error collecting styles: ${e instanceof Error ? e.message : String(e)} */`,
              )
            }
          })
        }

        if (viteDevServer.config.experimental.bundledDev) {
          // Vite's bundled dev client watches sources separately, but Start still
          // needs the SSR environment's module graph to see route/server edits.
          viteDevServer.watcher.add(viteDevServer.config.root)
        }

        return () => {
          const serverEnv = viteDevServer.environments[
            VITE_ENVIRONMENT_NAMES.server
          ] as DevEnvironment | undefined

          if (!serverEnv) {
            throw new Error(
              `Server environment ${VITE_ENVIRONMENT_NAMES.server} not found`,
            )
          }

          const installMiddleware = installDevServerMiddleware
          if (installMiddleware === false) {
            return
          }
          if (installMiddleware == undefined) {
            // do not install middleware in middlewareMode by default
            if (viteDevServer.config.server.middlewareMode) {
              return
            }

            // do not install middleware if SSR env in case another plugin already did
            if (
              !isRunnableDevEnvironment(serverEnv) ||
              // do not check via `isFetchableDevEnvironment` since nitro does implement the `FetchableDevEnvironment` interface but not via inheritance (which this helper checks)
              'dispatchFetch' in serverEnv
            ) {
              return
            }
          }

          if (!isRunnableDevEnvironment(serverEnv)) {
            throw new Error(
              'cannot install vite dev server middleware for TanStack Start since the SSR environment is not a RunnableDevEnvironment',
            )
          }
          viteDevServer.middlewares.use(async (req, res) => {
            // fix the request URL to match the original URL
            // otherwise, the request URL will '/index.html'
            if (req.originalUrl) {
              req.url = req.originalUrl
            }
            const webReq = new NodeRequest({ req, res })

            try {
              const serverRunner = serverEnv.runner

              // Import and resolve the request by running the server request entry point
              // this request entry point must implement the `fetch` API as follows:
              /**
               * export default {
               *  fetch(req: Request): Promise<Response>
               * }
               */
              if (viteDevServer.config.experimental.bundledDev) {
                await ensureLatestClientBuild(clientEnv)
              }

              const serverEntry = await serverRunner.import(ENTRY_POINTS.server)
              const webRes = await serverEntry['default'].fetch(webReq)

              return sendNodeResponse(res, webRes)
            } catch (e) {
              console.error(e)
              try {
                viteDevServer.ssrFixStacktrace(e as Error)
              } catch {}

              if (
                webReq.headers.get('content-type')?.includes('application/json')
              ) {
                return sendNodeResponse(
                  res,
                  new Response(
                    JSON.stringify(
                      {
                        status: 500,
                        error: 'Internal Server Error',
                        message:
                          'An unexpected error occurred. Please try again later.',
                        timestamp: new Date().toISOString(),
                      },
                      null,
                      2,
                    ),
                    {
                      status: 500,
                      headers: {
                        'Content-Type': 'application/json',
                      },
                    },
                  ),
                )
              }

              return sendNodeResponse(
                res,
                new Response(
                  `
              <!DOCTYPE html>
              <html lang="en">
                <head>
                  <meta charset="UTF-8" />
                  <title>Error</title>
                  <script type="module">
                    import { ErrorOverlay } from '/@vite/client'
                    document.body.appendChild(new ErrorOverlay(${JSON.stringify(
                      prepareError(req, e),
                    ).replace(/</g, '\\u003c')}))
                  </script>
                </head>
                <body>
                </body>
              </html>
            `,
                  {
                    status: 500,
                    headers: {
                      'Content-Type': 'text/html',
                    },
                  },
                ),
              )
            }
          })
        }
      },
    },
  ]
}

/**
 * Formats error for SSR message in error overlay
 * @param req
 * @param error
 * @returns
 */
function prepareError(req: Connect.IncomingMessage, error: unknown) {
  const e = error as Error
  return {
    message: `An error occurred while server rendering ${req.url}:\n\n\t${
      typeof e === 'string' ? e : e.message
    } `,
    stack: typeof e === 'string' ? '' : e.stack,
  }
}
