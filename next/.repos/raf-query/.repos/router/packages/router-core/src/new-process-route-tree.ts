import { invariant } from './invariant'
import { trimPathRight } from './path'
import { createSieveCache } from './sieve-cache'
import { last } from './utils'
import type { SieveCache } from './sieve-cache'
import type { InterpolationSegment, RouteInterpolation } from './path'

export const SEGMENT_TYPE_PATHNAME = 0
export const SEGMENT_TYPE_PARAM = 1
export const SEGMENT_TYPE_WILDCARD = 2
export const SEGMENT_TYPE_OPTIONAL_PARAM = 3
const SEGMENT_TYPE_INDEX = 4
const SEGMENT_TYPE_PATHLESS = 5 // only used in matching to represent pathless routes that need to carry more information

/**
 * All the kinds of segments that can be present in a route path.
 */
export type SegmentKind =
  | typeof SEGMENT_TYPE_PATHNAME
  | typeof SEGMENT_TYPE_PARAM
  | typeof SEGMENT_TYPE_WILDCARD
  | typeof SEGMENT_TYPE_OPTIONAL_PARAM

/**
 * All the kinds of segments that can be present in the segment tree.
 */
type ExtendedSegmentKind =
  | SegmentKind
  | typeof SEGMENT_TYPE_INDEX
  | typeof SEGMENT_TYPE_PATHLESS

export type DynamicPathSegment = [
  kind: Exclude<SegmentKind, typeof SEGMENT_TYPE_PATHNAME>,
  key: string,
  prefix: string,
  /** Undefined marks a bare splat, which discards the remaining template. */
  suffix: string | undefined,
]

export function getParamNames(data: RouteInterpolation): Array<string> {
  const cached = data.names
  if (cached) {
    return cached
  }
  const keys: Array<string> = []
  for (const segment of data) {
    if (typeof segment !== 'string') {
      keys.push(segment[1 /* key */])
    }
  }
  return (data.names = keys)
}

/** Parse one segment for matching and retain the same record for interpolation. */
export function parseSegment(
  /** The full path string containing the segment. */
  path: string,
  /** The starting index of the segment within the path. */
  start: number,
  /** The next slash, or the length of the path. */
  end: number,
): InterpolationSegment {
  const part = path.slice(start, end)
  if (part.charCodeAt(0) === 36) {
    return part.length === 1
      ? [SEGMENT_TYPE_WILDCARD, '_splat', '', undefined]
      : [SEGMENT_TYPE_PARAM, part.slice(1), '', '']
  }
  const open = part.indexOf('{')
  if (open >= 0) {
    const close = part.indexOf('}', open)
    const optional = part.charCodeAt(open + 1) === 45
    const nameStart = open + (optional ? 3 : 2)
    if (
      close >= 0 &&
      part.charCodeAt(nameStart - 1) === 36 &&
      (!optional || nameStart < close)
    ) {
      const key = part.slice(nameStart, close)
      return [
        optional
          ? SEGMENT_TYPE_OPTIONAL_PARAM
          : key
            ? SEGMENT_TYPE_PARAM
            : SEGMENT_TYPE_WILDCARD,
        key || '_splat',
        part.slice(0, open),
        path.slice(start + close + 1, key ? end : path.length),
      ]
    }
  }
  return part
}

type ParsedRoute<T extends RouteLike> = [
  node: AnySegmentNode<T>,
  cursor: number,
  segments: RouteInterpolation | undefined,
]

/** Compile a template, optionally attaching its new segments to the matching trie. */
export function parseSegments<TRouteLike extends RouteLike>(
  defaultCaseSensitive: boolean,
  route: TRouteLike,
  start: number,
): RouteInterpolation
export function parseSegments<TRouteLike extends RouteLike>(
  defaultCaseSensitive: boolean,
  route: TRouteLike,
  start: number,
  node: AnySegmentNode<TRouteLike>,
  dynamicListsToSort?: Array<Array<DynamicSegmentNode<TRouteLike>>>,
  parentInterpolation?: RouteInterpolation,
): ParsedRoute<TRouteLike>
export function parseSegments<TRouteLike extends RouteLike>(
  defaultCaseSensitive: boolean,
  route: TRouteLike,
  start: number,
  node?: AnySegmentNode<TRouteLike>,
  /** Each dynamic sibling list is recorded once, when it first needs sorting. */
  dynamicListsToSort?: Array<Array<DynamicSegmentNode<TRouteLike>>>,
  parentInterpolation?: RouteInterpolation,
): RouteInterpolation | ParsedRoute<TRouteLike> {
  let cursor = start
  const path = route.fullPath ?? route.from
  const options = route.options
  const length = path.length
  const literalEnd = path.endsWith('/') ? length - 1 : length
  const caseSensitive = options?.caseSensitive ?? defaultCaseSensitive
  const parseParams = options?.params?.parse ?? options?.parseParams
  let interpolation: Array<InterpolationSegment> | undefined
  let literalStart = parentInterpolation ? start - 1 : 0
  if (!node || path.includes('$')) {
    interpolation = parentInterpolation?.slice() ?? []
    const tail = last(interpolation)
    if (
      tail &&
      typeof tail !== 'string' &&
      tail[0 /* kind */] === SEGMENT_TYPE_WILDCARD
    ) {
      // A parent's wildcard consumes the child's template too.
      // `start` follows that entire template, including its trailing slash.
      interpolation[interpolation.length - 1] = [
        tail[0 /* kind */],
        tail[1 /* key */],
        tail[2 /* prefix */],
        tail[3 /* suffix */] === undefined
          ? undefined
          : tail[3 /* suffix */] +
            path.substring(
              start - (path[start - 2] === '/' ? 2 : 1),
              literalEnd,
            ),
      ]
      literalStart = length
    }
  }
  while (cursor < length) {
    const start = cursor
    const next = path.indexOf('/', start)
    let end = next === -1 ? length : next
    const segment = parseSegment(path, start, end)
    cursor = end + 1
    let nextNode: AnySegmentNode<TRouteLike>
    if (typeof segment === 'string') {
      if (!node) {
        continue
      }
      let name = segment
      let staticChildren: Map<string, StaticSegmentNode<TRouteLike>>
      if (caseSensitive) {
        staticChildren = node.static ??= new Map()
      } else {
        name = segment.toLowerCase()
        staticChildren = node.staticInsensitive ??= new Map()
      }
      const existingNode = staticChildren.get(name)
      if (existingNode) {
        nextNode = existingNode
      } else {
        const next = createSegmentNode(node)
        nextNode = next
        staticChildren.set(name, next)
      }
    } else {
      const kind = segment[0 /* kind */]
      let prefix = segment[2 /* prefix */]
      let suffix = segment[3 /* suffix */] ?? ''
      if (kind === SEGMENT_TYPE_WILDCARD) {
        end = length
        cursor = end + 1
      }
      if (interpolation && literalStart < end) {
        // Retain original spelling before matcher case folding.
        if (literalStart < start - 1) {
          interpolation.push(path.slice(literalStart, start - 1))
        }
        segment[2 /* prefix */] = '/' + prefix
        if (
          kind === SEGMENT_TYPE_WILDCARD &&
          segment[3 /* suffix */] !== undefined &&
          literalEnd < length
        ) {
          segment[3 /* suffix */] = suffix.slice(0, -1)
        }
        interpolation.push(segment)
        literalStart = end
      }
      if (!node) {
        continue
      }
      const actuallyCaseSensitive = caseSensitive && !!(prefix || suffix)
      if (!caseSensitive) {
        prefix = prefix.toLowerCase()
        suffix = suffix.toLowerCase()
      }
      const siblings =
        kind === SEGMENT_TYPE_PARAM
          ? (node.dynamic ??= [])
          : kind === SEGMENT_TYPE_OPTIONAL_PARAM
            ? (node.optional ??= [])
            : (node.wildcard ??= [])
      const existingNode =
        // Keep wildcard aliases as separate match candidates, even when
        // they have the same shape and no parser.
        kind !== SEGMENT_TYPE_WILDCARD &&
        !parseParams &&
        siblings.find(
          (s) =>
            !s.parse &&
            s.caseSensitive === actuallyCaseSensitive &&
            s.prefix === prefix &&
            s.suffix === suffix,
        )
      if (existingNode) {
        nextNode = existingNode
      } else {
        const next = createSegmentNode(
          node,
          kind,
          actuallyCaseSensitive,
          prefix,
          suffix,
        )
        nextNode = next
        siblings.push(next)
        if (siblings.length === 2) {
          dynamicListsToSort?.push(siblings)
        }
      }
    }
    node = nextNode
  }

  if (interpolation && literalStart < literalEnd) {
    interpolation.push(path.slice(literalStart, literalEnd))
  }
  // Discard push()'s spare capacity before retaining this array on both owners.
  const segmentData = interpolation?.slice()
  if (!node) {
    return segmentData!
  }

  // create pathless node
  if (
    parseParams &&
    route.children &&
    !route.isRoot &&
    route.id &&
    route.id.charCodeAt(route.id.lastIndexOf('/') + 1) === 95 /* '_' */
  ) {
    const pathlessNode = createSegmentNode(node, SEGMENT_TYPE_PATHLESS)
    ;(node.pathless ??= []).push(pathlessNode)
    node = pathlessNode
  }

  const isLeaf = (route.path || !route.children) && !route.isRoot
  // create index node
  if (isLeaf && literalEnd < length) {
    const indexNode = createSegmentNode(node, SEGMENT_TYPE_INDEX)
    node.index = indexNode
    node = indexNode
  }

  node.parse = parseParams ?? null
  node.priority = options?.params?.priority ?? 0
  // A shared candidate keeps the original names of its first terminal route.
  if (!node.route) {
    node.data = segmentData
    if (isLeaf) {
      node.route = route
    }
  }
  return [node, cursor, segmentData]
}

function sortDynamic(
  a: {
    prefix: string
    suffix: string
    caseSensitive: boolean
    parse: null | ((params: Record<string, string>) => unknown)
    priority: number
  },
  b: {
    prefix: string
    suffix: string
    caseSensitive: boolean
    parse: null | ((params: Record<string, string>) => unknown)
    priority: number
  },
) {
  if (a.parse && !b.parse) return -1
  if (!a.parse && b.parse) return 1
  if (a.parse && b.parse && (a.priority || b.priority))
    return b.priority - a.priority
  if (a.prefix && b.prefix && a.prefix !== b.prefix) {
    if (a.prefix.startsWith(b.prefix)) return -1
    if (b.prefix.startsWith(a.prefix)) return 1
  }
  if (a.suffix && b.suffix && a.suffix !== b.suffix) {
    if (a.suffix.endsWith(b.suffix)) return -1
    if (b.suffix.endsWith(a.suffix)) return 1
  }
  if (a.prefix && !b.prefix) return -1
  if (!a.prefix && b.prefix) return 1
  if (a.suffix && !b.suffix) return -1
  if (!a.suffix && b.suffix) return 1
  if (a.caseSensitive && !b.caseSensitive) return -1
  if (!a.caseSensitive && b.caseSensitive) return 1

  // Equal specificity preserves route declaration order through stable sort.
  return 0
}

function createSegmentNode<T extends RouteLike>(
  parent?: AnySegmentNode<T>,
  kind?: StaticSegmentNode<T>['kind'],
): StaticSegmentNode<T>
function createSegmentNode<T extends RouteLike>(
  parent: AnySegmentNode<T>,
  kind:
    | typeof SEGMENT_TYPE_PARAM
    | typeof SEGMENT_TYPE_WILDCARD
    | typeof SEGMENT_TYPE_OPTIONAL_PARAM,
  caseSensitive: boolean,
  prefix: string,
  suffix: string,
): DynamicSegmentNode<T>
function createSegmentNode<T extends RouteLike>(
  parent?: AnySegmentNode<T>,
  kind: ExtendedSegmentKind = SEGMENT_TYPE_PATHNAME,
  caseSensitive?: boolean,
  prefix?: string,
  suffix?: string,
): SegmentNode<T> {
  return {
    kind,
    depth: parent ? parent.depth + 1 : 0,
    pathless: null,
    index: null,
    static: null,
    staticInsensitive: null,
    dynamic: null,
    optional: null,
    wildcard: null,
    route: null,
    data: undefined,
    parent,
    parse: null,
    priority: 0,
    caseSensitive,
    prefix,
    suffix,
  }
}

type StaticSegmentNode<T extends RouteLike> = SegmentNode<T> & {
  kind:
    | typeof SEGMENT_TYPE_PATHNAME
    | typeof SEGMENT_TYPE_PATHLESS
    | typeof SEGMENT_TYPE_INDEX
}

type DynamicSegmentNode<T extends RouteLike> = SegmentNode<T> & {
  kind:
    | typeof SEGMENT_TYPE_PARAM
    | typeof SEGMENT_TYPE_WILDCARD
    | typeof SEGMENT_TYPE_OPTIONAL_PARAM
  prefix: string
  suffix: string
  caseSensitive: boolean
}

type AnySegmentNode<T extends RouteLike> =
  | StaticSegmentNode<T>
  | DynamicSegmentNode<T>

type SegmentNode<T extends RouteLike> = {
  kind: ExtendedSegmentKind
  prefix?: string
  suffix?: string
  caseSensitive?: boolean

  pathless: Array<StaticSegmentNode<T>> | null

  /** Exact index segment (highest priority) */
  index: StaticSegmentNode<T> | null

  /** Static segments (2nd priority) */
  static: Map<string, StaticSegmentNode<T>> | null

  /** Case insensitive static segments (3rd highest priority) */
  staticInsensitive: Map<string, StaticSegmentNode<T>> | null

  /** Dynamic segments ($param) */
  dynamic: Array<DynamicSegmentNode<T>> | null

  /** Optional dynamic segments ({-$param}) */
  optional: Array<DynamicSegmentNode<T>> | null

  /** Wildcard segments ($ - lowest priority) */
  wildcard: Array<DynamicSegmentNode<T>> | null

  /** Terminal route (if this path can end here) */
  route: T | null

  /** Original template data for this candidate or parse gate. */
  data: RouteInterpolation | undefined

  parent: AnySegmentNode<T> | undefined

  depth: number

  /** route.options.params.parse function, set on the last node of the route */
  parse: null | ((params: Record<string, string>) => unknown)

  /** route.options.params.priority ?? 0 */
  priority: number
}

type RouteLike = {
  _interpolation?: RouteInterpolation
  id?: string
  path?: string // relative path from the parent,
  children?: Array<RouteLike> // child routes,
  parentRoute?: RouteLike // parent route,
  isRoot?: boolean
  options?: {
    caseSensitive?: boolean
    parseParams?: (params: Record<string, string>) => unknown
    params?: {
      parse?: (params: Record<string, string>) => unknown
      priority?: number
    }
  }
} &
  // router tree
  (| { fullPath: string; from?: never } // full path from the root
    // flat route masks list
    | { fullPath?: never; from: string } // full path from the root
  )

export type ProcessedTree<
  TTree extends Extract<RouteLike, { fullPath: string }>,
  TFlat extends Extract<RouteLike, { from: string }>,
  TSingle extends Extract<RouteLike, { from: string }>,
> = {
  /** a representation of the `routeTree` as a segment tree */
  segmentTree: AnySegmentNode<TTree>
  /** a mini route tree generated from the flat `routeMasks` list */
  masksTree: AnySegmentNode<TFlat> | null
  /** @deprecated keep until v2 so that `router.matchRoute` can keep not caring about the actual route tree */
  singleCache: SieveCache<string, AnySegmentNode<TSingle>>
  /** a cache of route matches from the `segmentTree` */
  matchCache: SieveCache<string, RouteMatch<TTree> | null>
  /** a cache of route matches from the `masksTree` */
  flatCache: SieveCache<string, ReturnType<typeof findMatch<TFlat>>> | null
}

export function processRouteMasks<
  TRouteLike extends Extract<RouteLike, { from: string }>,
>(
  routeList: Array<TRouteLike>,
  processedTree: ProcessedTree<any, TRouteLike, any>,
) {
  const segmentTree = createSegmentNode<TRouteLike>()
  const dynamicListsToSort: Array<Array<DynamicSegmentNode<TRouteLike>>> = []
  function visit(
    route: TRouteLike,
    start: number,
    parentNode: AnySegmentNode<TRouteLike>,
    parentInterpolation?: RouteInterpolation,
  ) {
    const [node, cursor, segments] = parseSegments(
      false,
      route,
      start,
      parentNode,
      dynamicListsToSort,
      parentInterpolation,
    )
    if (route.children) {
      for (const child of route.children) {
        visit(child as TRouteLike, cursor, node, segments)
      }
    }
  }
  for (const route of routeList) {
    visit(route, 1, segmentTree)
  }
  for (const nodes of dynamicListsToSort) {
    nodes.sort(sortDynamic)
  }
  processedTree.masksTree = segmentTree
  processedTree.flatCache = createSieveCache<
    string,
    ReturnType<typeof findMatch<TRouteLike>>
  >(1000)
}

/**
 * Take an arbitrary list of routes, create a tree from them (if it hasn't been created already), and match a path against it.
 */
export function findFlatMatch<T extends Extract<RouteLike, { from: string }>>(
  /** The path to match. */
  path: string,
  /** The `processedTree` returned by the initial `processRouteTree` call. */
  processedTree: ProcessedTree<any, T, any>,
) {
  path ||= '/'
  const cached = processedTree.flatCache!.get(path)
  if (cached !== undefined) return cached
  const result = findMatch(path, processedTree.masksTree!)
  processedTree.flatCache!.set(path, result)
  return result
}

/**
 * @deprecated keep until v2 so that `router.matchRoute` can keep not caring about the actual route tree
 */
export function findSingleMatch(
  from: string,
  caseSensitive: boolean,
  fuzzy: boolean,
  path: string,
  processedTree: ProcessedTree<any, any, { from: string }>,
) {
  from ||= '/'
  path ||= '/'
  const key = caseSensitive ? `case\0${from}` : from
  let tree = processedTree.singleCache.get(key)
  if (!tree) {
    // single flat routes (router.matchRoute) are not eagerly processed,
    // if we haven't seen this route before, process it now
    tree = createSegmentNode<{ from: string }>()
    parseSegments(caseSensitive, { from }, 1, tree)
    processedTree.singleCache.set(key, tree)
  }
  return findMatch(path, tree, fuzzy)
}

type RouteMatch<T extends Extract<RouteLike, { fullPath: string }>> = {
  route: T
  rawParams: Record<string, string>
  branch: ReadonlyArray<T>
}

export function findRouteMatch<
  T extends Extract<RouteLike, { fullPath: string }>,
>(
  /** The path to match against the route tree. */
  path: string,
  /** The `processedTree` returned by the initial `processRouteTree` call. */
  processedTree: ProcessedTree<T, any, any>,
  /** If `true`, allows fuzzy matching (partial matches), i.e. which node in the tree would have been an exact match if the `path` had been shorter? */
  fuzzy = false,
): RouteMatch<T> | null {
  const key = fuzzy ? path : `nofuzz\0${path}` // the main use for `findRouteMatch` is fuzzy:true, so we optimize for that case
  const cached = processedTree.matchCache.get(key)
  if (cached !== undefined) return cached
  path ||= '/'
  let result: RouteMatch<T> | null

  try {
    result = findMatch(
      path,
      processedTree.segmentTree,
      fuzzy,
    ) as RouteMatch<T> | null
  } catch (err) {
    if (err instanceof URIError) {
      result = null
    } else {
      throw err
    }
  }

  if (result) result.branch = buildRouteBranch(result.route)
  processedTree.matchCache.set(key, result)
  return result
}

export interface ProcessRouteTreeResult<
  TRouteLike extends Extract<RouteLike, { fullPath: string }> & { id: string },
> {
  /** Should be considered a black box, needs to be provided to all matching functions in this module. */
  processedTree: ProcessedTree<TRouteLike, any, any>
  /** A lookup map of routes by their unique IDs. */
  routesById: Record<string, TRouteLike>
  /** A lookup map of routes by their trimmed full paths. */
  routesByPath: Record<string, TRouteLike>
}

/**
 * Processes a route tree into a segment trie for efficient path matching.
 * Also builds lookup maps for routes by ID and by trimmed full path.
 */
export function processRouteTree<
  TRouteLike extends Extract<RouteLike, { fullPath: string }> & {
    id: string
    init: (originalIndex: number) => void
  },
>(
  /** The root of the route tree to process. */
  routeTree: TRouteLike,
  /** Whether matching should be case sensitive by default (overridden by individual route options). */
  caseSensitive: boolean = false,
): ProcessRouteTreeResult<TRouteLike> {
  const segmentTree = createSegmentNode<TRouteLike>()
  const dynamicListsToSort: Array<Array<DynamicSegmentNode<TRouteLike>>> = []
  const routesById = {} as Record<string, TRouteLike>
  const routesByPath = {} as Record<string, TRouteLike>
  let index = 0
  function visit(
    route: TRouteLike,
    start: number,
    parentNode: AnySegmentNode<TRouteLike>,
    parentInterpolation?: RouteInterpolation,
  ) {
    route.init(index)

    if (route.id in routesById) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(
          `Invariant failed: Duplicate routes found with id: ${String(route.id)}`,
        )
      }

      invariant()
    }

    routesById[route.id] = route
    if (index !== 0 && route.path) {
      const trimmedFullPath = trimPathRight(route.fullPath)
      if (!routesByPath[trimmedFullPath] || route.fullPath.endsWith('/')) {
        routesByPath[trimmedFullPath] = route
      }
    }
    index++

    const [node, cursor, segments] = parseSegments(
      caseSensitive,
      route,
      start,
      parentNode,
      dynamicListsToSort,
      parentInterpolation,
    )
    route._interpolation = segments
    if (route.children) {
      for (const child of route.children) {
        visit(child as TRouteLike, cursor, node, segments)
      }
    }
  }
  visit(routeTree, 1, segmentTree)
  for (const nodes of dynamicListsToSort) {
    nodes.sort(sortDynamic)
  }
  const processedTree: ProcessedTree<TRouteLike, any, any> = {
    segmentTree,
    singleCache: createSieveCache<string, AnySegmentNode<any>>(1000),
    matchCache: createSieveCache<string, RouteMatch<TRouteLike> | null>(1000),
    flatCache: null,
    masksTree: null,
  }
  return {
    processedTree,
    routesById,
    routesByPath,
  }
}

function findMatch<T extends RouteLike>(
  path: string,
  segmentTree: AnySegmentNode<T>,
  fuzzy = false,
): {
  route: T
  /**
   * The raw (unparsed) params extracted from the path.
   * This will be the exhaustive list of all params defined in the route's path.
   */
  rawParams: Record<string, string>
} | null {
  const parts = path.split('/')
  const leaf = getNodeMatch(path, parts, segmentTree, fuzzy)
  if (!leaf) return null
  const [rawParams] = extractParams(path, parts, leaf)
  return {
    route: leaf.node.route!,
    rawParams,
  }
}

type ParamExtractionState = {
  part: number
  node: number
  path: number
  param: number
}

/**
 * This function is "resumable":
 * - the `leaf` input can contain `extract` and `rawParams` properties from a previous `extractParams` call
 * - the returned `state` can be passed back as `extract` in a future call to continue extracting params from where we left off
 *
 * Inputs are *not* mutated.
 */
function extractParams<T extends RouteLike>(
  path: string,
  parts: Array<string>,
  leaf: {
    node: AnySegmentNode<T>
    skipped: number
    extract?: ParamExtractionState
    rawParams?: Record<string, string>
  },
): [rawParams: Record<string, string>, state: ParamExtractionState] {
  const list = buildBranch(leaf.node)
  const names = leaf.node.data && getParamNames(leaf.node.data)
  const rawParams: Record<string, string> = Object.create(null)
  /** which segment of the path we're currently processing */
  let partIndex = leaf.extract?.part ?? 0
  /** which node of the route tree branch we're currently processing */
  let nodeIndex = leaf.extract?.node ?? 0
  /** index of the 1st character of the segment we're processing in the path string */
  let pathIndex = leaf.extract?.path ?? 0
  /** Next original parameter name, independent of pathless/static nodes. */
  let paramIndex = leaf.extract?.param ?? 0
  for (; nodeIndex < list.length; partIndex++, nodeIndex++, pathIndex++) {
    const node = list[nodeIndex]!
    // index nodes are terminating nodes, nothing to extract, just leave
    if (node.kind === SEGMENT_TYPE_INDEX) break
    // pathless nodes do not consume a path segment
    if (node.kind === SEGMENT_TYPE_PATHLESS) {
      partIndex--
      pathIndex--
      continue
    }
    const part = parts[partIndex]
    const currentPathIndex = pathIndex
    if (part) pathIndex += part.length
    if (
      node.kind === SEGMENT_TYPE_PARAM ||
      node.kind === SEGMENT_TYPE_OPTIONAL_PARAM
    ) {
      const name = names![paramIndex++]!
      if (
        node.kind === SEGMENT_TYPE_OPTIONAL_PARAM &&
        leaf.skipped & (1 << nodeIndex)
      ) {
        partIndex-- // stay on the same part
        pathIndex = currentPathIndex - 1 // undo pathIndex advancement; -1 to account for loop increment
        continue
      }
      const value =
        node.suffix || node.prefix
          ? part!.substring(
              node.prefix.length,
              part!.length - node.suffix.length,
            )
          : part!
      if (value || node.kind === SEGMENT_TYPE_PARAM) {
        rawParams[name] = decodeURIComponent(value)
      }
    } else if (node.kind === SEGMENT_TYPE_WILDCARD) {
      const n = node
      const value = path.substring(
        currentPathIndex + n.prefix.length,
        path.length - n.suffix.length,
      )
      const splat = decodeURIComponent(value)
      // TODO: Deprecate *
      rawParams['*'] = splat
      rawParams._splat = splat
      break
    }
  }
  if (leaf.rawParams) Object.assign(rawParams, leaf.rawParams)
  return [
    rawParams,
    {
      part: partIndex,
      node: nodeIndex,
      path: pathIndex,
      param: paramIndex,
    },
  ]
}

export function buildRouteBranch<T extends RouteLike>(route: T) {
  const list = [route]
  while (route.parentRoute) {
    route = route.parentRoute as T
    list.push(route)
  }
  list.reverse()
  return list
}

function buildBranch<T extends RouteLike>(node: AnySegmentNode<T>) {
  const list: Array<AnySegmentNode<T>> = Array(node.depth + 1)
  do {
    list[node.depth] = node
    node = node.parent!
  } while (node)
  return list
}

type MatchStackFrame<T extends RouteLike> = {
  node: AnySegmentNode<T>
  /** index of the segment of path */
  index: number
  /**
   * Bitmask of skipped optional segments.
   *
   * This is a very performant way of storing an "array of booleans", but it means beyond 32 segments we can't track skipped optionals.
   * If we really really need to support more than 32 segments we can switch to using a `BigInt` here. It's about 2x slower in worst case scenarios.
   */
  skipped: number
  /** Positional bitmasks tracking which consumed URL segments matched each segment kind. */
  statics: number
  dynamics: number
  optionals: number
  /** intermediary state for param extraction */
  extract?: ParamExtractionState
  /** intermediary params from param extraction */
  rawParams?: Record<string, string>
}

function getNodeMatch<T extends RouteLike>(
  path: string,
  parts: Array<string>,
  segmentTree: AnySegmentNode<T>,
  fuzzy: boolean,
) {
  // quick check for root index
  // this is an optimization, algorithm should work correctly without this block
  if (path === '/' && segmentTree.index)
    return { node: segmentTree.index, skipped: 0 } as Pick<
      Frame,
      'node' | 'skipped'
    >

  const trailingSlash = !last(parts)
  const pathIsIndex = trailingSlash && path !== '/'
  const partsLength = parts.length - (trailingSlash ? 1 : 0)

  type Frame = MatchStackFrame<T>

  // use a stack to explore all possible paths (params cause branching)
  // iterate "backwards" (low priority first) so that we can push() each candidate, and pop() the highest priority candidate first
  // - pros: it is depth-first, so we find full matches faster
  // - cons: we cannot short-circuit, because highest priority matches are at the end of the loop (for loop with i--) (but we have no good short-circuiting anyway)
  // other possible approaches:
  // - shift instead of pop (measure performance difference), this allows iterating "forwards" (effectively breadth-first)
  // - never remove from the stack, keep a cursor instead. Then we can push "forwards" and avoid reversing the order of candidates (effectively breadth-first)
  const stack: Array<Frame> = [
    {
      node: segmentTree,
      index: 1,
      skipped: 0,
      statics: 0,
      dynamics: 0,
      optionals: 0,
    },
  ]

  let bestFuzzy: Frame | null = null
  let bestMatch: Frame | null = null

  while (stack.length) {
    const frame = stack.pop()!
    const { node, index, skipped, statics, dynamics, optionals } = frame
    let { extract, rawParams } = frame

    // Wildcard candidates are pushed speculatively as fallbacks in case a
    // higher-priority wildcard later fails params.parse. If a better wildcard
    // has already validated and become bestMatch, lower-priority wildcard
    // fallbacks cannot win anymore and should not run params.parse.
    if (
      node.kind === SEGMENT_TYPE_WILDCARD &&
      node.route &&
      !isFrameMoreSpecific(bestMatch, frame)
    ) {
      continue
    }

    if (node.parse) {
      const result = validateParseParams(path, parts, frame)
      if (!result) continue
      rawParams = frame.rawParams
      extract = frame.extract
    }

    // In fuzzy mode, track the best partial match we've found so far
    if (
      fuzzy &&
      node.route &&
      node.kind !== SEGMENT_TYPE_INDEX &&
      isFrameMoreSpecific(bestFuzzy, frame)
    ) {
      bestFuzzy = frame
    }

    const isBeyondPath = index === partsLength
    if (isBeyondPath) {
      if (
        node.route &&
        (!pathIsIndex ||
          node.kind === SEGMENT_TYPE_INDEX ||
          node.kind === SEGMENT_TYPE_WILDCARD) &&
        isFrameMoreSpecific(bestMatch, frame)
      ) {
        bestMatch = frame
      }
      // beyond the length of the path parts, only some segment types can match
      if (!node.optional && !node.wildcard && !node.index && !node.pathless)
        continue
    }

    const part = isBeyondPath ? undefined : parts[index]!
    let lowerPart: string

    // 0. Try index match
    if (isBeyondPath && node.index) {
      const indexFrame = {
        node: node.index,
        index,
        skipped,
        statics,
        dynamics,
        optionals,
        extract,
        rawParams,
      }
      let indexValid = true
      if (node.index.parse) {
        const result = validateParseParams(path, parts, indexFrame)
        if (!result) indexValid = false
      }
      if (indexValid) {
        // perfect match, no need to continue
        // this is an optimization, algorithm should work correctly without this block
        if (
          !dynamics &&
          !optionals &&
          !skipped &&
          isPerfectStaticMatch(statics, partsLength)
        ) {
          return indexFrame
        }
        if (isFrameMoreSpecific(bestMatch, indexFrame)) {
          // index matches skip the stack because they cannot have children
          bestMatch = indexFrame
        }
      }
    }

    // 5. Try wildcard match
    if (node.wildcard) {
      for (let i = node.wildcard.length - 1; i >= 0; i--) {
        const segment = node.wildcard[i]!
        const { prefix, suffix } = segment
        if (prefix) {
          if (isBeyondPath) continue
          const casePart = segment.caseSensitive
            ? part
            : (lowerPart ??= part!.toLowerCase())
          if (!casePart!.startsWith(prefix)) continue
        }
        if (suffix) {
          if (isBeyondPath) continue
          const end = parts.slice(index).join('/')
          const suffixPart = end.slice(-suffix.length)
          const casePart = segment.caseSensitive
            ? suffixPart
            : suffixPart.toLowerCase()
          if (
            casePart !== suffix ||
            end.length - suffix.length < prefix.length
          ) {
            continue
          }
        }
        // wildcard matches consume the rest of the URL and cannot have children
        stack.push({
          node: segment,
          index: partsLength,
          skipped,
          statics,
          dynamics,
          optionals,
          extract,
          rawParams,
        })
      }
    }

    // 4. Try optional match
    if (node.optional) {
      // A skipped optional is keyed by the child node's trie depth.
      const nextSkipped = skipped | (1 << (node.depth + 1))
      for (let i = node.optional.length - 1; i >= 0; i--) {
        const segment = node.optional[i]!
        // when skipping, the node advances by 1, but the index doesn't
        stack.push({
          node: segment,
          index,
          skipped: nextSkipped,
          statics,
          dynamics,
          optionals,
          extract,
          rawParams,
        }) // enqueue skipping the optional
      }
      if (!isBeyondPath) {
        for (let i = node.optional.length - 1; i >= 0; i--) {
          const segment = node.optional[i]!
          const { prefix, suffix } = segment
          if (prefix || suffix) {
            const casePart = segment.caseSensitive
              ? part!
              : (lowerPart ??= part!.toLowerCase())
            if (prefix && !casePart.startsWith(prefix)) continue
            if (
              suffix &&
              casePart.indexOf(suffix, casePart.length - suffix.length) <
                prefix.length
            ) {
              continue
            }
          }
          stack.push({
            node: segment,
            index: index + 1,
            skipped,
            statics,
            dynamics,
            optionals: optionals + segmentScore(partsLength, index),
            extract,
            rawParams,
          })
        }
      }
    }

    // 3. Try dynamic match
    if (!isBeyondPath && node.dynamic && part) {
      for (let i = node.dynamic.length - 1; i >= 0; i--) {
        const segment = node.dynamic[i]!
        const { prefix, suffix } = segment
        if (prefix || suffix) {
          const casePart = segment.caseSensitive
            ? part
            : (lowerPart ??= part.toLowerCase())
          if (prefix && !casePart.startsWith(prefix)) continue
          if (
            suffix &&
            casePart.indexOf(suffix, casePart.length - suffix.length) <
              prefix.length
          ) {
            continue
          }
        }
        stack.push({
          node: segment,
          index: index + 1,
          skipped,
          statics,
          dynamics: dynamics + segmentScore(partsLength, index),
          optionals,
          extract,
          rawParams,
        })
      }
    }

    // 2. Try case insensitive static match
    if (!isBeyondPath && node.staticInsensitive) {
      const match = node.staticInsensitive.get(
        (lowerPart ??= part!.toLowerCase()),
      )
      if (match) {
        stack.push({
          node: match,
          index: index + 1,
          skipped,
          statics: statics + segmentScore(partsLength, index),
          dynamics,
          optionals,
          extract,
          rawParams,
        })
      }
    }

    // 1. Try static match
    if (!isBeyondPath && node.static) {
      const match = node.static.get(part!)
      if (match) {
        stack.push({
          node: match,
          index: index + 1,
          skipped,
          statics: statics + segmentScore(partsLength, index),
          dynamics,
          optionals,
          extract,
          rawParams,
        })
      }
    }

    // 0. Try pathless match
    if (node.pathless) {
      for (let i = node.pathless.length - 1; i >= 0; i--) {
        const segment = node.pathless[i]!
        stack.push({
          node: segment,
          index,
          skipped,
          statics,
          dynamics,
          optionals,
          extract,
          rawParams,
        })
      }
    }
  }

  if (bestMatch) return bestMatch

  if (fuzzy && bestFuzzy) {
    let sliceIndex = bestFuzzy.index
    for (let i = 0; i < bestFuzzy.index; i++) {
      sliceIndex += parts[i]!.length
    }
    const splat = sliceIndex === path.length ? '/' : path.slice(sliceIndex)
    bestFuzzy.rawParams ??= Object.create(null)
    bestFuzzy.rawParams!['**'] = decodeURIComponent(splat)
    return bestFuzzy
  }

  return null
}

function segmentScore(partsLength: number, index: number): number {
  // The specificity scores are bitmasks over consumed URL segments. Earlier
  // URL segments should dominate later ones when comparing scores, so the
  // first real segment gets the highest bit and the last gets bit 0. Since
  // `parts[0]` is the empty string before the leading slash, real URL segments
  // are [1, partsLength), making this segment's bit `partsLength - index - 1`.
  return 2 ** (partsLength - index - 1)
}

function isPerfectStaticMatch(statics: number, partsLength: number): boolean {
  return statics === 2 ** (partsLength - 1) - 1
}

function validateParseParams<T extends RouteLike>(
  path: string,
  parts: Array<string>,
  frame: MatchStackFrame<T>,
) {
  let rawParams: Record<string, string>
  let state: ParamExtractionState

  try {
    ;[rawParams, state] = extractParams(path, parts, frame)
  } catch {
    return null
  }

  frame.rawParams = rawParams
  frame.extract = state

  if (!frame.node.parse) return true

  try {
    if (frame.node.parse(rawParams) === false) return null
  } catch {
    // Thrown parse errors should be surfaced on the selected match by
    // extractStrictParams, not used as fallback route selection.
  }

  return true
}

function isFrameMoreSpecific(
  // the stack frame previously saved as "best match"
  prev: MatchStackFrame<any> | null,
  // the candidate stack frame
  next: MatchStackFrame<any>,
): boolean {
  if (!prev) return true
  return (
    next.statics > prev.statics ||
    (next.statics === prev.statics &&
      (next.dynamics > prev.dynamics ||
        (next.dynamics === prev.dynamics &&
          (next.optionals > prev.optionals ||
            (next.optionals === prev.optionals &&
              ((next.node.kind === SEGMENT_TYPE_INDEX) >
                (prev.node.kind === SEGMENT_TYPE_INDEX) ||
                ((next.node.kind === SEGMENT_TYPE_INDEX) ===
                  (prev.node.kind === SEGMENT_TYPE_INDEX) &&
                  next.node.depth > prev.node.depth)))))))
  )
}
