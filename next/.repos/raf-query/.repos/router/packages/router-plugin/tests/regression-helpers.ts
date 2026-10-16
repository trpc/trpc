/**
 * Helpers shared by the code-splitter and route HMR regression suites: compile
 * a route file into every module the code splitter emits, drive the bundler
 * plugins the way a bundler does, and inspect or evaluate an emitted module.
 */
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { build, parseSync, transformWithOxc } from 'vite'
import { expect } from 'vitest'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitSharedRoute,
  compileCodeSplitVirtualRoute,
  computeSharedBindings,
} from '../src/core/code-splitter/compilers'
import { getFrameworkHmrCompilerPlugins } from '../src/core/code-splitter/plugins/framework-plugins'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { createRouterCodeSplitterPlugin } from '../src/core/router-code-splitter-plugin'
import { createRouterHmrPlugin } from '../src/core/router-hmr-plugin'
import { createRouterPluginContext } from '../src/core/router-plugin-context'
import { normalizePath } from '../src/core/utils'
import { getModuleErrors } from './validate-module'
import type { Config } from '../src/core/config'
import type { CodeSplitGroupings } from '../src/core/constants'
import type { TransformResult, UnpluginOptions } from 'unplugin'
import type { ESTree } from 'vite'

export { declarationOf } from './validate-module'

export const head = `import { createFileRoute } from '@tanstack/react-router'\n`

/**
 * Compiles a route file with the default groupings into every module the code
 * splitter emits for it: `reference`, one `virtual <split>` chunk per grouping
 * and, when bindings are shared, `shared`.
 */
export function compileRouteModules(
  code: string,
  options: {
    filename?: string
    targetFramework?: 'react' | 'solid'
    /** Compile with route HMR and the framework's HMR compiler plugins. */
    hmr?: boolean
  } = {},
) {
  const {
    filename = 'route.tsx',
    targetFramework = 'react',
    hmr = false,
  } = options
  const groupings = defaultCodeSplitGroupings
  const compilerPlugins = hmr
    ? getFrameworkHmrCompilerPlugins({ targetFramework })
    : undefined
  const computed = computeSharedBindings({
    code,
    filename,
    codeSplitGroupings: groupings,
  })
  const sharedBindings = computed.size > 0 ? computed : undefined
  const reference = compileCodeSplitReferenceRoute({
    code,
    filename,
    id: filename,
    addHmr: hmr,
    codeSplitGroupings: groupings,
    targetFramework,
    sharedBindings,
    compilerPlugins,
  })
  const modules: Record<string, string> = {
    reference: reference?.code ?? code,
  }
  for (const targets of groupings) {
    const split = targets.join('-')
    modules[`virtual ${split}`] = compileCodeSplitVirtualRoute({
      code,
      filename: `${filename}?tsr-split=${split}`,
      splitTargets: targets,
      sharedBindings,
      compilerPlugins,
    }).code
  }
  if (sharedBindings) {
    modules.shared = compileCodeSplitSharedRoute({
      code,
      sharedBindings,
      filename: `${filename}?tsr-shared=1`,
    }).code
  }
  return { modules, sharedBindings: [...computed].sort() }
}

/** Compiles every module of a route file and returns the component chunk. */
export function componentChunk(code: string) {
  return compileRouteModules(code).modules['virtual component']!
}

/** Asserts that every module is valid, reporting the errors by module name. */
export async function expectValidModules(modules: Record<string, string>) {
  const errors: Record<string, Array<string>> = {}
  for (const [name, code] of Object.entries(modules)) {
    errors[name] = await getModuleErrors(code)
  }
  expect(errors).toEqual(
    Object.fromEntries(Object.keys(modules).map((name) => [name, []])),
  )
}

function moduleRecord(code: string) {
  return parseSync('module.tsx', code, { sourceType: 'module' }).module
}

/** Sources a module imports, side-effect imports included, sorted. */
export function importSources(code: string) {
  return [
    ...new Set(
      moduleRecord(code).staticImports.map(
        (statement) => statement.moduleRequest.value,
      ),
    ),
  ].sort()
}

/**
 * The values a module imports from `source`, sorted: `default`, `*` for a
 * namespace import, or the imported name. Type-only specifiers are skipped.
 */
export function importedNames(code: string, source: string) {
  return moduleRecord(code)
    .staticImports.filter(
      (statement) => statement.moduleRequest.value === source,
    )
    .flatMap((statement) =>
      statement.entries
        .filter((entry) => !entry.isType)
        .map((entry) =>
          entry.importName.kind === 'Default'
            ? 'default'
            : entry.importName.kind === 'NamespaceObject'
              ? '*'
              : entry.importName.name!,
        ),
    )
    .sort()
}

/** Value names a module exports (`default` for a default export), sorted. */
export function exportedNames(code: string) {
  return moduleRecord(code)
    .staticExports.flatMap((statement) =>
      statement.entries
        .filter((entry) => !entry.isType && entry.exportName.kind !== 'None')
        .map((entry) => entry.exportName.name ?? 'default'),
    )
    .sort()
}

/** Absolute, normalized path of a route file in the package's `src/routes`. */
export function routeFile(name: string) {
  return normalizePath(path.join(process.cwd(), `src/routes/${name}.tsx`))
}

function runTransform(plugin: UnpluginOptions, code: string, id: string) {
  const transform = plugin.transform
  if (!transform || typeof transform === 'function') {
    throw new Error('Expected object transform')
  }
  const result = transform.handler.call({} as never, code, id) as
    | TransformResult
    | null
    | undefined
  if (!result) {
    return null
  }
  return typeof result === 'string' ? result : result.code
}

const referencePluginName =
  'tanstack-router:code-splitter:compile-reference-file'
const virtualPluginName = 'tanstack-router:code-splitter:compile-virtual-file'
const sharedPluginName = 'tanstack-router:code-splitter:compile-shared-file'

/**
 * Drives the three code-splitter transforms the way a bundler does, for the
 * given route files (absolute path to route id). `configPlugins` are the
 * plugins of the resolved Vite config; by default the code splitter itself,
 * so its plugin-order check runs.
 */
export async function createCodeSplitterTransforms(
  options: Partial<Config>,
  routes: Record<string, string>,
  configPlugins: Array<{ name: string }> = [{ name: referencePluginName }],
) {
  const context = createRouterPluginContext()
  for (const [file, routeId] of Object.entries(routes)) {
    context.routesByFile.set(file, { routeId })
  }
  const plugins = createRouterCodeSplitterPlugin(
    { target: 'react', autoCodeSplitting: true, ...options },
    context,
  )
  const pluginArray = Array.isArray(plugins) ? plugins : [plugins]
  const byName = (name: string) => {
    const plugin = pluginArray.find((candidate) => candidate.name === name)
    if (!plugin) {
      throw new Error(`Code-splitter plugin "${name}" not found`)
    }
    return plugin
  }
  const hook = byName(referencePluginName).vite?.configResolved
  const config = {
    root: process.cwd(),
    command: 'build',
    plugins: configPlugins,
  } as never
  if (typeof hook === 'function') {
    await hook.call({} as never, config)
  } else if (hook) {
    await hook.handler.call({} as never, config)
  }
  return {
    reference: (code: string, id: string) =>
      runTransform(byName(referencePluginName), code, id),
    virtual: (code: string, id: string) =>
      runTransform(byName(virtualPluginName), code, id),
    shared: (code: string, id: string) =>
      runTransform(byName(sharedPluginName), code, id),
  }
}

/**
 * Runs the route HMR plugin (used when automatic code splitting is off) on
 * the route file `file`, registered under `routeId`.
 */
export function transformWithRouteHmrPlugin(
  code: string,
  options: Partial<Config> = { target: 'react' },
  route: { file: string; routeId: string } = {
    file: routeFile('index'),
    routeId: '/',
  },
) {
  const context = createRouterPluginContext()
  context.routesByFile.set(route.file, { routeId: route.routeId })
  const plugins = createRouterHmrPlugin(options, context)
  const plugin = Array.isArray(plugins) ? plugins[0]! : plugins
  const output = runTransform(plugin, code, route.file)
  if (output === null) {
    throw new Error('expected the route HMR plugin to transform the route')
  }
  return output
}

/** Renders JSX to text: intrinsic elements become tags, components are called. */
const jsxToText = `const Fragment = Symbol('Fragment')
const h = (type, props, ...children) => {
  const text = children.flat(Infinity).filter((c) => c != null && c !== false && c !== true).join('')
  if (type === Fragment) {
    return text
  }
  if (typeof type === 'function') {
    return type({ ...props, children: text })
  }
  if (typeof type !== 'string') {
    throw new Error('cannot render ' + String(type))
  }
  return '<' + type + '>' + text + '</' + type + '>'
}
`

const stubsKey = '__regressionModuleStubs'
let evaluations = 0

/**
 * Evaluates an emitted module like a bundler would: JSX becomes plain calls
 * that render to text, and named imports are linked to `stubs`, keyed by
 * specifier. Every call evaluates a fresh module instance.
 */
export async function evaluateModule(
  code: string,
  stubs: Record<string, Record<string, unknown>> = {},
): Promise<Record<string, (...args: Array<any>) => any>> {
  const { code: javascript } = await transformWithOxc(code, 'module.tsx', {
    jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' },
  })
  const key = `${stubsKey}${evaluations++}`
  ;(globalThis as Record<string, unknown>)[key] = stubs
  // Imports are hoisted: link them before any other statement runs.
  const imports: Array<string> = []
  const body = javascript.replace(
    /^import\s+\{([^}]*)\}\s+from\s+(["'])(.+?)\2;?$/gm,
    (_, named: string, __, source: string) => {
      if (!(source in stubs)) {
        throw new Error(`no stub for import ${source}`)
      }
      imports.push(
        `const { ${named.replace(/\bas\b/g, ':')} } = globalThis.${key}[${JSON.stringify(source)}];`,
      )
      return ''
    },
  )
  return import(
    /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(`${jsxToText}${imports.join('\n')}\n${body}`)}`
  )
}

/**
 * Applies Vite's Oxc React Refresh transform (the one `@vitejs/plugin-react`
 * uses) and returns the registered component names and the hook signature
 * arguments of each signed binding.
 */
export async function reactRefresh(code: string) {
  const result = await transformWithOxc(code, 'route.tsx', {
    jsx: {
      runtime: 'automatic',
      development: true,
      refresh: { emitFullSignatures: true },
    },
  })
  const registered = [
    ...result.code.matchAll(/\$RefreshReg\$\(\w+, "([^"]+)"\)/g),
  ].map((match) => match[1]!)
  const signatures = new Map(
    [...result.code.matchAll(/\b_s\d*\((\w+), ([\s\S]*?)\);\n/g)].map(
      (match) => [match[1]!, match[2]!] as const,
    ),
  )
  return { registered, signatures }
}

/** Parses a module, asserting that it has no syntax errors. */
export function parseModule(code: string) {
  const { program, errors } = parseSync('route.tsx', code, {
    sourceType: 'module',
  })
  expect(errors).toEqual([])
  return program
}

/** Declarators of the top-level variable declarations, exported or not. */
export function topLevelDeclarators(program: ESTree.Program) {
  return program.body.flatMap((statement) => {
    const declaration =
      statement.type === 'ExportNamedDeclaration'
        ? statement.declaration
        : statement
    return declaration?.type === 'VariableDeclaration'
      ? declaration.declarations
      : []
  })
}

export function declaratorName(declarator: ESTree.VariableDeclarator) {
  return declarator.id.type === 'Identifier' ? declarator.id.name : undefined
}

/** The `Route` declarator and the value of its `option`. */
export function getRouteOption(program: ESTree.Program, option: string) {
  const route = topLevelDeclarators(program).find(
    (declarator) => declaratorName(declarator) === 'Route',
  )
  const options =
    route?.init?.type === 'CallExpression' ? route.init.arguments[0] : null
  if (options?.type !== 'ObjectExpression') {
    throw new Error('expected `Route` to be created with an options object')
  }
  const property = options.properties.find(
    (candidate) =>
      candidate.type === 'Property' &&
      candidate.key.type === 'Identifier' &&
      candidate.key.name === option,
  )
  if (property?.type !== 'Property') {
    throw new Error(`expected the \`${option}\` route option`)
  }
  return { route: route!, value: property.value }
}

/** Asserts that `option` points to a binding React Refresh registers. */
export async function expectRegisteredRouteOption(
  code: string,
  option: string,
) {
  expect(await getModuleErrors(code)).toEqual([])
  const { value } = getRouteOption(parseModule(code), option)
  expect(value.type).toBe('Identifier')
  const binding = (value as ESTree.IdentifierReference).name
  expect((await reactRefresh(code)).registered).toContain(binding)
  return binding
}

const runNode = promisify(execFile)

/**
 * Builds a small app with the real Vite plugin (code splitting on, default
 * groupings unless `groupings` is given): `routes/index.tsx` holds `route`,
 * and `entry.ts` re-exports the route module next to `render(component)`,
 * which preloads a component and renders it to a string. `files` adds files
 * or replaces `entry.ts`. Then imports the built entry in a separate Node
 * process and returns the JSON value returned by `script`, which has the
 * entry's exports in scope as `entry`.
 */
export async function buildAndRun(
  route: string,
  script: string,
  options: {
    files?: Record<string, string>
    groupings?: CodeSplitGroupings
  } = {},
) {
  const { tanstackRouter } = await import('../src/vite')
  // Keep the temporary app inside the package so real runtime imports resolve.
  const root = await mkdtemp(path.join(__dirname, '.regression-build-'))
  try {
    await mkdir(path.join(root, 'routes'))
    const files: Record<string, string> = {
      'routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})`,
      'routes/index.tsx': route,
      'entry.ts': `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
export * from './routes/index'
export async function render(component: any) {
  await component.preload?.()
  return renderToString(createElement(component))
}
`,
      ...options.files,
    }
    for (const [file, code] of Object.entries(files)) {
      await writeFile(path.join(root, file), code)
    }
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        tanstackRouter({
          target: 'react',
          routesDirectory: './routes',
          generatedRouteTree: './routeTree.gen.ts',
          autoCodeSplitting: true,
          codeSplittingOptions: {
            addHmr: false,
            ...(options.groupings && { defaultBehavior: options.groupings }),
          },
        }),
      ],
      build: {
        ssr: path.join(root, 'entry.ts'),
        outDir: 'dist',
        minify: false,
        rollupOptions: {
          output: { entryFileNames: 'entry.mjs', chunkFileNames: '[name].mjs' },
        },
      },
    })
    const entryUrl = pathToFileURL(path.join(root, 'dist/entry.mjs')).href
    const { stdout } = await runNode(process.execPath, [
      '--input-type=module',
      '--eval',
      `const entry = await import(${JSON.stringify(entryUrl)})
const result = await (async () => { ${script} })()
process.stdout.write(JSON.stringify(result))`,
    ])
    return JSON.parse(stdout) as unknown
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
