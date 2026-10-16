/**
 * CSS collection for dev mode.
 * Crawls the Vite module graph to collect CSS from the router entry and all its dependencies.
 */
import path from 'node:path'
import type { DevEnvironment, EnvironmentModuleNode, Rollup } from 'vite'

// CSS file extensions supported by Vite
const CSS_FILE_REGEX =
  /\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/
// URL params that indicate CSS should not be injected (e.g., ?url, ?inline)
const CSS_SIDE_EFFECT_FREE_PARAMS = ['url', 'inline', 'raw', 'inline-css']

// Marker to find the CSS string in Vite's transformed output
const VITE_CSS_MARKER = 'const __vite__css = '

const ESCAPE_CSS_COMMENT_START_REGEX = /\/\*/g
const ESCAPE_CSS_COMMENT_END_REGEX = /\*\//g
const NO_DEPENDENCIES: ReadonlyArray<EnvironmentModuleNode> = []
const cssTransformCache = new WeakMap<object, string | null>()

function isCssFile(file: string): boolean {
  return CSS_FILE_REGEX.test(file)
}

function hasCssSideEffectFreeParam(url: string): boolean {
  const queryString = url.split('?')[1]
  if (!queryString) {
    return false
  }

  const params = new URLSearchParams(queryString)
  return CSS_SIDE_EFFECT_FREE_PARAMS.some(
    (param) =>
      params.get(param) === '' &&
      !url.includes(`?${param}=`) &&
      !url.includes(`&${param}=`),
  )
}

/**
 * Resolve a file path to a Vite dev server URL.
 * Files within the root directory use relative paths, files outside use /@fs prefix.
 */
function resolveDevUrl(rootDirectory: string, filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/')
  const relativePath = path.posix.relative(
    rootDirectory.replace(/\\/g, '/'),
    normalizedPath,
  )
  const isWithinRoot =
    !relativePath.startsWith('..') && !path.isAbsolute(relativePath)

  if (isWithinRoot) {
    return path.posix.join('/', relativePath)
  }
  // Files outside root need /@fs prefix
  return path.posix.join('/@fs', normalizedPath)
}

export type DevStylesEnvironment = Pick<DevEnvironment, 'transformRequest'> & {
  moduleGraph: Pick<DevEnvironment['moduleGraph'], 'getModuleByUrl'>
}

export interface CollectDevStylesOptions {
  serverEnvironment: DevStylesEnvironment
  rootDirectory: string
  entries: Array<string>
  loadCssContents: (url: string) => Promise<string | undefined>
}

/**
 * Collect CSS content from the module graph starting from the given entry points.
 */
export async function collectDevStyles(
  opts: CollectDevStylesOptions,
): Promise<string | undefined> {
  const { serverEnvironment, rootDirectory, entries, loadCssContents } = opts

  const orderedCssNodes = await collectCssNodes(
    serverEnvironment,
    entries.map((entry) => resolveDevUrl(rootDirectory, entry)),
  )

  // Promise.all keeps graph order while loading the CSS concurrently.
  const cssResults = await Promise.all(
    orderedCssNodes.map((node) => loadCssContents(node.url)),
  )

  return formatCss(
    orderedCssNodes.map((node) => node.url),
    cssResults,
  )
}

/**
 * Resolve entry nodes and their dependency graph in parallel, then linearize the
 * completed graph synchronously. This keeps I/O concurrent without making
 * Promise resolution timing part of the CSS cascade order.
 */
async function collectCssNodes(
  environment: DevStylesEnvironment,
  entryUrls: Array<string>,
): Promise<Array<EnvironmentModuleNode>> {
  const entryNodes = await Promise.all(
    entryUrls.map((entryUrl) => resolveEntry(environment, entryUrl)),
  )
  const dependencies = new Map<
    EnvironmentModuleNode,
    ReadonlyArray<EnvironmentModuleNode>
  >()
  const discovered = new Set<EnvironmentModuleNode>()
  const dependencyLookups = new Map<
    string,
    Promise<EnvironmentModuleNode | undefined>
  >()

  function getDependency(
    url: string,
  ): Promise<EnvironmentModuleNode | undefined> {
    let lookup = dependencyLookups.get(url)
    if (!lookup) {
      lookup = environment.moduleGraph.getModuleByUrl(url)
      dependencyLookups.set(url, lookup)
    }
    return lookup
  }

  async function discover(node: EnvironmentModuleNode): Promise<void> {
    if (discovered.has(node)) {
      return
    }
    discovered.add(node)

    const nodeDependencies = await resolveModuleDeps(node, getDependency)
    dependencies.set(node, nodeDependencies)
    await Promise.all(nodeDependencies.map(discover))
  }

  await Promise.all(
    entryNodes.map((node) => (node ? discover(node) : Promise.resolve())),
  )

  return orderCssNodes(
    entryNodes,
    (node) => node.url,
    (node) => dependencies.get(node) ?? [],
  )
}

function orderCssNodes<T>(
  entryNodes: Array<T | undefined>,
  getUrl: (node: T) => string,
  getDependencies: (node: T) => ReadonlyArray<T>,
): Array<T> {
  const orderedCssNodes: Array<T> = []
  const ordered = new Set<T>()
  const stack = [...entryNodes].reverse()

  while (stack.length > 0) {
    const node = stack.pop()
    if (!node || ordered.has(node)) {
      continue
    }
    ordered.add(node)
    const url = getUrl(node)
    if (isCssFile(url) && !hasCssSideEffectFreeParam(url)) {
      orderedCssNodes.push(node)
    }

    const nodeDependencies = getDependencies(node)
    for (let i = nodeDependencies.length - 1; i >= 0; i--) {
      stack.push(nodeDependencies[i])
    }
  }

  return orderedCssNodes
}

async function resolveEntry(
  environment: DevStylesEnvironment,
  entryUrl: string,
): Promise<EnvironmentModuleNode | undefined> {
  let node = await environment.moduleGraph.getModuleByUrl(entryUrl)

  // Only transform if needed so transformResult.deps is available for crawling.
  if (!node?.transformResult) {
    try {
      await environment.transformRequest(entryUrl)
    } catch {
      // ignore - module might not exist yet
    }
    node = await environment.moduleGraph.getModuleByUrl(entryUrl)
  }

  return node
}

/**
 * Resolve a module's direct dependencies in graph order.
 * Uses transformResult.deps for URL-based lookups and importedModules for
 * already-resolved nodes.
 */
async function resolveModuleDeps(
  node: EnvironmentModuleNode,
  getDependency: (url: string) => Promise<EnvironmentModuleNode | undefined>,
): Promise<ReadonlyArray<EnvironmentModuleNode>> {
  // Vite's client transform already includes CSS @imports in the parent CSS.
  // Following either dependency source here would append the imported CSS again.
  if (isCssFile(node.url)) {
    return NO_DEPENDENCIES
  }

  const depUrls = node.transformResult?.deps ?? []
  const importedModules =
    node.importedModules.size > 0
      ? Array.from(node.importedModules)
      : NO_DEPENDENCIES

  // Fast path: no deps and no imports
  if (depUrls.length === 0 && importedModules.length === 0) {
    return NO_DEPENDENCIES
  }

  const resolvedDeps = await Promise.all(depUrls.map(getDependency))
  const orderedDependencies: Array<EnvironmentModuleNode> = []
  const added = new Set<EnvironmentModuleNode>()

  for (const dependency of resolvedDeps) {
    if (dependency && !added.has(dependency)) {
      added.add(dependency)
      orderedDependencies.push(dependency)
    }
  }

  // Also traverse importedModules for non-CSS modules. This catches
  // code-split chunks (e.g. ?tsr-split=component) that are not in deps, as
  // well as already-resolved nodes. Vite inlines CSS @imports into the
  // transformed parent stylesheet, so traversing a CSS module's importedModules
  // would collect and append those stylesheets a second time.
  for (const dependency of importedModules) {
    if (!added.has(dependency)) {
      added.add(dependency)
      orderedDependencies.push(dependency)
    }
  }

  return orderedDependencies
}

export async function fetchCssFromModule(
  environment: DevStylesEnvironment,
  url: string,
): Promise<string | undefined> {
  // Vite embeds the CSS text in the client environment's transform result.
  // The SSR environment is only used for dependency discovery.
  const node = await environment.moduleGraph.getModuleByUrl(url)
  const cachedTransform = node?.transformResult
  if (cachedTransform?.code) {
    return extractCssFromTransform(cachedTransform)
  }

  // Otherwise request a fresh transform
  try {
    const transformResult = await environment.transformRequest(url)
    if (!transformResult?.code) {
      return undefined
    }

    return extractCssFromTransform(transformResult)
  } catch {
    // Preprocessor partials (e.g., Sass files with mixins) can't compile in isolation.
    // The root stylesheet that @imports them will contain the compiled CSS.
    return undefined
  }
}

function extractCssFromTransform(transformResult: {
  code: string
}): string | undefined {
  const cachedCss = cssTransformCache.get(transformResult)
  if (cachedCss !== undefined) {
    return cachedCss ?? undefined
  }

  const css = extractCssFromCode(transformResult.code)
  cssTransformCache.set(transformResult, css ?? null)
  return css
}

/**
 * Extract CSS content from Vite's transformed CSS module code.
 *
 * Vite embeds CSS into the module as a JS string via `JSON.stringify(cssContent)`,
 * e.g. `const __vite__css = ${JSON.stringify('...css...')}`.
 *
 * We locate that JSON string literal and run `JSON.parse` on it to reverse the
 * escaping (\\n, \\t, \\", \\\\, \\uXXXX, etc.).
 */
export function extractCssFromCode(code: string): string | undefined {
  const startIdx = code.indexOf(VITE_CSS_MARKER)
  if (startIdx === -1) {
    return undefined
  }

  const valueStart = startIdx + VITE_CSS_MARKER.length
  // Vite emits `const __vite__css = ${JSON.stringify(cssContent)}` which always
  // produces double-quoted JSON string literals.
  if (code.charCodeAt(valueStart) !== 34) {
    return undefined
  }

  const codeLength = code.length
  let i = valueStart + 1
  while (i < codeLength) {
    const charCode = code.charCodeAt(i)
    // 34 = '"'
    if (charCode === 34) {
      try {
        return JSON.parse(code.slice(valueStart, i + 1))
      } catch {
        return undefined
      }
    }
    // 92 = '\\'
    if (charCode === 92) {
      i += 2
    } else {
      i++
    }
  }

  return undefined
}

/** Join available styles in graph order, labeling each with its source URL. */
function formatCss(
  urls: ReadonlyArray<string>,
  cssResults: ReadonlyArray<string | undefined>,
): string | undefined {
  const parts: Array<string> = []
  for (let i = 0; i < cssResults.length; i++) {
    const css = cssResults[i]
    if (!css) {
      continue
    }
    const escapedFileName = urls[i]!.replace(
      ESCAPE_CSS_COMMENT_START_REGEX,
      '/\\*',
    ).replace(ESCAPE_CSS_COMMENT_END_REGEX, '*\\/')
    parts.push(`\n/* ${escapedFileName} */\n${css}`)
  }
  return parts.length > 0 ? parts.join('\n') : undefined
}

/** Snapshot the completed bundle without retaining its plugin context or JS. */
export function captureBundledDevStyles(
  graph: Pick<Rollup.PluginContext, 'getModuleIds' | 'getModuleInfo'>,
  rootDirectory: string,
) {
  const css = new Map<string, string>()
  const dependencies = new Map<string, ReadonlyArray<string>>()
  for (const id of graph.getModuleIds()) {
    const info = graph.getModuleInfo(id)
    if (!info) {
      continue
    }
    // CSS transforms already contain their @imports.
    if (isCssFile(id)) {
      if (!hasCssSideEffectFreeParam(id) && info.code) {
        const contents = extractCssFromCode(info.code)
        if (contents) {
          css.set(id, contents)
        }
      }
    } else {
      dependencies.set(id, [
        ...info.importedIds,
        ...info.dynamicallyImportedIds,
      ])
    }
  }
  return { rootDirectory, css, dependencies }
}

export function collectBundledDevStyles(
  snapshot: ReturnType<typeof captureBundledDevStyles> | undefined,
  entries: Array<string>,
): string | undefined {
  if (!snapshot) {
    return undefined
  }
  const nodes = orderCssNodes(
    entries.map((entry) => entry.replace(/\\/g, '/')),
    (id) => id,
    (id) => snapshot.dependencies.get(id) ?? [],
  )
  return formatCss(
    nodes.map((id) => resolveDevUrl(snapshot.rootDirectory, id)),
    nodes.map((id) => snapshot.css.get(id)),
  )
}
