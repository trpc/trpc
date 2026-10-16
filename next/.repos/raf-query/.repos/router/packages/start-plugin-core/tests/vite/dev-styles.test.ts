import { describe, expect, test } from 'vitest'
import {
  collectDevStyles,
  fetchCssFromModule,
} from '../../src/vite/dev-server-plugin/dev-styles'
import type { EnvironmentModuleNode } from 'vite'

function createCssNode(url: string, css: string): EnvironmentModuleNode {
  return {
    url,
    file: `/app${url}`,
    importedModules: new Set(),
    transformResult: {
      code: `const __vite__css = ${JSON.stringify(css)}`,
    },
  } as EnvironmentModuleNode
}

function createEntryNode(
  url: string,
  depUrl: string | Array<string>,
): EnvironmentModuleNode {
  return {
    url,
    file: `/app${url}`,
    importedModules: new Set(),
    transformResult: {
      deps: Array.isArray(depUrl) ? depUrl : [depUrl],
    },
  } as EnvironmentModuleNode
}

describe('collectDevStyles', () => {
  test('recognizes virtual Vue style blocks by URL', async () => {
    const styleUrl = '/src/App.vue?vue&type=style&index=0&lang.css'
    const entry = createEntryNode('/src/entry.tsx', styleUrl)
    const vueStyle = createCssNode(styleUrl, '.vue-style {}')
    vueStyle.file = '/app/src/App.vue'
    const importedCss = createCssNode('/src/imported.css', '.imported {}')
    vueStyle.transformResult!.deps = [importedCss.url]
    vueStyle.importedModules.add(importedCss)
    const modules = new Map(
      [entry, vueStyle, importedCss].map((node) => [node.url, node]),
    )
    const environment = {
      moduleGraph: {
        async getModuleByUrl(url: string) {
          return modules.get(url)
        },
      },
      async transformRequest() {
        return null
      },
    }

    const css = await collectDevStyles({
      serverEnvironment: environment,
      rootDirectory: '/app',
      entries: ['/app/src/entry.tsx'],
      loadCssContents: (url) => fetchCssFromModule(environment, url),
    })

    expect(css).toContain(`/* ${styleUrl} */`)
    expect(css).toContain('.vue-style {}')
    expect(css).not.toContain('/* /src/imported.css */')
  })

  test('does not traverse dependencies of CSS files', async () => {
    const entry = createEntryNode('/src/entry.tsx', '/src/importer.css')
    const importerCss = createCssNode(
      '/src/importer.css',
      '.dep-imported {}\n.module-imported {}\n.importer {}',
    )
    const depImportedCss = createCssNode(
      '/src/dep-imported.css',
      '.dep-imported {}',
    )
    const moduleImportedCss = createCssNode(
      '/src/module-imported.css',
      '.module-imported {}',
    )
    importerCss.transformResult!.deps = [depImportedCss.url]
    importerCss.importedModules.add(moduleImportedCss)
    const modules = new Map(
      [entry, importerCss, depImportedCss, moduleImportedCss].map((node) => [
        node.url,
        node,
      ]),
    )
    const environment = {
      moduleGraph: {
        async getModuleByUrl(url: string) {
          return modules.get(url)
        },
      },
      async transformRequest() {
        return null
      },
    }

    const css = await collectDevStyles({
      serverEnvironment: environment,
      rootDirectory: '/app',
      entries: ['/app/src/entry.tsx'],
      loadCssContents: (url) => fetchCssFromModule(environment, url),
    })

    expect(css).toContain('/* /src/importer.css */')
    expect(css).not.toContain('/* /src/dep-imported.css */')
    expect(css).not.toContain('/* /src/module-imported.css */')
  })

  test('loads CSS modules from the client environment', async () => {
    const serverEntry = createEntryNode(
      '/src/entry.tsx',
      '/src/route.module.css',
    )
    const serverCssModule = createCssNode(
      '/src/route.module.css',
      '.server-transform {}',
    )
    const clientCssModule = createCssNode(
      '/src/route.module.css',
      '.client-transform {}',
    )
    const serverModules = new Map(
      [serverEntry, serverCssModule].map((node) => [node.url, node]),
    )
    const clientModules = new Map([[clientCssModule.url, clientCssModule]])
    const serverEnvironment = {
      moduleGraph: {
        async getModuleByUrl(url: string) {
          return serverModules.get(url)
        },
      },
      async transformRequest() {
        return null
      },
    }
    const clientEnvironment = {
      moduleGraph: {
        async getModuleByUrl(url: string) {
          return clientModules.get(url)
        },
      },
      async transformRequest() {
        return null
      },
    }

    const css = await collectDevStyles({
      serverEnvironment,
      rootDirectory: '/app',
      entries: ['/app/src/entry.tsx'],
      loadCssContents: (url) => fetchCssFromModule(clientEnvironment, url),
    })

    expect(css).toContain('.client-transform {}')
    expect(css).not.toContain('.server-transform {}')
  })

  test('traverses code-split modules that are only in importedModules', async () => {
    const entry = createEntryNode('/src/entry.tsx', [])
    const splitModule = createEntryNode(
      '/src/entry.tsx?tsr-split=component',
      '/src/code-split.css',
    )
    const splitCss = createCssNode('/src/code-split.css', '.code-split {}')
    entry.importedModules.add(splitModule)
    const modules = new Map(
      [entry, splitModule, splitCss].map((node) => [node.url, node]),
    )
    const environment = {
      moduleGraph: {
        async getModuleByUrl(url: string) {
          return modules.get(url)
        },
      },
      async transformRequest() {
        return null
      },
    }

    const css = await collectDevStyles({
      serverEnvironment: environment,
      rootDirectory: '/app',
      entries: ['/app/src/entry.tsx'],
      loadCssContents: (url) => fetchCssFromModule(environment, url),
    })

    expect(css).toContain('/* /src/code-split.css */')
    expect(css?.match(/\.code-split \{\}/g)).toHaveLength(1)
  })

  test('preserves entry order when graph lookups finish out of order', async () => {
    const rootEntry = createEntryNode('/src/root.tsx', '/src/root.css')
    const routeEntry = createEntryNode('/src/route.tsx', '/src/route.css')
    const rootCss = createCssNode('/src/root.css', '.root {}')
    const routeCss = createCssNode('/src/route.css', '.route {}')

    const modules = new Map(
      [rootEntry, routeEntry, rootCss, routeCss].map((node) => [
        node.url,
        node,
      ]),
    )
    const moduleGraph = {
      async getModuleByUrl(url: string) {
        if (url === rootEntry.url) {
          await new Promise((resolve) => setTimeout(resolve, 20))
        }
        return modules.get(url)
      },
    }
    const environment = {
      moduleGraph,
      async transformRequest() {
        return null
      },
    }
    const css = await collectDevStyles({
      serverEnvironment: environment,
      rootDirectory: '/app',
      entries: ['/app/src/root.tsx', '/app/src/route.tsx'],
      loadCssContents: (url) => fetchCssFromModule(environment, url),
    })

    expect(css).toBeDefined()
    expect(css!.indexOf('/* /src/root.css */')).toBeLessThan(
      css!.indexOf('/* /src/route.css */'),
    )
  })

  test('preserves dependency order while resolving dependencies in parallel', async () => {
    const entry = createEntryNode('/src/entry.tsx', [
      '/src/first.css',
      '/src/second.css',
    ])
    const firstCss = createCssNode('/src/first.css', '.first {}')
    const secondCss = createCssNode('/src/second.css', '.second {}')
    const modules = new Map(
      [entry, firstCss, secondCss].map((node) => [node.url, node]),
    )

    let firstLookupFinished = false
    let secondStartedBeforeFirstFinished = false
    const moduleGraph = {
      async getModuleByUrl(url: string) {
        if (url === firstCss.url && !firstLookupFinished) {
          await new Promise((resolve) => setTimeout(resolve, 20))
          firstLookupFinished = true
        }
        if (url === secondCss.url && !firstLookupFinished) {
          secondStartedBeforeFirstFinished = true
        }
        return modules.get(url)
      },
    }
    const environment = {
      moduleGraph,
      async transformRequest() {
        return null
      },
    }
    const css = await collectDevStyles({
      serverEnvironment: environment,
      rootDirectory: '/app',
      entries: ['/app/src/entry.tsx'],
      loadCssContents: (url) => fetchCssFromModule(environment, url),
    })

    expect(secondStartedBeforeFirstFinished).toBe(true)
    expect(css).toContain('/* /src/first.css */')
    expect(css).toContain('/* /src/second.css */')
    expect(css!.indexOf('/* /src/first.css */')).toBeLessThan(
      css!.indexOf('/* /src/second.css */'),
    )
  })

  test('preserves CSS order while loading regular and module CSS in parallel', async () => {
    const entry = createEntryNode('/src/entry.tsx', [
      '/src/root.css',
      '/src/route.module.css',
    ])
    const rootCss = createCssNode('/src/root.css', '')
    const routeCss = createCssNode('/src/route.module.css', '')
    const modules = new Map(
      [entry, rootCss, routeCss].map((node) => [node.url, node]),
    )
    const environment = {
      moduleGraph: {
        async getModuleByUrl(url: string) {
          return modules.get(url)
        },
      },
      async transformRequest() {
        return null
      },
    }
    let rootFinished = false
    let routeStartedBeforeRootFinished = false

    const css = await collectDevStyles({
      serverEnvironment: environment,
      rootDirectory: '/app',
      entries: ['/app/src/entry.tsx'],
      loadCssContents: async (url) => {
        if (url === rootCss.url) {
          await new Promise((resolve) => setTimeout(resolve, 20))
          rootFinished = true
          return '.root {}'
        }
        if (!rootFinished) {
          routeStartedBeforeRootFinished = true
        }
        return '.route {}'
      },
    })

    expect(routeStartedBeforeRootFinished).toBe(true)
    expect(css!.indexOf('/* /src/root.css */')).toBeLessThan(
      css!.indexOf('/* /src/route.module.css */'),
    )
  })

  test('handles cycles and coalesces shared dependency lookups', async () => {
    const firstEntry = createEntryNode('/src/first.tsx', [
      '/src/first.css',
      'external-package',
      '/src/shared.css',
    ])
    const secondEntry = createEntryNode('/src/second.tsx', [
      '/src/second.css',
      'external-package',
      '/src/shared.css',
    ])
    const firstCss = createCssNode('/src/first.css', '.first {}')
    const secondCss = createCssNode('/src/second.css', '.second {}')
    const sharedCss = createCssNode('/src/shared.css', '.shared {}')
    firstEntry.importedModules.add(secondEntry)
    secondEntry.importedModules.add(firstEntry)
    const modules = new Map(
      [firstEntry, secondEntry, firstCss, secondCss, sharedCss].map((node) => [
        node.url,
        node,
      ]),
    )
    const lookupCounts = new Map<string, number>()
    const environment = {
      moduleGraph: {
        async getModuleByUrl(url: string) {
          lookupCounts.set(url, (lookupCounts.get(url) ?? 0) + 1)
          return modules.get(url)
        },
      },
      async transformRequest() {
        return null
      },
    }

    const css = await collectDevStyles({
      serverEnvironment: environment,
      rootDirectory: '/app',
      entries: ['/app/src/first.tsx', '/app/src/second.tsx'],
      loadCssContents: async (url) => `.${url.split('/').at(-1)} {}`,
    })

    expect(lookupCounts.get('external-package')).toBe(1)
    expect(lookupCounts.get('/src/shared.css')).toBe(1)
    expect(css?.match(/\/\* \/src\/shared\.css \*\//g)).toHaveLength(1)
    expect(css!.indexOf('/* /src/first.css */')).toBeLessThan(
      css!.indexOf('/* /src/shared.css */'),
    )
    expect(css!.indexOf('/* /src/shared.css */')).toBeLessThan(
      css!.indexOf('/* /src/second.css */'),
    )
  })

  test('refreshes the graph and client CSS after invalidation', async () => {
    const entry = createEntryNode('/src/entry.tsx', '/src/old.css')
    const oldServerCss = createCssNode('/src/old.css', '')
    const newServerCss = createCssNode('/src/new.css', '')
    const oldClientCss = createCssNode('/src/old.css', '.old {}')
    const newClientCss = createCssNode('/src/new.css', '.new {}')
    const newClientTransform = newClientCss.transformResult!
    newClientCss.transformResult = null

    const serverModules = new Map(
      [entry, oldServerCss, newServerCss].map((node) => [node.url, node]),
    )
    const clientModules = new Map(
      [oldClientCss, newClientCss].map((node) => [node.url, node]),
    )
    const serverEnvironment = {
      moduleGraph: {
        async getModuleByUrl(url: string) {
          return serverModules.get(url)
        },
      },
      async transformRequest(url: string) {
        if (url === entry.url) {
          entry.transformResult = {
            code: '',
            map: null,
            deps: [newServerCss.url],
          }
        }
        return entry.transformResult
      },
    }
    const clientEnvironment = {
      moduleGraph: {
        async getModuleByUrl(url: string) {
          return clientModules.get(url)
        },
      },
      async transformRequest(url: string) {
        if (url === newClientCss.url) {
          newClientCss.transformResult = newClientTransform
          return newClientTransform
        }
        return null
      },
    }
    const options = {
      serverEnvironment,
      rootDirectory: '/app',
      entries: ['/app/src/entry.tsx'],
      loadCssContents: (url: string) =>
        fetchCssFromModule(clientEnvironment, url),
    }

    const initialCss = await collectDevStyles(options)
    entry.transformResult = null
    const invalidatedCss = await collectDevStyles(options)

    expect(initialCss).toContain('.old {}')
    expect(invalidatedCss).toContain('.new {}')
    expect(invalidatedCss).not.toContain('.old {}')
  })

  test('refreshes cached CSS when the same URL is invalidated', async () => {
    const entry = createEntryNode('/src/entry.tsx', '/src/route.css')
    const serverCss = createCssNode('/src/route.css', '')
    const clientCss = createCssNode('/src/route.css', '.old {}')
    const serverModules = new Map(
      [entry, serverCss].map((node) => [node.url, node]),
    )
    const clientModules = new Map([[clientCss.url, clientCss]])
    const newTransform = {
      code: `const __vite__css = ${JSON.stringify('.new {}')}`,
      map: null,
    }
    const serverEnvironment = {
      moduleGraph: {
        async getModuleByUrl(url: string) {
          return serverModules.get(url)
        },
      },
      async transformRequest() {
        return null
      },
    }
    const clientEnvironment = {
      moduleGraph: {
        async getModuleByUrl(url: string) {
          return clientModules.get(url)
        },
      },
      async transformRequest(url: string) {
        if (url === clientCss.url) {
          clientCss.transformResult = newTransform
          return newTransform
        }
        return null
      },
    }
    const options = {
      serverEnvironment,
      rootDirectory: '/app',
      entries: ['/app/src/entry.tsx'],
      loadCssContents: (url: string) =>
        fetchCssFromModule(clientEnvironment, url),
    }

    const initialCss = await collectDevStyles(options)
    clientCss.transformResult = null
    const invalidatedCss = await collectDevStyles(options)

    expect(initialCss).toContain('.old {}')
    expect(invalidatedCss).toContain('.new {}')
    expect(invalidatedCss).not.toContain('.old {}')
  })

  test('snapshots importedModules before awaiting dependency lookups', async () => {
    const entry = createEntryNode('/src/entry.tsx', 'slow-dependency')
    const initialCss = createCssNode('/src/initial.css', '.initial {}')
    const lateCss = createCssNode('/src/late.css', '.late {}')
    entry.importedModules.add(initialCss)
    const modules = new Map(
      [entry, initialCss, lateCss].map((node) => [node.url, node]),
    )
    let notifyLookupStarted!: () => void
    let finishLookup!: () => void
    const lookupStarted = new Promise<void>((resolve) => {
      notifyLookupStarted = resolve
    })
    const lookupCanFinish = new Promise<void>((resolve) => {
      finishLookup = resolve
    })
    const environment = {
      moduleGraph: {
        async getModuleByUrl(url: string) {
          if (url === 'slow-dependency') {
            notifyLookupStarted()
            await lookupCanFinish
          }
          return modules.get(url)
        },
      },
      async transformRequest() {
        return null
      },
    }
    const options = {
      serverEnvironment: environment,
      rootDirectory: '/app',
      entries: ['/app/src/entry.tsx'],
      loadCssContents: (url: string) => fetchCssFromModule(environment, url),
    }

    const inFlightCollection = collectDevStyles(options)
    await lookupStarted
    entry.importedModules.add(lateCss)
    finishLookup()
    const inFlightCss = await inFlightCollection
    const nextCss = await collectDevStyles(options)

    expect(inFlightCss).toContain('.initial {}')
    expect(inFlightCss).not.toContain('.late {}')
    expect(nextCss).toContain('.late {}')
  })

  test('keeps other styles when a CSS transform fails', async () => {
    const entry = createEntryNode('/src/entry.tsx', [
      '/src/good.css',
      '/src/partial.scss',
    ])
    const goodServerCss = createCssNode('/src/good.css', '')
    const partialServerCss = createCssNode('/src/partial.scss', '')
    const goodClientCss = createCssNode('/src/good.css', '.good {}')
    const partialClientCss = createCssNode('/src/partial.scss', '')
    partialClientCss.transformResult = null
    const serverModules = new Map(
      [entry, goodServerCss, partialServerCss].map((node) => [node.url, node]),
    )
    const clientModules = new Map(
      [goodClientCss, partialClientCss].map((node) => [node.url, node]),
    )
    const serverEnvironment = {
      moduleGraph: {
        async getModuleByUrl(url: string) {
          return serverModules.get(url)
        },
      },
      async transformRequest() {
        return null
      },
    }
    const clientEnvironment = {
      moduleGraph: {
        async getModuleByUrl(url: string) {
          return clientModules.get(url)
        },
      },
      async transformRequest(url: string) {
        if (url === partialClientCss.url) {
          throw new Error('Sass partial cannot compile in isolation')
        }
        return null
      },
    }

    const css = await collectDevStyles({
      serverEnvironment,
      rootDirectory: '/app',
      entries: ['/app/src/entry.tsx'],
      loadCssContents: (url) => fetchCssFromModule(clientEnvironment, url),
    })

    expect(css).toContain('.good {}')
    expect(css).not.toContain('partial.scss')
  })

  test('does not traverse modules that exist only in the client graph', async () => {
    const ssrRoot = createEntryNode('/src/root.tsx', '/src/root.css')
    const ssrRootCss = createCssNode('/src/root.css', '')
    const ssrModules = new Map(
      [ssrRoot, ssrRootCss].map((node) => [node.url, node]),
    )

    const clientRoot = createEntryNode('/src/root.tsx', '/src/root.css')
    const clientRootCss = createCssNode('/src/root.css', '.root {}')
    const clientOnlyModule = createEntryNode(
      '/src/client-only.ts',
      '/src/client-only.css',
    )
    const clientOnlyCss = createCssNode(
      '/src/client-only.css',
      '.client-only {}',
    )
    clientRoot.importedModules.add(clientOnlyModule)
    const clientModules = new Map(
      [clientRoot, clientRootCss, clientOnlyModule, clientOnlyCss].map(
        (node) => [node.url, node],
      ),
    )

    const createEnvironment = (
      modules: Map<string, EnvironmentModuleNode>,
    ) => ({
      moduleGraph: {
        async getModuleByUrl(url: string) {
          return modules.get(url)
        },
      },
      async transformRequest() {
        return null
      },
    })
    const clientEnvironment = createEnvironment(clientModules)
    const ssrEnvironment = createEnvironment(ssrModules)

    const css = await collectDevStyles({
      serverEnvironment: ssrEnvironment,
      rootDirectory: '/app',
      entries: ['/app/src/root.tsx'],
      loadCssContents: (url) => fetchCssFromModule(clientEnvironment, url),
    })

    expect(css).toContain('.root {}')
    expect(css).not.toContain('.client-only {}')
  })
})
