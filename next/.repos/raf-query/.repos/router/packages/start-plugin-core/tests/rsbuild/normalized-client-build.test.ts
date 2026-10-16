import { describe, expect, test, vi } from 'vitest'
import {
  normalizeRspackClientBuild,
  registerClientBuildCapture,
} from '../../src/rsbuild/normalized-client-build'
import { buildStartManifest } from '../../src/start-manifest-plugin/manifestBuilder'
import type { RsbuildPluginAPI, Rspack } from '@rsbuild/core'
import type { GetConfigFn } from '../../src/types'

function makeCompilation(readCss: () => string | Uint8Array) {
  const entryChunk = {
    name: 'index',
    files: new Set(['index.js', 'root.css']),
    auxiliaryFiles: new Set(),
    groupsIterable: new Set(),
  }
  const routeChunk = {
    files: new Set(['posts.js']),
    auxiliaryFiles: new Set(['posts.css']),
    groupsIterable: new Set(),
  }
  const getAssets = () => [
    { name: 'root.css', source: { source: readCss } },
    { name: 'posts.css', source: { source: readCss } },
  ]
  const compilation = {
    entrypoints: new Map([['index', { chunks: [entryChunk] }]]),
    chunks: new Set([entryChunk, routeChunk]),
    chunkGraph: {
      getChunkModules: (chunk: unknown) =>
        chunk === routeChunk
          ? [
              {
                identifier: () => '/routes/posts.tsx?tsr-split=component',
                nameForCondition: () => '/routes/posts.tsx',
              },
            ]
          : [],
    },
    getAssets,
  } as unknown as Rspack.Compilation
  return compilation
}

// Rspack reports module paths using the OS native separator on Windows
// (e.g. `C:\app\src\routes\posts.tsx`), while the generated route tree always
// records `filePath` with POSIX separators. This compilation mimics that
// Windows output so we can verify the route still keys its chunk correctly.
function makeWindowsCompilation(readCss: () => string | Uint8Array) {
  const entryChunk = {
    name: 'index',
    files: new Set(['index.js', 'root.css']),
    auxiliaryFiles: new Set(),
    groupsIterable: new Set(),
  }
  const routeChunk = {
    files: new Set(['posts.js']),
    auxiliaryFiles: new Set(['posts.css']),
    groupsIterable: new Set(),
  }
  const getAssets = () => [
    { name: 'root.css', source: { source: readCss } },
    { name: 'posts.css', source: { source: readCss } },
  ]
  const compilation = {
    entrypoints: new Map([['index', { chunks: [entryChunk] }]]),
    chunks: new Set([entryChunk, routeChunk]),
    chunkGraph: {
      getChunkModules: (chunk: unknown) =>
        chunk === routeChunk
          ? [
              {
                identifier: () =>
                  'builtin:swc-loader??ruleSet[0]!C:\\app\\src\\routes\\posts.tsx?tsr-split=component',
                nameForCondition: () => 'C:\\app\\src\\routes\\posts.tsx',
              },
            ]
          : [],
    },
    getAssets,
  } as unknown as Rspack.Compilation
  return compilation
}

describe('normalizeRspackClientBuild', () => {
  test('keeps route stylesheet links with inline CSS disabled by default', () => {
    const compilation = makeCompilation(() => '.card{color:red}')
    const clientBuild = normalizeRspackClientBuild(compilation)
    const manifest = buildStartManifest({
      clientBuild,
      routeTreeRoutes: {
        __root__: {},
        '/posts': { filePath: '/routes/posts.tsx' },
      },
      basePath: '/assets',
    })

    expect(manifest.routes.__root__?.css).toEqual(['/assets/root.css'])
    expect(manifest.routes['/posts']?.css).toEqual(['/assets/posts.css'])
    expect(manifest.inlineCss).toBeUndefined()
  })

  test.each([
    { action: 'build', enabled: false, captureCss: false },
    { action: 'build', enabled: true, captureCss: true },
    { action: 'dev', enabled: false, captureCss: false },
    { action: 'dev', enabled: true, captureCss: false },
  ])(
    'captures inline CSS according to the action and resolved config ($action, $enabled)',
    ({ action, enabled, captureCss }) => {
      const compilation = makeCompilation(() =>
        Buffer.from('.card{background:url(./dot.svg)}'),
      )
      const processAssets = vi.fn<RsbuildPluginAPI['processAssets']>()
      const getConfig = () => ({
        startConfig: { server: { build: { inlineCss: { enabled } } } },
      })
      const { getClientBuild } = registerClientBuildCapture(
        { context: { action }, processAssets } as unknown as RsbuildPluginAPI,
        getConfig as unknown as GetConfigFn,
      )

      const [, capture] = processAssets.mock.calls[0]!
      capture({ compilation } as Parameters<typeof capture>[0])

      const clientBuild = getClientBuild()!
      const manifest = buildStartManifest({
        clientBuild,
        routeTreeRoutes: {
          __root__: {},
          '/posts': { filePath: '/routes/posts.tsx' },
        },
        basePath: '/assets',
        inlineCss: { enabled: captureCss, transformAssets: false },
      })

      expect(manifest.routes.__root__?.css).toEqual(['/assets/root.css'])
      expect(manifest.routes['/posts']?.css).toEqual(['/assets/posts.css'])
      if (captureCss) {
        expect(manifest.inlineCss?.styles).toEqual({
          '/assets/root.css': '.card{background:url(/assets/dot.svg)}',
          '/assets/posts.css': '.card{background:url(/assets/dot.svg)}',
        })
      } else {
        expect(manifest.inlineCss).toBeUndefined()
      }
    },
  )

  test('keys the route chunk by a POSIX path when rspack reports OS native module paths', () => {
    const compilation = makeWindowsCompilation(() => '.card{color:red}')
    const clientBuild = normalizeRspackClientBuild(compilation)

    expect(
      clientBuild.chunksByFileName.get('posts.js')?.routeFilePaths,
    ).toEqual(['C:/app/src/routes/posts.tsx'])
  })

  test('gives a route its stylesheet and preload when rspack reports OS native module paths', () => {
    const compilation = makeWindowsCompilation(() => '.card{color:red}')
    const clientBuild = normalizeRspackClientBuild(compilation)
    const manifest = buildStartManifest({
      clientBuild,
      routeTreeRoutes: {
        __root__: {},
        '/posts': { filePath: 'C:/app/src/routes/posts.tsx' },
      },
      basePath: '/assets',
    })

    expect(manifest.routes['/posts']?.css).toEqual(['/assets/posts.css'])
    expect(manifest.routes['/posts']?.preloads).toEqual(['/assets/posts.js'])
  })
})
