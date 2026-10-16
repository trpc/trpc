/**
 * Shared harness of the Start compiler behaviour suites: compile a module
 * into its client, SSR caller and server-function provider outputs, split
 * `<Hydrate>` children into chunks, and evaluate compiled modules against a
 * minimal Start runtime.
 */
import { transformWithOxc } from 'vite'
import { expect } from 'vitest'
import { createHydrateCompilerPlugin } from '../src/hydrate-when-transform'
import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../src/start-compiler/config'
import { getModuleErrors } from './validate-module'
import type { ServerFn } from '../src/start-compiler/types'
import type { StartCompilerPlugin } from '../src/types'

export type Output = 'client' | 'ssr' | 'provider'
export const outputs: Array<Output> = ['client', 'ssr', 'provider']
const moduleId = '/test/src/module.tsx'

interface StartCompilerOptions {
  env: 'client' | 'server'
  mode?: 'build' | 'dev'
  /** Project modules by absolute id; `./name` resolves to `/test/src/name.ts`. */
  files?: Record<string, string>
  /** `serverFnProviderModuleDirectives` */
  directives?: Array<string>
  compilerPlugins?: Array<StartCompilerPlugin>
}

/**
 * Creates a React `StartCompiler` configured the way the bundler plugins do,
 * and records the server functions it reports.
 */
export function createStartCompiler(options: StartCompilerOptions) {
  const { env, files = {} } = options
  const serverFns: Record<string, ServerFn> = {}
  const compiler: StartCompiler = new StartCompiler({
    env,
    envName: env === 'client' ? 'client' : 'ssr',
    root: '/test',
    framework: 'react',
    providerEnvName: 'ssr',
    mode: options.mode ?? 'build',
    lookupKinds: getLookupKindsForEnv(env),
    lookupConfigurations: getLookupConfigurationsForEnv(env, 'react'),
    getKnownServerFns: () => ({}),
    devServerFnModuleSpecifierEncoder: ({ extractedFilename, root }) =>
      `/@id${extractedFilename.slice(root.length)}`,
    serverFnProviderModuleDirectives: options.directives,
    onServerFnsById: (fns) => Object.assign(serverFns, fns),
    loadModule: async (id) => {
      const code = files[id]
      if (code !== undefined) {
        compiler.ingestModule({ code, id })
      }
    },
    resolveId: async (id) => {
      if (id.startsWith('@tanstack/')) {
        return id
      }
      const file = id.startsWith('./') ? `/test/src/${id.slice(2)}.ts` : id
      return file in files ? file : null
    },
    compilerPlugins: options.compilerPlugins,
  })
  const compile = async (code: string, id = moduleId) => {
    const result = await compiler.compile({
      code,
      id,
      detectedKinds: detectKindsInCode(code, env),
    })
    return result?.code ?? null
  }
  return { compiler, compile, serverFns }
}

/**
 * Compiles `code` for one output: the client, the SSR caller or the
 * server-function provider module (`?tss-serverfn-split`).
 */
export async function compileFor(
  output: Output,
  code: string,
  options: Omit<StartCompilerOptions, 'env'> & { id?: string } = {},
) {
  const { compile, serverFns } = createStartCompiler({
    ...options,
    env: output === 'client' ? 'client' : 'server',
  })
  const id = options.id ?? moduleId
  const result = await compile(
    code,
    output === 'provider' ? `${id}?tss-serverfn-split` : id,
  )
  return { code: result, serverFns }
}

/** Like `compileFor`, returning only the code (null when untouched). */
export async function compileCode(
  ...args: Parameters<typeof compileFor>
): Promise<string | null> {
  return (await compileFor(...args)).code
}

/**
 * Compiles the client, SSR caller and provider outputs, checks that each is
 * a valid module and returns them with the server functions the client
 * compilation reported.
 */
export async function compileAll(
  code: string,
  options: Omit<StartCompilerOptions, 'env'> = {},
) {
  const compiled = {} as Record<Output, string>
  const errors = {} as Record<Output, Array<string>>
  let serverFns: Record<string, ServerFn> = {}
  for (const output of outputs) {
    const result = await compileFor(output, code, options)
    expect(result.code, output).not.toBeNull()
    compiled[output] = result.code!
    errors[output] = await getModuleErrors(result.code!)
    if (output === 'client') {
      serverFns = result.serverFns
    }
  }
  expect(errors).toEqual({ client: [], ssr: [], provider: [] })
  return { ...compiled, serverFns }
}

/**
 * Matches the source of an import or re-export statement (specifier names
 * may be string literals).
 */
const moduleSource =
  /^(\s*import\s*|\s*(?:import|export)\b(?:[^;'"]|'[^'\n]*'|"[^"\n]*")*?\bfrom\s*)(["'])([^"']+)\2/gm

/** Project-local import and re-export sources of a module, sorted. */
export function importSources(code: string) {
  return [...code.matchAll(moduleSource)]
    .map((match) => match[3]!)
    .filter((source) => !source.startsWith('@tanstack/'))
    .sort()
}

const dataUrl = (code: string, type = 'text/javascript') =>
  `data:${type},${encodeURIComponent(code)}`

/**
 * Minimal Start package: callers keep the RPC they were given, providers run
 * the original handler. The other factories throw when they are called
 * uncompiled, so a test only passes if the compiler ran.
 */
const startRuntime: Record<string, string> = {
  '@tanstack/react-start': `
const uncompiled = () => { throw new Error('uncompiled Start factory') }
const builder = () => {
  const self = {
    handler: (rpc, impl) =>
      impl
        ? Object.assign((opts) => impl(opts ?? {}), {
            __executeServer: (opts) => impl(opts),
          })
        : { rpc },
  }
  return self
}
export const createServerFn = builder
export const createServerOnlyFn = uncompiled
export const createClientOnlyFn = uncompiled
export const createIsomorphicFn = uncompiled
export const createMiddleware = () => ({ server: uncompiled })`,
  '@tanstack/react-start/server-rpc': `export const createServerRpc = (meta, fn) => Object.assign(fn, { meta })`,
  '@tanstack/react-start/client-rpc': `export const createClientRpc = (id) => ({ client: id })`,
  '@tanstack/react-start/ssr-rpc': `export const createSsrRpc = (id) => ({ ssr: id })`,
}

/**
 * JSX runtime of evaluated modules: intrinsic elements render as tags,
 * components are called with their props.
 */
const jsxToText = `const __Fragment = Symbol('Fragment')
const __jsx = (type, props, ...children) => {
  const text = children.flat(Infinity).filter((c) => c != null && c !== false && c !== true).join('')
  if (type === __Fragment) return text
  if (typeof type === 'function') return type(children.length ? { ...props, children: text } : { ...props })
  if (typeof type !== 'string') throw new Error('cannot render ' + String(type))
  return '<' + type + '>' + text + '</' + type + '>'
}
`

/** Module stub: module source code, or the exports of the module. */
export type ModuleStub = string | Record<string, unknown>

const stubsKey = '__startCompilerTestStubs'
const stubRegistry: Array<Record<string, unknown>> = []
;(globalThis as Record<string, unknown>)[stubsKey] = stubRegistry

function stubUrl(source: string, stub: ModuleStub) {
  if (typeof stub === 'string') {
    return source.endsWith('.json')
      ? dataUrl(stub, 'application/json')
      : dataUrl(stub)
  }
  const index = stubRegistry.push(stub) - 1
  const named = Object.keys(stub).filter((name) => name !== 'default')
  return dataUrl(`const stub = globalThis.${stubsKey}[${index}]
export default stub.default
export const { ${named.join(', ')} } = stub`)
}

let evaluations = 0

/**
 * Evaluates a compiled module like a bundler would: TypeScript is erased, JSX
 * becomes calls of `runtime` (which defines `__jsx` and `__Fragment`), and
 * every import is linked to the minimal Start runtime or to `stubs` (by
 * specifier; `.json` string stubs are JSON modules). Every call evaluates a
 * fresh instance, even for identical code.
 */
export async function evaluateModule(
  code: string,
  stubs: Record<string, ModuleStub> = {},
  runtime = jsxToText,
): Promise<Record<string, any>> {
  const sources: Record<string, ModuleStub> = { ...startRuntime, ...stubs }
  const { code: javascript } = await transformWithOxc(code, 'module.tsx', {
    jsx: { runtime: 'classic', pragma: '__jsx', pragmaFrag: '__Fragment' },
  })
  const linked = javascript.replace(
    moduleSource,
    (_match, prefix: string, _quote: string, source: string) => {
      const stub = sources[source]
      if (stub === undefined) {
        throw new Error(`No stub for import ${source}`)
      }
      return `${prefix}${JSON.stringify(stubUrl(source, stub))}`
    },
  )
  return import(
    /* @vite-ignore */ dataUrl(
      `${runtime}${linked}\n// evaluation ${++evaluations}`,
    )
  )
}

/** Runs a provider's extracted handler the way the server-fn router does. */
export async function callProvider(
  provider: string | Record<string, any>,
  name: string,
  stubs: Record<string, ModuleStub> = {},
  data?: unknown,
) {
  const module =
    typeof provider === 'string'
      ? await evaluateModule(provider, stubs)
      : provider
  const handler = module[`${name}_createServerFn_handler`]
  expect(handler, name).toBeTypeOf('function')
  return handler({ data })
}

/** The value of `run`, or the message of the error it throws. */
export function settle(run: () => unknown) {
  try {
    return run()
  } catch (error) {
    return `throws: ${(error as Error).message}`
  }
}

export const serverOnlyError =
  'throws: createServerOnlyFn() functions can only be called on the server!'
export const clientOnlyError =
  'throws: createClientOnlyFn() functions can only be called on the client!'

type HydratePlugin = ReturnType<typeof createHydrateCompilerPlugin>

/** The `<Hydrate>` chunk ids a compiled module imports, in source order. */
export function getChunkIds(code: string) {
  return [...code.matchAll(/import\((["'])(.+?)\1\)/g)]
    .map(([, , id]) => id!)
    .filter((id) => id.includes('tss-hydrate='))
}

/** Boundary ids (`h` props) a compiled module renders, in source order. */
export function getBoundaryIds(code: string) {
  return [...code.matchAll(/\bh=\s*["']([^"']+)["']/g)].map(([, id]) => id!)
}

/** Loads a `<Hydrate>` chunk the way the bundler loads the virtual module. */
export function loadChunk(
  plugin: HydratePlugin,
  env: 'client' | 'server',
  id: string,
) {
  return (
    plugin.loadVirtualModule?.({
      id,
      root: '/test',
      env,
      envName: env === 'client' ? 'client' : 'ssr',
    })?.code ?? null
  )
}

/**
 * Compiles a module with `<Hydrate>` and loads the split chunks it imports,
 * ordered by boundary index.
 */
export async function compileHydrate(env: 'client' | 'server', code: string) {
  const plugin = createHydrateCompilerPlugin()
  const { compile } = createStartCompiler({ env, compilerPlugins: [plugin] })
  const parent = await compile(code)
  if (parent === null) {
    throw new Error('expected the module to be transformed')
  }
  const chunks = getChunkIds(parent).map((id) => {
    const chunk = loadChunk(plugin, env, id)
    if (chunk === null) {
      throw new Error(`expected virtual module ${id} to load`)
    }
    return chunk
  })
  // Order chunks by boundary index, however the parent declares them.
  const index = (chunk: string) =>
    Number(chunk.match(/export function H(\d+)\(/)?.[1] ?? -1)
  chunks.sort((a, b) => index(a) - index(b))
  return { parent, chunks, plugin }
}

/**
 * Loads the first chunk a parent module imports and compiles it for the
 * client under its virtual module id, like the bundler does.
 */
export async function compileFirstChunk(plugin: HydratePlugin, parent: string) {
  const id = getChunkIds(parent)[0]!
  const { compile, serverFns } = createStartCompiler({
    env: 'client',
    compilerPlugins: [plugin],
  })
  const code = await compile(loadChunk(plugin, 'client', id)!, id)
  return { code, serverFns }
}

/** Exported function declarations: name and parameter list. */
const exportedFunction =
  /export\s+(?:default\s+)?function\s*([\w$]*)\s*\(([^)]*)\)/g

/**
 * The names the component of a split chunk receives as props, sorted. The
 * component is the generated `H<index>` export, else the only exported
 * function.
 */
export function getChunkParams(chunk: string) {
  const components = [...chunk.matchAll(exportedFunction)]
  const component =
    components.find(([, name]) => /^H\d+$/.test(name!)) ??
    (components.length === 1 ? components[0] : undefined)
  const params = component?.[2] ?? ''
  return [...params.matchAll(/[\w$]+/g)].map(([name]) => name).sort()
}

/**
 * The component an evaluated `<Hydrate>` chunk exports: the generated
 * `H<index>` export, else the only exported function.
 */
export function getChunkComponent(module: Record<string, any>) {
  const functions = Object.keys(module).filter(
    (key) => typeof module[key] === 'function',
  )
  const name =
    functions.find((key) => /^H\d+$/.test(key)) ??
    (functions.length === 1 ? functions[0] : undefined)
  if (!name) {
    throw new Error('expected the chunk to export a component')
  }
  return module[name] as (props: Record<string, unknown>) => any
}

/** Renders the component a `<Hydrate>` chunk exports with the given props. */
export async function renderChunk(
  chunk: string,
  props: Record<string, unknown> = {},
  stubs: Record<string, ModuleStub> = {},
) {
  return getChunkComponent(await evaluateModule(chunk, stubs))(props)
}

/** Parent-module stubs: `<Hydrate>` marks where its children render, lazy chunks render their props. */
export const hydrateParentStubs = {
  '@tanstack/react-start': {
    Hydrate: (props: { children: unknown }) => `[${props.children ?? ''}]`,
  },
  '@tanstack/react-start/hydration': {
    idle: () => 'idle',
    visible: () => 'visible',
  },
  '@tanstack/react-router': {
    lazyRouteComponent: () => (props: Record<string, unknown>) =>
      `lazy(${Object.keys(props)
        .filter((name) => name !== 'children')
        .sort()
        .map((name) => `${name}=${String(props[name])}`)
        .join(',')})`,
  },
}

/**
 * Import sources of a `<Hydrate>` module that name the parent module, with any
 * query or hash: a chunk may import the module bindings it shares with the
 * parent instead of declaring its own copy.
 */
export function parentImportSources(code: string) {
  return importSources(code).filter((source) =>
    [moduleId, './module.tsx', './module'].includes(
      source.replace(/[?#].*$/, ''),
    ),
  )
}

/**
 * Evaluates a client `<Hydrate>` parent and links its modules like a bundler.
 * An import of the parent module (`parentImportSources`) resolves to the
 * virtual module the Hydrate plugin loads for that id, evaluated once and
 * shared by the parent and its chunks, or else to the evaluated parent.
 * Returns the parent module and `parentModuleStubs(chunk)`, the stubs that
 * link a chunk's parent imports.
 */
export async function evaluateHydrateParent(
  plugin: HydratePlugin,
  parent: string,
  stubs: Record<string, ModuleStub> = hydrateParentStubs,
  runtime?: string,
) {
  const virtualModules = new Map<string, Promise<Record<string, unknown>>>()
  const link = async (code: string, parentModule?: Record<string, unknown>) => {
    const linked: Record<string, ModuleStub> = {}
    for (const source of parentImportSources(code)) {
      const id = `${moduleId}${source.match(/[?#].*$/)?.[0] ?? ''}`
      const virtualModule = loadChunk(plugin, 'client', id)
      if (virtualModule !== null) {
        if (!virtualModules.has(id)) {
          const linkedModule = link(virtualModule, parentModule).then(
            (imports) =>
              evaluateModule(virtualModule, { ...stubs, ...imports }, runtime),
          )
          virtualModules.set(id, linkedModule)
        }
        linked[source] = await virtualModules.get(id)!
      } else if (parentModule) {
        linked[source] = parentModule
      } else {
        throw new Error(`Cannot link ${source} before the parent is evaluated`)
      }
    }
    return linked
  }
  const module: Record<string, any> = await evaluateModule(
    parent,
    { ...stubs, ...(await link(parent)) },
    runtime,
  )
  return {
    module,
    parentModuleStubs: (chunk: string) => link(chunk, module),
  }
}
