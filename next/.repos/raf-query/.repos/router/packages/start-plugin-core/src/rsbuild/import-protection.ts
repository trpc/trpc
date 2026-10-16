import { writeFileSync } from 'node:fs'
import { dirname, extname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  getDefaultImportProtectionRules,
  getMarkerSpecifiers,
} from '../import-protection/defaults'
import { normalizePath } from '../utils'
import { ExtensionlessAbsoluteIdResolver } from '../import-protection/extensionlessAbsoluteIdResolver'
import { compileMatchers } from '../import-protection/matchers'
import {
  getImportProtectionEnvType,
  getImportProtectionRelativePath,
  getImportProtectionRulesForEnvironment,
  shouldCheckImportProtectionImporter,
} from '../import-protection/adapterUtils'
import {
  ImportLocCache,
  buildCodeSnippet,
  createImportSpecifierLocationIndex,
  findImportStatementLocationFromTransformed,
  findOriginalUsageLocation,
  findPostCompileUsageLocation,
  normalizeSourceMap,
  pickOriginalCodeFromSourcesContent,
} from '../import-protection/sourceLocation'
import {
  ImportGraph,
  buildTrace,
  formatViolation,
} from '../import-protection/trace'
import {
  loadMockEdgeModule,
  loadMockRuntimeModule,
  loadSilentMockModule,
} from '../import-protection/virtualModules'
import {
  buildSourceCandidates,
  clearNormalizeFilePathCache,
  dedupePatterns,
  dedupeViolationKey,
  isFileExcluded,
  normalizeFilePath,
} from '../import-protection/utils'
import type {
  ImportProtectionBehavior,
  ImportProtectionOptions,
} from '../schema'
import type { CompiledMatcher } from '../import-protection/matchers'
import type { FileMatchers } from '../import-protection/utils'
import type {
  SourceMapLike,
  TransformResult,
  TransformResultProvider,
} from '../import-protection/sourceLocation'
import type { Loc, TraceStep, ViolationInfo } from '../import-protection/trace'
import type { CompileStartFrameworkOptions, GetConfigFn } from '../types'
import type {
  ModifyRspackConfigFn,
  RsbuildPluginAPI,
  Rspack,
  rspack as rspackNamespaceType,
} from '@rsbuild/core'

type RspackNamespace = typeof rspackNamespaceType
type RspackVirtualModulesPlugin = Pick<
  InstanceType<RspackNamespace['experiments']['VirtualModulesPlugin']>,
  'writeModule'
>
type ProcessAssetsContext = Parameters<
  Parameters<RsbuildPluginAPI['processAssets']>[1]
>[0]
type ModifyRspackConfig = Parameters<ModifyRspackConfigFn>[0]
type ModifyRspackConfigUtils = Parameters<ModifyRspackConfigFn>[1]
type ImportProtectionRspackConfig = {
  module: Pick<ModifyRspackConfig['module'], 'rules'>
  plugins: Array<Rspack.Plugin | RspackVirtualModulesPlugin>
}
type ImportProtectionModifyRspackConfigUtils = {
  environment: Pick<ModifyRspackConfigUtils['environment'], 'name'>
  rspack: {
    experiments: {
      VirtualModulesPlugin: new (
        modules: Record<string, string>,
      ) => RspackVirtualModulesPlugin
    }
  }
}
type ImportProtectionRsbuildPluginAPI = {
  context: Pick<RsbuildPluginAPI['context'], 'action'>
  onBeforeBuild: (handler: () => void) => void
  onBeforeDevCompile: (handler: () => void) => void
  modifyRspackConfig: (
    handler: (
      config: ImportProtectionRspackConfig,
      utils: ImportProtectionModifyRspackConfigUtils,
    ) => void,
  ) => void
  processAssets: RsbuildPluginAPI['processAssets']
}
type ImportProtectionGetConfigFn = () => {
  startConfig: Pick<ReturnType<GetConfigFn>['startConfig'], 'importProtection'>
  resolvedStartConfig: Pick<
    ReturnType<GetConfigFn>['resolvedStartConfig'],
    'root' | 'srcDirectory'
  >
}
type RspackCompilation = Rspack.Compilation
type RspackModule = Rspack.Module
type RspackDependency = Rspack.Dependency
type RspackInputFileSystem = NonNullable<RspackCompilation['inputFileSystem']>

export type ImportProtectionMarkerKind = 'server' | 'client'
export interface ImportProtectionMarker {
  kind: ImportProtectionMarkerKind
  source: string
}

export const IMPORT_PROTECTION_BUILD_INFO_FIELD =
  'tanstack.start.importProtection'

type PerfTiming = {
  count: number
  totalMs: number
  maxMs: number
}

export type PerfCollector = {
  count: (name: string, value?: number) => void
  time: (name: string, startedAt: number) => void
  flush: (root: string, envName: string, phase: string) => void
}

function isPerfEnabled(): boolean {
  return (
    process.env.TSR_IMPORT_PROTECTION_PERF === '1' ||
    process.env.TSR_IMPORT_PROTECTION_PERF === 'true'
  )
}

function createPerfCollector(): PerfCollector {
  const counters = new Map<string, number>()
  const timings = new Map<string, PerfTiming>()
  const flushEnvironments = new Set<string>()
  let flushCount = 0

  return {
    count(name, value = 1) {
      counters.set(name, (counters.get(name) ?? 0) + value)
    },
    time(name, startedAt) {
      const duration = performance.now() - startedAt
      const timing = timings.get(name)
      if (timing) {
        timing.count++
        timing.totalMs += duration
        timing.maxMs = Math.max(timing.maxMs, duration)
      } else {
        timings.set(name, { count: 1, totalMs: duration, maxMs: duration })
      }
    },
    flush(root, envName, phase) {
      flushCount++
      flushEnvironments.add(envName)

      const payload = {
        adapter: 'rsbuild',
        root,
        phase,
        flushCount,
        flushEnvironments: Array.from(flushEnvironments).sort(),
        counters: Object.fromEntries(counters),
        timings: Object.fromEntries(
          Array.from(timings, ([name, timing]) => [
            name,
            {
              count: timing.count,
              totalMs: Number(timing.totalMs.toFixed(3)),
              avgMs: Number((timing.totalMs / timing.count).toFixed(3)),
              maxMs: Number(timing.maxMs.toFixed(3)),
            },
          ]),
        ),
      }

      const file = process.env.TSR_IMPORT_PROTECTION_PERF_FILE
      if (file) {
        writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`)
      } else {
        console.warn(
          `[import-protection:perf] ${JSON.stringify(payload, null, 2)}`,
        )
      }
    },
  }
}

export interface EnvRules {
  specifiers: Array<CompiledMatcher>
  files: Array<CompiledMatcher>
  excludeFiles: Array<CompiledMatcher>
}

export interface PluginConfig {
  enabled: boolean
  root: string
  command: 'build' | 'serve'
  srcDirectory: string
  framework: CompileStartFrameworkOptions
  effectiveBehavior: ImportProtectionBehavior
  mockAccess: 'error' | 'warn' | 'off'
  logMode: 'once' | 'always'
  maxTraceDepth: number
  compiledRules: {
    client: EnvRules
    server: EnvRules
  }
  includeMatchers: Array<CompiledMatcher>
  excludeMatchers: Array<CompiledMatcher>
  ignoreImporterMatchers: Array<CompiledMatcher>
  markerSpecifiers: {
    serverOnly: Set<string>
    clientOnly: Set<string>
  }
  envTypeMap: Map<string, 'client' | 'server'>
  onViolation?: (
    info: ViolationInfo,
  ) => boolean | void | Promise<boolean | void>
}

export interface EnvRuntimeState {
  resolveCache: Map<string, string | null>
  seenViolations: Set<string>
}

export interface SharedState {
  root: string
  virtualModules: Map<string, string>
  vmPlugins: Record<string, RspackVirtualModulesPlugin>
  readyVmPlugins: Record<string, boolean>
  pendingWrites: Map<string, Map<string, string>>
}

interface CompilationEdge {
  importerModule: RspackModule
  specifier?: string
  resolved: string
  resolvedModule: RspackModule
}

interface CompilationEdgeIndex {
  edges: Array<CompilationEdge>
  edgeByKey: Map<string, CompilationEdge>
  edgesByModules: Map<string, Array<CompilationEdge>>
}

interface CompilationImportGraph {
  importGraph: ImportGraph
  edgeIndex: CompilationEdgeIndex
}

interface CompilationTransformResultProvider {
  getTransformResult: (
    module: RspackModule,
  ) => Promise<TransformResult | undefined>
}

// An identity-only snapshot of one module's compilation connections.
// Derived paths, requests, locations, and diagnostic indexes live elsewhere.
interface CompilationImport {
  dependency: RspackDependency
  module: RspackModule
}

interface RspackModuleGraphNode {
  module: RspackModule
  imports: Array<CompilationImport>
}

interface MockEdgePayload {
  exports: Array<string>
  runtimeId: string
  violation: {
    env: string
    envType: 'client' | 'server'
    importer: string
    specifier: string
    resolved?: string
    patternText: string
  }
}

interface ModuleGraphEdge {
  importer: RspackModule
  module: RspackModule
}

type CompilationViolation =
  | {
      type: 'specifier'
      payload: MockEdgePayload
      edge: ModuleGraphEdge
    }
  | {
      type: 'file'
      edge: ModuleGraphEdge
      source: string
      pattern: string | RegExp
    }
  | {
      type: 'marker'
      importer: RspackModule
      source: string
    }

type ResolvedImportProtectionCheck =
  | { type: 'file'; fileMatch: FileMatchers['files'][number] }
  | { type: 'marker' }

const IMPORT_PROTECTION_VIRTUAL_DIR = 'node_modules/.virtual/import-protection'
const MOCK_EDGE_FILE_PREFIX = 'mock-edge-'
const MOCK_RUNTIME_FILE_PREFIX = 'mock-runtime-'
const MOCK_SILENT_FILE = 'mock-silent.mjs'
const currentDir = dirname(fileURLToPath(import.meta.url))
const importProtectionLoader = resolvePath(
  currentDir,
  'import-protection-loader.js',
)

function toBase64Url(input: unknown): string {
  return Buffer.from(JSON.stringify(input), 'utf8').toString('base64url')
}

function fromBase64Url<T>(input: string): T {
  return JSON.parse(Buffer.from(input, 'base64url').toString('utf8')) as T
}

export function getRulesForEnvironment(
  config: PluginConfig,
  envName: string,
): EnvRules {
  return getImportProtectionRulesForEnvironment(config, envName) as EnvRules
}

export function serializePattern(pattern: string | RegExp): string {
  return typeof pattern === 'string' ? pattern : pattern.toString()
}

function dedupeKey(info: ViolationInfo): string {
  return dedupeViolationKey(info)
}

export function getRsbuildResolvedImportProtectionCheck(
  relativeResolved: string,
  matchers: FileMatchers,
): ResolvedImportProtectionCheck | undefined {
  if (isFileExcluded(relativeResolved, matchers)) {
    return undefined
  }

  const fileMatch = matchers.files.find((matcher) =>
    matcher.test(relativeResolved),
  )
  if (fileMatch) {
    return { type: 'file', fileMatch }
  }

  return { type: 'marker' }
}

export function getOrCreateEnvState(
  envStates: Map<string, EnvRuntimeState>,
  envName: string,
): EnvRuntimeState {
  let env = envStates.get(envName)

  if (!env) {
    env = {
      resolveCache: new Map(),
      seenViolations: new Set(),
    }
    envStates.set(envName, env)
  }

  return env
}

export function shouldCheckImporterWithCache(opts: {
  config: PluginConfig
  cache: Map<string, boolean>
  perf?: PerfCollector
  file: string
}): boolean {
  const normalizedFile = normalizeFilePath(opts.file)
  const cached = opts.cache.get(normalizedFile)
  if (cached !== undefined) {
    opts.perf?.count('shouldCheckImporter.cached')
    return cached
  }

  const result = shouldCheckImportProtectionImporter(
    opts.config,
    normalizedFile,
  )
  opts.cache.set(normalizedFile, result)
  return result
}

function getVirtualModulePath(
  root: string,
  envName: string,
  filename: string,
): string {
  return normalizePath(
    resolvePath(root, IMPORT_PROTECTION_VIRTUAL_DIR, envName, filename),
  )
}

function queuePendingWrite(
  shared: SharedState,
  envName: string,
  filePath: string,
  code: string,
): void {
  let writes = shared.pendingWrites.get(envName)
  if (!writes) {
    writes = new Map()
    shared.pendingWrites.set(envName, writes)
  }

  writes.set(filePath, code)
}

function tryWriteVirtualModule(
  shared: SharedState,
  envName: string,
  filePath: string,
  code: string,
): string {
  const current = shared.virtualModules.get(filePath)
  if (current === code) {
    return filePath
  }

  shared.virtualModules.set(filePath, code)

  const vmPlugin = shared.vmPlugins[envName]
  if (!vmPlugin || !shared.readyVmPlugins[envName]) {
    queuePendingWrite(shared, envName, filePath, code)
    return filePath
  }

  vmPlugin.writeModule(filePath, code)
  return filePath
}

function flushPendingWrites(shared: SharedState, envName: string): void {
  const writes = shared.pendingWrites.get(envName)
  if (!writes?.size || !shared.readyVmPlugins[envName]) {
    return
  }

  for (const [filePath, code] of writes) {
    shared.vmPlugins[envName]?.writeModule(filePath, code)
    writes.delete(filePath)
  }

  if (writes.size === 0) {
    shared.pendingWrites.delete(envName)
  }
}

export function ensureSilentMockModule(
  shared: SharedState,
  envName: string,
): string {
  return tryWriteVirtualModule(
    shared,
    envName,
    getVirtualModulePath(shared.root, envName, MOCK_SILENT_FILE),
    loadSilentMockModule().code,
  )
}

export function ensureRuntimeMockModule(opts: {
  shared: SharedState
  envName: string
  mode: 'error' | 'warn' | 'off'
  env: string
  importer: string
  specifier: string
}): string {
  const encoded = toBase64Url({
    mode: opts.mode,
    env: opts.env,
    importer: opts.importer,
    specifier: opts.specifier,
    trace: [],
  })

  return tryWriteVirtualModule(
    opts.shared,
    opts.envName,
    getVirtualModulePath(
      opts.shared.root,
      opts.envName,
      `${MOCK_RUNTIME_FILE_PREFIX}${encoded}.mjs`,
    ),
    loadMockRuntimeModule(encoded).code,
  )
}

export function ensureMockEdgeModule(opts: {
  shared: SharedState
  envName: string
  payload: MockEdgePayload
}): string {
  const encoded = toBase64Url(opts.payload)

  return tryWriteVirtualModule(
    opts.shared,
    opts.envName,
    getVirtualModulePath(
      opts.shared.root,
      opts.envName,
      `${MOCK_EDGE_FILE_PREFIX}${encoded}.mjs`,
    ),
    loadMockEdgeModule(encoded).code,
  )
}

function getMockEdgePayloadFromFile(
  filePath: string,
): MockEdgePayload | undefined {
  const match = /(?:^|[\\/])mock-edge-([^/\\]+)\.mjs$/.exec(filePath)
  if (!match) {
    return undefined
  }

  try {
    return fromBase64Url<MockEdgePayload>(match[1]!)
  } catch {
    return undefined
  }
}

function getModuleResource(module: RspackModule): string {
  const resourceResolveData = (
    module as RspackModule & {
      resourceResolveData?: { path?: string; resource?: string }
    }
  ).resourceResolveData

  return normalizeFilePath(
    resourceResolveData?.path ??
      resourceResolveData?.resource ??
      module.identifier(),
  )
}

const IMPORT_PROTECTION_PARSEABLE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
])

function isImportProtectionSourceFile(file: string | undefined): boolean {
  if (!file) {
    return false
  }

  const extension = extname(normalizeFilePath(file))
  return (
    extension.length > 0 &&
    IMPORT_PROTECTION_PARSEABLE_EXTENSIONS.has(extension)
  )
}

function readModuleSourceFromInputFileSystem(
  inputFileSystem: RspackInputFileSystem | null,
  file: string,
): Promise<string | undefined> {
  if (!inputFileSystem) {
    return Promise.resolve(undefined)
  }

  return new Promise((resolve) => {
    inputFileSystem.readFile(file, (error, data) => {
      if (error || data == null) {
        resolve(undefined)
        return
      }

      resolve(String(data))
    })
  })
}

function buildTransformResultProvider(opts: {
  root: string
  perf?: PerfCollector
  inputFileSystem: RspackInputFileSystem | null
}): CompilationTransformResultProvider {
  const resultByModule = new WeakMap<RspackModule, TransformResult>()
  const loadingResultByModule = new WeakMap<
    RspackModule,
    Promise<TransformResult | undefined>
  >()
  const missingSource = new WeakSet<RspackModule>()

  async function loadModuleTransformResult(
    module: RspackModule,
  ): Promise<TransformResult | undefined> {
    opts.perf?.count('processAssets.provider.modulesLoaded')
    const resource = getModuleResource(module)
    let code: string | undefined
    let map: SourceMapLike | undefined

    const source = module.originalSource()
    if (source) {
      const sourceAndMapStartedAt = opts.perf ? performance.now() : 0
      const sourceAndMap = source.sourceAndMap()
      if (opts.perf) {
        opts.perf.time(
          'processAssets.provider.sourceAndMap',
          sourceAndMapStartedAt,
        )
      }
      code = String(sourceAndMap.source)
      map = normalizeSourceMap(sourceAndMap.map as SourceMapLike | null)
    }

    const originalCodeStartedAt = opts.perf ? performance.now() : 0
    let originalCode = map?.sourcesContent
      ? pickOriginalCodeFromSourcesContent(map, resource, opts.root)
      : undefined
    if (originalCode === undefined) {
      originalCode = await readModuleSourceFromInputFileSystem(
        opts.inputFileSystem,
        resource,
      )
      if (originalCode !== undefined) {
        opts.perf?.count('processAssets.provider.inputFileSystemReads')
      }
    }
    if (opts.perf) {
      opts.perf.time(
        'processAssets.provider.originalCode',
        originalCodeStartedAt,
      )
    }

    code ??= originalCode
    if (code === undefined) {
      missingSource.add(module)
      return undefined
    }

    const result: TransformResult = {
      code,
      filename: resource,
      map,
      originalCode,
      perf: opts.perf,
    }
    resultByModule.set(module, result)
    return result
  }

  return {
    getTransformResult(module) {
      if (missingSource.has(module)) {
        return Promise.resolve(undefined)
      }

      const cached = resultByModule.get(module)
      if (cached) {
        return Promise.resolve(cached)
      }

      const loading = loadingResultByModule.get(module)
      if (loading) {
        return loading
      }

      const result = loadModuleTransformResult(module)
      loadingResultByModule.set(module, result)
      return result
    },
  }
}

function getCompilationEdgeKey(
  importer: string,
  resolved: string,
  specifier: string | undefined,
): string {
  return `${importer}\0${resolved}\0${specifier ?? ''}`
}

function getCompilationModulesKey(importer: string, resolved: string): string {
  return `${importer}\0${resolved}`
}

function hasModuleError(module: RspackModule): boolean {
  return 'error' in module && Boolean(module.error)
}

function forEachEntryModule(opts: {
  compilation: RspackCompilation
  visitModule: (module: RspackModule) => void
}): void {
  for (const entry of opts.compilation.entries.values()) {
    for (const dependency of entry.dependencies) {
      const connection = opts.compilation.moduleGraph.getConnection(dependency)
      const module = connection?.module
      if (!module || hasModuleError(module)) {
        continue
      }
      opts.visitModule(module)
    }
  }
}

function addEntryModulesToGraph(opts: {
  compilation: RspackCompilation
  importGraph: ImportGraph
}): void {
  forEachEntryModule({
    compilation: opts.compilation,
    visitModule(module) {
      opts.importGraph.addEntry(getModuleResource(module))
    },
  })
}

function forEachModules(opts: {
  compilation: RspackCompilation
  modules: Array<RspackModule>
  visitNode: (node: RspackModuleGraphNode) => void
}): Array<RspackModuleGraphNode> {
  const nodes: Array<RspackModuleGraphNode> = []

  for (const module of opts.modules) {
    if (hasModuleError(module)) {
      continue
    }

    const imports: Array<CompilationImport> = []
    const importIndexByModule = new WeakMap<RspackModule, number>()
    const connections =
      opts.compilation.moduleGraph.getOutgoingConnectionsInOrder(module)

    for (const connection of connections) {
      const connectedModule = connection.module
      if (!connectedModule) {
        continue
      }

      // Only consider modules that are not errored
      if (hasModuleError(connectedModule)) {
        continue
      }

      const existingImportIndex = importIndexByModule.get(connectedModule)
      if (existingImportIndex !== undefined) {
        continue
      }

      importIndexByModule.set(connectedModule, imports.length)

      imports.push({
        dependency: connection.dependency,
        module: connectedModule,
      })
    }

    const node = { module, imports }
    nodes.push(node)
    opts.visitNode(node)
  }

  return nodes
}

interface MarkerCheckTarget {
  importer: RspackModule
  module: RspackModule
}

type FileViolation = Extract<CompilationViolation, { type: 'file' }>

interface CompilationViolationScanner {
  visitEntry: (module: RspackModule) => void
  visitNode: (node: RspackModuleGraphNode) => void
  finish: () => Array<CompilationViolation>
}

function createCompilationViolationScanner(opts: {
  config: PluginConfig
  envType: 'client' | 'server'
  matchers: FileMatchers
  shouldCheckImporter: (importer: string) => boolean
}): CompilationViolationScanner {
  const specifierViolations: Array<CompilationViolation> = []
  const fileViolations: Array<FileViolation> = []
  const markerCheckTargets: Array<MarkerCheckTarget> = []
  const mockPayloadByModule = new WeakMap<
    RspackModule,
    MockEdgePayload | null
  >()

  const getMockPayload = (module: RspackModule) => {
    const cached = mockPayloadByModule.get(module)
    if (cached !== undefined) {
      return cached ?? undefined
    }

    const payload = getMockEdgePayloadFromFile(getModuleResource(module))
    mockPayloadByModule.set(module, payload ?? null)
    return payload
  }

  return {
    visitEntry(module) {
      markerCheckTargets.push({ importer: module, module })
    },
    visitNode(node) {
      const importer = getModuleResource(node.module)
      if (!isImportProtectionSourceFile(importer)) {
        return
      }

      const shouldCheckImporter = opts.shouldCheckImporter(importer)

      for (const imported of node.imports) {
        const source = imported.dependency.request

        if (shouldCheckImporter) {
          const payload = getMockPayload(imported.module)
          if (payload?.violation.importer === importer) {
            specifierViolations.push({
              type: 'specifier',
              payload,
              edge: {
                importer: node.module,
                module: imported.module,
              },
            })
          }
        }

        if (!source) {
          continue
        }

        const resolved = getModuleResource(imported.module)
        const relativeResolved = getImportProtectionRelativePath(
          opts.config.root,
          resolved,
        )
        const importProtectionCheck = getRsbuildResolvedImportProtectionCheck(
          relativeResolved,
          opts.matchers,
        )
        if (!importProtectionCheck) {
          continue
        }

        if (importProtectionCheck.type === 'marker') {
          markerCheckTargets.push({
            importer: node.module,
            module: imported.module,
          })
          continue
        }

        if (shouldCheckImporter) {
          fileViolations.push({
            type: 'file',
            edge: {
              importer: node.module,
              module: imported.module,
            },
            source,
            pattern: importProtectionCheck.fileMatch.pattern,
          })
        }
      }
    },
    finish() {
      const violations = [...specifierViolations, ...fileViolations]
      const checkedMarkerModules = new WeakSet<RspackModule>()

      for (const target of markerCheckTargets) {
        if (!opts.shouldCheckImporter(getModuleResource(target.importer))) {
          continue
        }

        if (checkedMarkerModules.has(target.module)) {
          continue
        }
        checkedMarkerModules.add(target.module)

        const marker = getMarkerForModule(target.module)
        const violatesMarker =
          (opts.envType === 'client' && marker?.kind === 'server') ||
          (opts.envType === 'server' && marker?.kind === 'client')
        if (!violatesMarker) {
          continue
        }

        violations.push({
          type: 'marker',
          importer: target.module,
          source: marker.source,
        })
      }

      return violations
    },
  }
}

function buildCompilationImportGraph(opts: {
  compilation: RspackCompilation
  nodes: Array<RspackModuleGraphNode>
}): CompilationImportGraph {
  const importGraph = new ImportGraph()
  const edges: Array<CompilationEdge> = []
  const edgeByKey = new Map<string, CompilationEdge>()
  const edgesByModules = new Map<string, Array<CompilationEdge>>()

  addEntryModulesToGraph({
    compilation: opts.compilation,
    importGraph,
  })

  for (const node of opts.nodes) {
    const importer = getModuleResource(node.module)
    for (const imported of node.imports) {
      const resolved = getModuleResource(imported.module)
      const specifier = imported.dependency.request
      const edge = {
        importerModule: node.module,
        specifier,
        resolved,
        resolvedModule: imported.module,
      }
      edges.push(edge)
      importGraph.addEdge(resolved, importer, specifier)

      const edgeKey = getCompilationEdgeKey(importer, resolved, specifier)
      if (!edgeByKey.has(edgeKey)) {
        edgeByKey.set(edgeKey, edge)
      }

      const modulesKey = getCompilationModulesKey(importer, resolved)
      const moduleEdges = edgesByModules.get(modulesKey)
      if (moduleEdges) {
        moduleEdges.push(edge)
      } else {
        edgesByModules.set(modulesKey, [edge])
      }
    }
  }

  return {
    importGraph,
    edgeIndex: {
      edges,
      edgeByKey,
      edgesByModules,
    },
  }
}

function findCompilationEdge(
  edgeIndex: CompilationEdgeIndex,
  importer: string,
  resolved: string,
  specifier?: string,
): CompilationEdge | undefined {
  if (specifier) {
    const exact = edgeIndex.edgeByKey.get(
      getCompilationEdgeKey(importer, resolved, specifier),
    )
    if (exact) {
      return exact
    }
  }

  return edgeIndex.edgesByModules.get(
    getCompilationModulesKey(importer, resolved),
  )?.[0]
}

const compilationImportSpecifierLocationIndex =
  createImportSpecifierLocationIndex()

async function resolveImporterLocation(opts: {
  config: PluginConfig
  provider: CompilationTransformResultProvider
  importer: string
  importerModule: RspackModule
  source: string
  resolved?: string
  transformedSources?: Array<string>
  envType: 'client' | 'server'
}): Promise<Loc | undefined> {
  const transformResult = await opts.provider.getTransformResult(
    opts.importerModule,
  )
  const provider: TransformResultProvider = {
    getTransformResult: () => transformResult,
  }
  const originalResult: TransformResult | undefined =
    transformResult?.originalCode !== undefined
      ? {
          code: transformResult.originalCode,
          filename: transformResult.filename,
          map: undefined,
          originalCode: transformResult.originalCode,
          perf: transformResult.perf,
        }
      : undefined
  const originalProvider: TransformResultProvider = {
    getTransformResult: () => originalResult,
  }
  const sourceCandidates = buildSourceCandidates(
    opts.source,
    opts.resolved,
    opts.config.root,
  )
  for (const transformedSource of opts.transformedSources ?? []) {
    for (const candidate of buildSourceCandidates(
      transformedSource,
      undefined,
      opts.config.root,
    )) {
      sourceCandidates.add(candidate)
    }
  }

  const importLocCache = new ImportLocCache()
  const originalImportLocCache = new ImportLocCache()
  for (const source of sourceCandidates) {
    const loc =
      findOriginalUsageLocation(
        provider,
        opts.importer,
        source,
        opts.envType,
        opts.config.root,
      ) ??
      (await findPostCompileUsageLocation(provider, opts.importer, source)) ??
      (await findImportStatementLocationFromTransformed(
        provider,
        opts.importer,
        source,
        importLocCache,
        compilationImportSpecifierLocationIndex.find,
      )) ??
      (await findImportStatementLocationFromTransformed(
        originalProvider,
        opts.importer,
        source,
        originalImportLocCache,
        compilationImportSpecifierLocationIndex.find,
      ))
    if (loc) {
      return loc
    }
  }

  return undefined
}

async function resolveTraceEdgeLocation(opts: {
  root: string
  provider: CompilationTransformResultProvider
  importLocCache: ImportLocCache
  importer: string
  edge: CompilationEdge
  specifier?: string
}): Promise<Loc | undefined> {
  if (!opts.specifier) {
    return undefined
  }

  const transformResult = await opts.provider.getTransformResult(
    opts.edge.importerModule,
  )
  const provider: TransformResultProvider = {
    getTransformResult: () => transformResult,
  }
  for (const source of buildSourceCandidates(
    opts.specifier,
    opts.edge.resolved,
    opts.root,
  )) {
    const loc = await findImportStatementLocationFromTransformed(
      provider,
      opts.importer,
      source,
      opts.importLocCache,
      compilationImportSpecifierLocationIndex.find,
    )
    if (loc) {
      return loc
    }
  }

  return undefined
}

async function rebuildAndAnnotateTrace(opts: {
  root: string
  provider: CompilationTransformResultProvider
  importGraph: ImportGraph
  edgeIndex: CompilationEdgeIndex
  importer: string
  specifier: string
  importerLoc?: Loc
  maxTraceDepth: number
}): Promise<Array<TraceStep>> {
  const trace = buildTrace(opts.importGraph, opts.importer, opts.maxTraceDepth)
  const importLocCache = new ImportLocCache()

  for (let i = 0; i < trace.length - 1; i++) {
    const step = trace[i]!
    const next = trace[i + 1]!
    const edge = findCompilationEdge(
      opts.edgeIndex,
      step.file,
      next.file,
      step.specifier,
    )
    const loc = edge
      ? await resolveTraceEdgeLocation({
          root: opts.root,
          provider: opts.provider,
          importLocCache,
          importer: step.file,
          edge,
          specifier: edge.specifier ?? step.specifier,
        })
      : undefined
    if (loc) {
      step.line = loc.line
      step.column = loc.column
    }
  }

  if (trace.length > 0) {
    const last = trace[trace.length - 1]!
    if (!last.specifier) {
      last.specifier = opts.specifier
    }
    if (opts.importerLoc && last.line == null) {
      last.line = opts.importerLoc.line
      last.column = opts.importerLoc.column
    }
  }

  return trace
}

async function buildViolationInfo(opts: {
  config: PluginConfig
  provider: CompilationTransformResultProvider
  importGraph: ImportGraph
  edgeIndex: CompilationEdgeIndex
  perf?: PerfCollector
  envName: string
  envType: 'client' | 'server'
  importer: string
  importerModule: RspackModule
  source: string
  resolved?: string
  transformedSources?: Array<string>
  type: 'specifier' | 'file' | 'marker'
  pattern?: string | RegExp
}): Promise<ViolationInfo> {
  const startedAt = opts.perf ? performance.now() : 0
  opts.perf?.count('violations.enriched')

  const importerLocStartedAt = opts.perf ? performance.now() : 0
  const importerLoc = await resolveImporterLocation({
    config: opts.config,
    provider: opts.provider,
    importer: opts.importer,
    importerModule: opts.importerModule,
    source: opts.source,
    resolved: opts.resolved,
    transformedSources: opts.transformedSources,
    envType: opts.envType,
  })
  if (opts.perf) {
    opts.perf.time('violations.resolveImporterLocation', importerLocStartedAt)
  }

  const traceStartedAt = opts.perf ? performance.now() : 0
  const trace = await rebuildAndAnnotateTrace({
    root: opts.config.root,
    provider: opts.provider,
    importGraph: opts.importGraph,
    edgeIndex: opts.edgeIndex,
    importer: opts.importer,
    specifier: opts.source,
    importerLoc,
    maxTraceDepth: opts.config.maxTraceDepth,
  })
  if (opts.perf) {
    opts.perf.time('violations.trace', traceStartedAt)
  }

  const snippetStartedAt = opts.perf ? performance.now() : 0
  const transformResult = importerLoc
    ? await opts.provider.getTransformResult(opts.importerModule)
    : undefined
  const snippet = importerLoc
    ? buildCodeSnippet(
        {
          getTransformResult: () => transformResult,
        },
        opts.importer,
        importerLoc,
      )
    : undefined
  if (opts.perf && importerLoc) {
    opts.perf.time('violations.snippet', snippetStartedAt)
  }

  const info = {
    env: opts.envName,
    envType: opts.envType,
    behavior: opts.config.effectiveBehavior,
    type: opts.type,
    pattern: opts.pattern,
    specifier: opts.source,
    importer: opts.importer,
    ...(opts.resolved ? { resolved: opts.resolved } : {}),
    ...(importerLoc ? { importerLoc } : {}),
    trace,
    snippet,
  }

  if (opts.perf) {
    opts.perf.time('violations.enrich', startedAt)
  }

  return info
}

function getMarkerForModule(
  module: RspackModule,
): ImportProtectionMarker | undefined {
  const file = getModuleResource(module)
  if (!isImportProtectionSourceFile(file)) {
    return undefined
  }

  const marker = module.buildInfo[IMPORT_PROTECTION_BUILD_INFO_FIELD]
  if (!marker || typeof marker !== 'object') {
    return undefined
  }

  if (!('kind' in marker) || !('source' in marker)) {
    return undefined
  }

  if (
    (marker.kind !== 'server' && marker.kind !== 'client') ||
    typeof marker.source !== 'string'
  ) {
    return undefined
  }

  return {
    kind: marker.kind,
    source: marker.source,
  }
}

async function reportViolation(opts: {
  config: PluginConfig
  envState: EnvRuntimeState
  compilation: RspackCompilation
  rspack: RspackNamespace
  perf?: PerfCollector
  info: ViolationInfo
}): Promise<void> {
  const key = dedupeKey(opts.info)
  if (
    opts.config.logMode !== 'always' &&
    opts.envState.seenViolations.has(key)
  ) {
    opts.perf?.count('violations.deduped')
    return
  }

  opts.envState.seenViolations.add(key)
  opts.perf?.count('violations.reported')

  if (opts.config.onViolation) {
    const startedAt = opts.perf ? performance.now() : 0
    const result = await opts.config.onViolation(opts.info)
    if (opts.perf) {
      opts.perf.time('violations.onViolation', startedAt)
    }
    if (result === false) {
      opts.perf?.count('violations.suppressed')
      return
    }
  }

  const message = formatViolation(opts.info, opts.config.root)
  const error = new opts.rspack.WebpackError(message)

  if (opts.config.effectiveBehavior === 'error') {
    opts.compilation.errors.push(error)
  } else {
    opts.compilation.warnings.push(error)
  }
}

export function registerImportProtection(
  api: ImportProtectionRsbuildPluginAPI,
  opts: {
    getConfig: ImportProtectionGetConfigFn
    framework: CompileStartFrameworkOptions
    environments: Array<{ name: string; type: 'client' | 'server' }>
  },
): void {
  const perf = isPerfEnabled() ? createPerfCollector() : undefined
  const extensionlessResolver = new ExtensionlessAbsoluteIdResolver()
  const envStates = new Map<string, EnvRuntimeState>()
  const shouldCheckImporterCache = new Map<string, boolean>()
  const config: PluginConfig = {
    enabled: true,
    root: '',
    command: api.context.action === 'dev' ? 'serve' : 'build',
    srcDirectory: '',
    framework: opts.framework,
    effectiveBehavior: 'error',
    mockAccess: 'error',
    logMode: 'once',
    maxTraceDepth: 20,
    compiledRules: {
      client: {
        specifiers: [],
        files: [],
        excludeFiles: [],
      },
      server: {
        specifiers: [],
        files: [],
        excludeFiles: [],
      },
    },
    includeMatchers: [],
    excludeMatchers: [],
    ignoreImporterMatchers: [],
    markerSpecifiers: {
      serverOnly: new Set(),
      clientOnly: new Set(),
    },
    envTypeMap: new Map(opts.environments.map((env) => [env.name, env.type])),
    onViolation: undefined,
  }

  const shared: SharedState = {
    root: '',
    virtualModules: new Map(),
    vmPlugins: {},
    readyVmPlugins: {},
    pendingWrites: new Map(),
  }

  function applyUserConfig(): void {
    const { startConfig, resolvedStartConfig } = opts.getConfig()

    config.root = resolvedStartConfig.root
    config.srcDirectory = resolvedStartConfig.srcDirectory
    shared.root = resolvedStartConfig.root

    const userOpts: ImportProtectionOptions | undefined =
      startConfig.importProtection

    if (userOpts?.enabled === false) {
      config.enabled = false
      return
    }

    config.enabled = true

    const behavior = userOpts?.behavior
    if (typeof behavior === 'string') {
      config.effectiveBehavior = behavior
    } else {
      config.effectiveBehavior =
        config.command === 'serve'
          ? (behavior?.dev ?? 'mock')
          : (behavior?.build ?? 'error')
    }

    config.logMode = userOpts?.log ?? 'once'
    config.mockAccess = userOpts?.mockAccess ?? 'error'
    config.maxTraceDepth = userOpts?.maxTraceDepth ?? 20
    config.onViolation = userOpts?.onViolation
      ? (info) => userOpts.onViolation?.(info)
      : undefined

    const defaults = getDefaultImportProtectionRules()
    const pick = <T>(user: Array<T> | undefined, fallback: Array<T>) =>
      user ? [...user] : [...fallback]

    const clientSpecifiers = dedupePatterns([
      ...defaults.client.specifiers,
      ...(userOpts?.client?.specifiers ?? []),
    ])

    config.compiledRules.client = {
      specifiers: compileMatchers(clientSpecifiers),
      files: compileMatchers(
        pick(userOpts?.client?.files, defaults.client.files),
      ),
      excludeFiles: compileMatchers(
        pick(userOpts?.client?.excludeFiles, defaults.client.excludeFiles),
      ),
    }

    config.compiledRules.server = {
      specifiers: compileMatchers(
        dedupePatterns(
          pick(userOpts?.server?.specifiers, defaults.server.specifiers),
        ),
      ),
      files: compileMatchers(
        pick(userOpts?.server?.files, defaults.server.files),
      ),
      excludeFiles: compileMatchers(
        pick(userOpts?.server?.excludeFiles, defaults.server.excludeFiles),
      ),
    }

    config.includeMatchers = compileMatchers(userOpts?.include ?? [])
    config.excludeMatchers = compileMatchers(userOpts?.exclude ?? [])
    config.ignoreImporterMatchers = compileMatchers(
      userOpts?.ignoreImporters ?? [],
    )

    const markers = getMarkerSpecifiers()
    config.markerSpecifiers = {
      serverOnly: new Set(markers.serverOnly),
      clientOnly: new Set(markers.clientOnly),
    }
  }

  function shouldCheckImporter(file: string): boolean {
    return shouldCheckImporterWithCache({
      config,
      cache: shouldCheckImporterCache,
      perf,
      file,
    })
  }

  api.onBeforeBuild(() => {
    const startedAt = perf ? performance.now() : 0
    applyUserConfig()
    clearNormalizeFilePathCache()
    extensionlessResolver.clear()
    shouldCheckImporterCache.clear()
    envStates.clear()
    if (perf) {
      perf.time('onBeforeBuild', startedAt)
    }
  })

  api.onBeforeDevCompile(() => {
    const startedAt = perf ? performance.now() : 0
    applyUserConfig()
    clearNormalizeFilePathCache()
    extensionlessResolver.clear()
    shouldCheckImporterCache.clear()

    for (const envState of envStates.values()) {
      envState.resolveCache.clear()
    }
    if (perf) {
      perf.time('onBeforeDevCompile', startedAt)
    }
  })

  api.modifyRspackConfig((rspackConfig, utils) => {
    const startedAt = perf ? performance.now() : 0
    applyUserConfig()

    const envName = utils.environment.name
    if (
      !opts.environments.some((environment) => environment.name === envName)
    ) {
      return
    }

    const VMP = utils.rspack.experiments.VirtualModulesPlugin
    const vmPlugin = new VMP({})

    shared.vmPlugins[envName] = vmPlugin
    shared.readyVmPlugins[envName] = false

    const rules = rspackConfig.module.rules ?? []
    rules.push({
      test: /\.[cm]?[tj]sx?$/,
      enforce: 'post',
      use: [
        {
          loader: importProtectionLoader,
          options: {
            config,
            envName,
            envStates,
            extensionlessResolver,
            perf,
            shared,
            shouldCheckImporterCache,
          },
        },
      ],
    })
    rspackConfig.module.rules = rules

    rspackConfig.plugins.push(vmPlugin)
    rspackConfig.plugins.push({
      apply(compiler: Rspack.Compiler) {
        compiler.hooks.thisCompilation.tap(
          'TanStackStartImportProtectionVirtualModulesReady',
          () => {
            shared.readyVmPlugins[envName] = true
            flushPendingWrites(shared, envName)
          },
        )
      },
    })
    if (perf) {
      perf.time('modifyRspackConfig', startedAt)
    }
  })

  api.processAssets(
    {
      stage: 'report',
      environments: opts.environments.map((environment) => environment.name),
    },
    async (context: ProcessAssetsContext) => {
      const envName = context.environment.name
      const startedAt = perf ? performance.now() : 0
      perf?.count('processAssets.calls')
      perf?.count(`processAssets.env.${envName}`)

      try {
        if (!config.enabled) {
          return
        }

        const envType = getImportProtectionEnvType(config, envName)
        const envState = getOrCreateEnvState(envStates, envName)
        const matchers = getRulesForEnvironment(config, envName)
        const allModules = Array.from(context.compilation.modules)
        perf?.count('processAssets.modules.total', allModules.length)

        const violationScanner = createCompilationViolationScanner({
          config,
          envType,
          matchers,
          shouldCheckImporter,
        })
        forEachEntryModule({
          compilation: context.compilation,
          visitModule: violationScanner.visitEntry,
        })
        const forEachStartedAt = perf ? performance.now() : 0
        const moduleGraphNodes: Array<RspackModuleGraphNode> = []
        forEachModules({
          compilation: context.compilation,
          modules: allModules,
          visitNode(node) {
            moduleGraphNodes.push(node)
            violationScanner.visitNode(node)
          },
        })
        if (perf) {
          perf.time('processAssets.forEachModules', forEachStartedAt)
          perf.count('processAssets.modules.collected', moduleGraphNodes.length)
          perf.count(
            'processAssets.imports.collected',
            moduleGraphNodes.reduce(
              (total, node) => total + node.imports.length,
              0,
            ),
          )
        }

        const candidateStartedAt = perf ? performance.now() : 0
        const candidates = violationScanner.finish()
        if (perf) {
          perf.time('processAssets.candidates.finish', candidateStartedAt)
          perf.count('processAssets.candidates', candidates.length)
        }

        if (candidates.length === 0) {
          return
        }

        const graphStartedAt = perf ? performance.now() : 0
        const { importGraph, edgeIndex } = buildCompilationImportGraph({
          compilation: context.compilation,
          nodes: moduleGraphNodes,
        })
        if (perf) {
          perf.time('processAssets.importGraph.build', graphStartedAt)
          perf.count('processAssets.importGraph.edges', edgeIndex.edges.length)
        }

        let provider: CompilationTransformResultProvider | undefined
        const getProvider = () => {
          if (!provider) {
            const providerStartedAt = perf ? performance.now() : 0
            provider = buildTransformResultProvider({
              root: config.root,
              perf,
              inputFileSystem: context.compilation.inputFileSystem,
            })
            if (perf) {
              perf.time('processAssets.provider.build', providerStartedAt)
            }
          }
          return provider
        }

        for (const candidate of candidates) {
          let info: ViolationInfo

          if (candidate.type === 'specifier') {
            const { payload } = candidate
            info = await buildViolationInfo({
              config,
              provider: getProvider(),
              importGraph,
              edgeIndex,
              perf,
              envName,
              envType,
              importer: payload.violation.importer,
              importerModule: candidate.edge.importer,
              source: payload.violation.specifier,
              resolved: payload.violation.resolved,
              transformedSources: [getModuleResource(candidate.edge.module)],
              type: 'specifier',
              pattern: payload.violation.patternText,
            })
          } else if (candidate.type === 'marker') {
            const importer = getModuleResource(candidate.importer)
            info = await buildViolationInfo({
              config,
              provider: getProvider(),
              importGraph,
              edgeIndex,
              perf,
              envName,
              envType,
              importer,
              importerModule: candidate.importer,
              source: candidate.source,
              type: 'marker',
            })
          } else {
            const { edge, source } = candidate
            const importer = getModuleResource(edge.importer)
            const resolved = getModuleResource(edge.module)
            info = await buildViolationInfo({
              config,
              provider: getProvider(),
              importGraph,
              edgeIndex,
              perf,
              envName,
              envType,
              importer,
              importerModule: edge.importer,
              source,
              resolved,
              type: 'file',
              pattern: candidate.pattern,
            })
          }

          await reportViolation({
            config,
            envState,
            compilation: context.compilation,
            rspack: context.compiler.rspack,
            perf,
            info,
          })
        }
      } finally {
        if (perf) {
          perf.time('processAssets', startedAt)
          perf.flush(config.root, envName, 'processAssets')
        }
      }
    },
  )
}
