import path from 'node:path'
import * as t from '@babel/types'
import { describe, expect, it, vi } from 'vitest'
import { parseAst } from '@tanstack/router-utils'
import { createRouterCodeSplitterPlugin } from '../src/core/router-code-splitter-plugin'
import { unpluginRouterComposedFactory } from '../src/core/router-composed-plugin'
import { createRouterHmrPlugin } from '../src/core/router-hmr-plugin'
import { createRouterPluginContext } from '../src/core/router-plugin-context'
import { normalizePath } from '../src/core/utils'
import type { Config } from '../src/core/config'
import type { UnpluginOptions, TransformResult } from 'unplugin'

const referencePluginName =
  'tanstack-router:code-splitter:compile-reference-file'
const virtualPluginName = 'tanstack-router:code-splitter:compile-virtual-file'

function getCodeSplitterPlugin(
  plugins: ReturnType<typeof createRouterCodeSplitterPlugin>,
  pluginName: string,
): UnpluginOptions {
  const pluginArray = Array.isArray(plugins) ? plugins : [plugins]
  const plugin = pluginArray.find((item) => item.name === pluginName)
  if (!plugin) {
    throw new Error(`Code-splitter plugin "${pluginName}" not found`)
  }
  return plugin
}

function getReferencePlugin(
  plugins: ReturnType<typeof createRouterCodeSplitterPlugin>,
) {
  return getCodeSplitterPlugin(plugins, referencePluginName)
}

async function configurePlugin(
  plugin: UnpluginOptions,
  command: 'serve' | 'build' = 'serve',
) {
  const hook = plugin.vite?.configResolved
  if (!hook) {
    return
  }

  const config = {
    root: process.cwd(),
    command,
    plugins: [{ name: referencePluginName }],
  } as never

  if (typeof hook === 'function') {
    await hook.call({} as never, config)
    return
  }

  await hook.handler.call({} as never, config)
}

async function transformReferenceRoute(
  plugin: UnpluginOptions,
  code: string,
  id: string,
): Promise<TransformResult | null | undefined> {
  const transform = plugin.transform
  if (!transform || typeof transform === 'function') {
    throw new Error('Expected object transform')
  }
  return transform.handler.call({} as never, code, id)
}

function getCode(result: TransformResult | null | undefined) {
  if (!result) {
    return null
  }
  if (typeof result === 'string') {
    return result
  }
  return result.code
}

function countProgramHotDeclarations(code: string) {
  const ast = parseAst({ code })
  return ast.program.body.filter((statement) => {
    return (
      t.isVariableDeclaration(statement) &&
      statement.declarations.some((declaration) => {
        return t.isIdentifier(declaration.id) && declaration.id.name === 'hot'
      })
    )
  }).length
}

describe('router plugin context', () => {
  it('splits parenthesized route factories, option values, and grouping arrays', async () => {
    const routeFile = normalizePath(
      path.join(process.cwd(), 'src/routes/wrapped.tsx'),
    )
    const context = createRouterPluginContext()
    context.routesByFile.set(routeFile, { routeId: '/wrapped' })
    const plugins = createRouterCodeSplitterPlugin(
      {
        target: 'react',
        autoCodeSplitting: true,
        codeSplittingOptions: { addHmr: false },
      },
      context,
    )
    await configurePlugin(getReferencePlugin(plugins), 'build')
    const code = `import { createFileRoute } from '@tanstack/react-router'
const Component = () => 'wrapped component'
const loader = () => 'wrapped loader'
export const Route = (createFileRoute('/wrapped'))({
  component: (Component), loader: (loader),
  codeSplitGroupings: (([(['component']), (['loader'])])),
})`
    const reference = getCode(
      await transformReferenceRoute(
        getReferencePlugin(plugins),
        code,
        routeFile,
      ),
    )
    expect(reference).toContain('lazyRouteComponent')
    expect(reference).toContain('lazyFn')
    const virtual = getCode(
      await transformReferenceRoute(
        getCodeSplitterPlugin(plugins, virtualPluginName),
        code,
        `${routeFile}?tsr-split=component`,
      ),
    )
    expect(virtual).toContain('wrapped component')
    expect(virtual).not.toContain('wrapped loader')
  })

  it('refreshes chunk ownership after source changes and isolates split settings', async () => {
    const routeFile = normalizePath(
      path.join(process.cwd(), 'src/routes/changing.tsx'),
    )
    const source = (name: string, value: string) => `
import { createFileRoute } from '@tanstack/react-router'
const ${name} = { value: ${JSON.stringify(value)} }
export const Route = createFileRoute('/changing')({
  loader: () => ${name},
  component: () => ${name}.value,
})`
    const setup = async (combined: boolean) => {
      const context = createRouterPluginContext()
      context.routesByFile.set(routeFile, { routeId: '/changing' })
      const plugins = createRouterCodeSplitterPlugin(
        {
          target: 'react',
          autoCodeSplitting: true,
          codeSplittingOptions: {
            addHmr: false,
            defaultBehavior: combined
              ? [['component', 'loader']]
              : [['component'], ['loader']],
          },
        },
        context,
      )
      await configurePlugin(getReferencePlugin(plugins), 'build')
      return async (code: string) => {
        const reference = getCode(
          await transformReferenceRoute(
            getReferencePlugin(plugins),
            code,
            routeFile,
          ),
        )!
        const virtual = getCode(
          await transformReferenceRoute(
            getCodeSplitterPlugin(plugins, virtualPluginName),
            code,
            `${routeFile}?tsr-split=${combined ? 'component---loader' : 'component'}`,
          ),
        )!
        const shared = getCode(
          await transformReferenceRoute(
            getCodeSplitterPlugin(
              plugins,
              'tanstack-router:code-splitter:compile-shared-file',
            ),
            code,
            `${routeFile}?tsr-shared=1`,
          ),
        )!
        return { reference, virtual, shared }
      }
    }
    const separate = await setup(false)
    const combined = await setup(true)
    const first = await separate(source('firstState', 'first version'))
    expect(first.reference).toContain('tsr-split=component')
    const virtualImports = parseAst({
      code: first.virtual,
    }).program.body.filter((statement) => t.isImportDeclaration(statement))
    expect(virtualImports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: expect.objectContaining({
            value: expect.stringContaining('tsr-shared'),
          }),
          specifiers: expect.arrayContaining([
            expect.objectContaining({
              type: 'ImportSpecifier',
              imported: expect.objectContaining({ name: 'firstState' }),
              local: expect.objectContaining({ name: 'firstState' }),
            }),
          ]),
        }),
      ]),
    )
    expect(first.shared).toContain('first version')

    const second = await separate(source('secondState', 'second version'))
    for (const output of Object.values(second)) {
      expect(output).not.toContain('firstState')
    }
    expect(second.virtual).toContain('secondState')
    expect(second.shared).toContain('second version')
    const together = await combined(source('secondState', 'second version'))
    expect(together.reference).not.toContain('tsr-shared')
    expect(together.virtual).toContain('second version')
    expect(together.virtual).not.toContain('tsr-shared')
    expect(await separate(source('secondState', 'second version'))).toEqual(
      second,
    )
  })

  it.each([
    { mode: 'production', production: true },
    { mode: 'development with addHmr disabled', production: false },
  ])(
    'does not run React HMR compiler plugins in $mode',
    async ({ production }) => {
      const routeFile = normalizePath(
        path.join(process.cwd(), 'src/routes/lowercase.tsx'),
      )
      const routeCode = `
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/lowercase')({ component })

function component() {
  return <div>Hello</div>
}
`

      const context = createRouterPluginContext()
      context.routesByFile.set(routeFile, { routeId: '/lowercase' })

      if (production) {
        vi.stubEnv('NODE_ENV', 'production')
      }

      try {
        const plugins = createRouterCodeSplitterPlugin(
          {
            target: 'react',
            autoCodeSplitting: true,
            codeSplittingOptions: production ? undefined : { addHmr: false },
          },
          context,
        )
        const referencePlugin = getReferencePlugin(plugins)
        const virtualPlugin = getCodeSplitterPlugin(plugins, virtualPluginName)

        await configurePlugin(referencePlugin, production ? 'build' : 'serve')

        const referenceCode = getCode(
          await transformReferenceRoute(referencePlugin, routeCode, routeFile),
        )
        const virtualCode = getCode(
          await transformReferenceRoute(
            virtualPlugin,
            routeCode,
            `${routeFile}?tsr-split=component`,
          ),
        )

        expect(referenceCode).not.toContain('TSRFastRefreshAnchor')
        expect(virtualCode).toContain('function component()')
        expect(virtualCode).toContain('export { component }')
        expect(virtualCode).not.toContain('SplitComponent')
      } finally {
        if (production) {
          vi.unstubAllEnvs()
        }
      }
    },
  )

  it('does not install the standalone route HMR plugin in production', () => {
    vi.stubEnv('NODE_ENV', 'production')

    try {
      const plugins = unpluginRouterComposedFactory(
        { target: 'react', autoCodeSplitting: false },
        { framework: 'vite', versions: {} },
      )

      const pluginArray = Array.isArray(plugins) ? plugins : [plugins]
      expect(
        pluginArray.some((plugin) => plugin.name === 'tanstack-router:hmr'),
      ).toBe(false)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('keeps multiple code-splitter instances isolated by explicit context', async () => {
    const routeFile = normalizePath(
      path.join(process.cwd(), 'src/routes-a/owned.tsx'),
    )
    const otherRouteFile = normalizePath(
      path.join(process.cwd(), 'src/routes-b/other.tsx'),
    )

    const routeCode = `
import { createFileRoute } from '@tanstack/react-router'

function Component() {
  return <div>Hello</div>
}

export const Route = createFileRoute('/owned')({
  component: Component,
})
`

    const contextA = createRouterPluginContext()
    contextA.routesByFile.set(routeFile, { routeId: '/owned' })

    const contextB = createRouterPluginContext()
    contextB.routesByFile.set(otherRouteFile, { routeId: '/other' })

    const configA = {
      target: 'react',
      routesDirectory: './src/routes-a',
      generatedRouteTree: './src/routeTree-a.gen.ts',
      autoCodeSplitting: true,
    } satisfies Partial<Config>

    const configB = {
      target: 'react',
      routesDirectory: './src/routes-b',
      generatedRouteTree: './src/routeTree-b.gen.ts',
      autoCodeSplitting: true,
    } satisfies Partial<Config>

    const splitterA = getReferencePlugin(
      createRouterCodeSplitterPlugin(configA, contextA),
    )
    const splitterB = getReferencePlugin(
      createRouterCodeSplitterPlugin(configB, contextB),
    )

    await configurePlugin(splitterA)
    await configurePlugin(splitterB)

    const firstResult = await transformReferenceRoute(
      splitterA,
      routeCode,
      routeFile,
    )
    const firstCode = getCode(firstResult)

    expect(firstCode).not.toBeNull()
    expect(countProgramHotDeclarations(firstCode!)).toBe(1)

    const secondResult = await transformReferenceRoute(
      splitterB,
      firstCode!,
      routeFile,
    )

    expect(secondResult).toBeNull()
  })

  it('normalizes HMR options before the first transform', async () => {
    const routeFile = normalizePath(
      path.join(process.cwd(), 'src/routes/owned.tsx'),
    )

    const routeCode = `
import { createFileRoute } from '@tanstack/react-router'

function Component() {
  return <div>Hello</div>
}

export const Route = createFileRoute('/owned')({
  component: Component,
})
`

    const context = createRouterPluginContext()
    context.routesByFile.set(routeFile, { routeId: '/owned' })

    const hmrPlugin = createRouterHmrPlugin({}, context)
    const hmrResult = await transformReferenceRoute(
      Array.isArray(hmrPlugin) ? hmrPlugin[0]! : hmrPlugin,
      routeCode,
      routeFile,
    )

    const hmrCode = getCode(hmrResult)

    expect(hmrCode).not.toBeNull()
    expect(hmrCode).toContain('TSRFastRefreshAnchor')
  })
})
