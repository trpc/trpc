import { runInNewContext } from 'node:vm'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core/virtual-modules'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { DEV_CLIENT_ENTRY, START_ENVIRONMENT_NAMES } from '../src/constants'
import { startManifestPlugin } from '../src/vite/start-manifest-plugin/plugin'

vi.mock('@tanstack/start-server-core/virtual-modules', () => ({
  VIRTUAL_MODULES: {
    startManifest: 'tanstack-start-manifest:v',
  },
}))

describe('startManifestPlugin', () => {
  afterEach(() => vi.unstubAllGlobals())

  test.each([false, true])(
    'captures inline CSS according to the resolved config (%s)',
    (enabled) => {
      vi.stubGlobal('TSS_ROUTES_MANIFEST', { __root__: {} })
      const plugins = startManifestPlugin({
        getConfig: () =>
          ({
            resolvedStartConfig: { basePaths: { publicBase: '/assets' } },
            startConfig: { server: { build: { inlineCss: { enabled } } } },
          }) as any,
      }) as Array<any>
      const capture = plugins.find(
        (item) =>
          item.name === 'tanstack-start:start-manifest-capture-client-build',
      )!
      capture.generateBundle.call(
        { environment: { name: START_ENVIRONMENT_NAMES.client } },
        {},
        {
          'entry.js': {
            type: 'chunk',
            fileName: 'entry.js',
            isEntry: true,
            imports: [],
            dynamicImports: [],
            moduleIds: [],
            viteMetadata: { importedCss: new Set(['root.css']) },
          },
          'root.css': {
            type: 'asset',
            name: 'root.css',
            fileName: 'root.css',
            source: new TextEncoder().encode('.root{color:red}'),
          },
        },
      )
      const plugin = plugins.find(
        (item) => item.name === 'tanstack-start:start-manifest-plugin',
      )!
      const resolvedId = plugin.resolveId.handler(VIRTUAL_MODULES.startManifest)
      const manifest = plugin.load.handler.call(
        {
          environment: {
            name: START_ENVIRONMENT_NAMES.server,
            config: { command: 'build', build: {} },
          },
        },
        resolvedId,
      )

      expect(manifest).toContain('/assets/root.css')
      expect(manifest.includes('.root{color:red}')).toBe(enabled)
    },
  )

  test('uses the virtual client entry during unbundled dev', () => {
    expect(loadDevManifest({ bundledDev: false })).toContain(
      `src: '/@id/${DEV_CLIENT_ENTRY}'`,
    )
  })

  test.each(['/', '/base/'])(
    'loads the bundled runtime before hydration under %s',
    (basePath) => {
      const source = loadDevManifest({
        bundledDev: true,
        basePath,
      })
      const manifest = runInNewContext(
        `${source.replace('export const', 'const')}; tsrStartManifest()`,
      )
      const entries = [
        `${basePath}bundledDevClient.mjs`,
        `${basePath}assets/index.js`,
      ]
      expect(manifest.routes.__root__.preloads).toEqual(entries)
      expect(manifest.routes.__root__.scripts).toEqual(
        entries.map((src) => ({
          attrs: { type: 'module', async: false, src },
        })),
      )
    },
  )
})

function loadDevManifest(opts: { bundledDev: boolean; basePath?: string }) {
  const basePath = opts.basePath ?? '/'
  const plugins = startManifestPlugin({
    getConfig: () =>
      ({
        resolvedStartConfig: {
          basePaths: {
            publicBase: basePath,
          },
        },
      }) as any,
  }) as Array<any>
  const capture = plugins.find(
    (item) =>
      item.name === 'tanstack-start:start-manifest-capture-client-build',
  )!
  capture.configureServer({
    config: { base: basePath },
    environments: {
      [START_ENVIRONMENT_NAMES.client]: {
        bundledDev: opts.bundledDev ? {} : undefined,
      },
    },
  })
  const plugin = plugins.find(
    (item) => item.name === 'tanstack-start:start-manifest-plugin',
  )!
  const resolvedId = plugin.resolveId.handler(VIRTUAL_MODULES.startManifest)

  return plugin.load.handler.call(
    {
      environment: {
        name: START_ENVIRONMENT_NAMES.server,
        config: {
          command: 'serve',
          environments: {
            [START_ENVIRONMENT_NAMES.client]: {
              isBundled: opts.bundledDev,
            },
          },
        },
      },
    },
    resolvedId,
  )
}
