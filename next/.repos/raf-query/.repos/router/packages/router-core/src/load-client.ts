// Keep this filename free of a secondary extension so declaration generation
// can rewrite relative imports for both ESM and CJS.
import { isNotFound } from './not-found'
import { isRedirect } from './redirect'
import {
  getLocationChangeInfo,
  lifecycleEnd,
  runRouteLifecycle,
} from './router'
import { dehydrateSsrMatchId } from './ssr/ssr-match-id'
import type { GLOBAL_SEROVAL, GLOBAL_TSR } from './ssr/constants'
import type { TsrSsrGlobal } from './ssr/types'
import type { ParsedLocation } from './location'
import type { NavigateOptions } from './link'
import type { AnyRouteMatch } from './Matches'
import type { NotFoundError } from './not-found'
import type {
  AnyRoute,
  LoaderFnContext,
  RouteContextOptions,
  RouteLoaderFn,
} from './route'
import type { AnyRedirect } from './redirect'
import type { AnyRouter, RouterCore, TrailingSlashOption } from './router'
import type { RoutePaths } from './routeInfo'
import type { RouterHistory } from '@tanstack/history'

type RouteComponentType =
  | 'component'
  | 'pendingComponent'
  | 'errorComponent'
  | 'notFoundComponent'

export function replaceRouteChunk(
  route: AnyRoute,
  lazyFn: AnyRoute['lazyFn'],
): void {
  route.lazyFn = lazyFn ?? route.lazyFn
  route._lazy = undefined
}

function preloadComponent(
  route: AnyRoute,
  type: RouteComponentType,
): Promise<void> | undefined {
  return (route.options[type] as any)?.preload?.()
}

function loadComponents(
  route: AnyRoute,
  onPendingReady?: () => void,
): Promise<void> | undefined {
  const component = preloadComponent(route, 'component')
  let pending = preloadComponent(route, 'pendingComponent')
  if (onPendingReady) {
    if (pending) {
      pending = pending.then(onPendingReady)
    } else {
      onPendingReady()
    }
  }
  if (component && pending) {
    return Promise.all([component, pending]).then(() => {})
  }
  return component ?? pending
}

export function loadRouteChunk(
  route: AnyRoute,
  // `false` waits only for lazy route options, before a boundary is selected.
  componentType?: 'errorComponent' | 'notFoundComponent' | false,
  onPendingReady?: () => void,
): Promise<void> | undefined {
  const afterLazy = () =>
    componentType === false
      ? undefined
      : componentType
        ? preloadComponent(route, componentType)
        : loadComponents(route, onPendingReady)
  const current = route._lazy
  if (current) {
    return current === true ? afterLazy() : current.then(afterLazy)
  }
  if (!route.lazyFn) {
    return afterLazy()
  }

  const promise = route.lazyFn().then(
    (lazyRoute) => {
      // HMR clears the owner before an obsolete import can settle.
      if (process.env.NODE_ENV === 'production' || route._lazy === promise) {
        const { id: _id, ...options } = lazyRoute.options
        Object.assign(route.options, options)
        route._lazy = true
      }
    },
    (error) => {
      if (process.env.NODE_ENV === 'production' || route._lazy === promise) {
        route._lazy = undefined
      }
      throw error
    },
  )
  route._lazy = promise
  return promise.then(afterLazy)
}

/** Return the structural lane through the first terminal render boundary. */
export function _getRenderedMatches(
  matches: Array<AnyRouteMatch>,
): Array<AnyRouteMatch> {
  const end =
    matches.findIndex(
      (match) => match.status !== 'success' || match._notFound,
    ) + 1
  return end && end < matches.length ? matches.slice(0, end) : matches
}

/**
 * Truthy when the transaction publishing `location` leaves `routeId` out of its
 * matches, so subscribers scoped to that route can skip the publication: the
 * route unmounts when the transaction commits, and a transaction that ends
 * otherwise is superseded or redirected by a newer publication. Only valid
 * synchronously inside the publication: the transaction's matches are emptied
 * at commit and before following a redirect. Publications without a matching
 * transaction (hydration) and scopes without a route never depart.
 */
export function _isRouteDeparting(
  router: AnyRouter,
  routeId: string | undefined,
  location: ParsedLocation,
): unknown {
  const tx = router._tx
  return (
    routeId &&
    tx?.[2 /* location */] === location &&
    !tx[3 /* matches */].some((match) => match.routeId === routeId)
  )
}

/** Return the lane whose document assets belong to the current presentation. */
export function _getAssetMatches(
  matches: Array<AnyRouteMatch>,
): Array<AnyRouteMatch> {
  let end = matches.length
  for (let index = 0; index < end; index++) {
    const match = matches[index]!
    // `_assetEnd` is only ever set on hydration presentation clones that are
    // `status: 'pending'`, `ssr: 'data-only'`, error-free, and not not-found
    // (see hydrate.ts), and commits clear it — so its presence alone is the guard.
    if (match._assetEnd !== undefined) {
      end = Math.min(end, Math.max(index + 1, match._assetEnd))
      continue
    }
    if (match.status !== 'success' || match._notFound) {
      end = index + 1
      break
    }
  }
  // `end` only ever shrinks to `index + 1 >= 1`, so no zero guard is needed.
  return end < matches.length ? matches.slice(0, end) : matches
}

declare const lanePhase: unique symbol

type LanePhase = 'matched' | 'contextualized' | 'reduced' | 'projected'

/**
 * Lane matches carry their lane's phase so functions can demand evidence of
 * pipeline position (e.g. `commitMatches` only accepts a projected lane's
 * matches). The brand is phantom — it never exists at runtime.
 */
type LaneMatches<TPhase extends LanePhase> = Array<WorkMatch> & {
  readonly [lanePhase]?: TPhase
}

type Lane<TPhase extends LanePhase> = [
  location: ParsedLocation,
  matches: LaneMatches<TPhase>,
  background?: Array<BackgroundLoaderTask>,
  backgroundSettlement?: Promise<IndexedOutcome | undefined>,
] & { readonly [lanePhase]?: TPhase }

type MatchedLane = Lane<'matched'>
type ContextualizedLane = Lane<'contextualized'>
type ReducedLane = Lane<'reduced'>
type ProjectedLane = Lane<'projected'>

const SUCCESS = 0
const ERROR = 1
const NOT_FOUND = 2
// Control outcomes stay contiguous so the hot path can test them together.
const REDIRECTED = 3
const CANCELED = 4
const CANCELED_OUTCOME: [kind: typeof CANCELED] = [CANCELED]

type RedirectOutcome = [
  kind: typeof REDIRECTED,
  redirect: AnyRedirect,
  location?: ParsedLocation,
]

type NonRedirectOutcome =
  | [kind: typeof SUCCESS, data: unknown]
  | [kind: typeof ERROR, error: unknown]
  | [kind: typeof NOT_FOUND, error: NotFoundError]
  | [kind: typeof CANCELED]

type RawLoaderOutcome =
  | NonRedirectOutcome
  | [kind: typeof REDIRECTED, redirect: AnyRedirect]

type LoaderOutcome = NonRedirectOutcome | RedirectOutcome

type IndexedOutcome = [index: number, outcome: LoaderOutcome, boundary?: number]

export type LoaderFlight = [
  outcome: Promise<RawLoaderOutcome>,
  controller: AbortController,
  leases: number,
]

type WorkMatch = AnyRouteMatch & {
  _flight?: LoaderFlight
}

declare const matchPhase: unique symbol

/**
 * A match whose loader outcome has been applied by `settleInto`, which is the
 * sole granter of this brand (phantom, zero-runtime). Consumers that require
 * it — e.g. `cacheLoaderMatch` — can only be reached after settlement, so the
 * compiler enforces the loader→settle→cache ordering. Sources that arrive
 * already settled (dehydrated server data) must cast at a named boundary.
 */
type SettledMatch = WorkMatch & { readonly [matchPhase]: 'settled' }

export type LoadTransaction = [
  controller: AbortController,
  redirects: number,
  location: ParsedLocation,
  matches: Array<AnyRouteMatch>,
  startedAt: number,
  done: Promise<void>,
  /**
   * Dev-only HMR refresh mode. Presence forces successor rematerialization
   * until this publication is acknowledged. The optional hydration handoff is
   * retired when the refresh publishes.
   */
  refresh?: [handoff: NonNullable<AnyRouter['_handoff']> | undefined],
]

export type PendingSession = [
  generation: LoadTransaction,
  boundaryId: string,
  /** Pending reveal time until acknowledged, then minimum-visible-until time. */
  deadline: number,
  revealTimer?: ReturnType<typeof setTimeout>,
  ack?: Promise<boolean> | true,
  component?: unknown,
]

type CoordinatorRouter = AnyRouter & {
  /** Active speculative lanes retained for cancellation, invalidation, and cache clearing. */
  _preloads?: Map<AbortController, Array<AnyRouteMatch>>
  _refreshNextLoad?: boolean
}

type LoaderTask = [
  index: number,
  outcome: Promise<LoaderOutcome>,
  chunkFailure: Promise<IndexedOutcome | undefined | void>,
  candidate?: WorkMatch,
]

type BackgroundLoaderTask = [
  index: number,
  outcome: Promise<LoaderOutcome>,
  chunkFailure: Promise<IndexedOutcome | undefined | void>,
  candidate: WorkMatch,
]

type ExecuteLaneOptions = [
  controller: AbortController,
  redirects: number,
  base: Array<AnyRouteMatch>,
  preload?: boolean,
  sync?: boolean,
  forceStaleReload?: boolean,
  resolvedPrefix?: number,
  onReady?: () => void,
]

type ControlOutcome = RedirectOutcome | [kind: typeof CANCELED]

type LaneResult = ProjectedLane | ControlOutcome

function isControl(
  result: Lane<any> | ControlOutcome,
): result is ControlOutcome {
  return typeof result[0 /* location or kind */] === 'number'
}

export function waitFor<T>(
  value: T | PromiseLike<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    return Promise.race([Promise.reject(signal), value])
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal)
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve(value)
      .then(resolve, reject)
      // Both settlement callbacks return normally, so this chain fulfills.
      .then(() => signal.removeEventListener('abort', abort))
  })
}

export function getRoute(router: AnyRouter, match: WorkMatch): AnyRoute {
  return (router.routesById as Record<string, AnyRoute>)[match.routeId]!
}

function normalize(
  value: unknown,
  rejected: boolean,
  routeId?: string,
): RawLoaderOutcome {
  if (isRedirect(value)) {
    return [REDIRECTED, value]
  }
  if (isNotFound(value)) {
    value.routeId ||= routeId
    return [NOT_FOUND, value]
  }
  if (!rejected) {
    return [SUCCESS, value]
  }
  if (typeof (value as any)?.then === 'function') {
    value = new Error('A Promise was thrown', { cause: value })
  }
  return [ERROR, value]
}

function normalizeError(route: AnyRoute, cause: unknown): RawLoaderOutcome {
  let outcome = normalize(cause, true, route.id)
  if (outcome[0 /* kind */] !== ERROR) {
    return outcome
  }
  try {
    route.options.onError?.(outcome[1 /* error */])
  } catch (onErrorCause) {
    outcome = normalize(onErrorCause, true, route.id)
  }
  return outcome
}

function normalizeLaneError(
  router: AnyRouter,
  lane: Lane<any>,
  route: AnyRoute,
  cause: unknown,
  options: ExecuteLaneOptions,
): LoaderOutcome {
  if (options[0 /* controller */].signal.aborted) {
    return CANCELED_OUTCOME
  }
  return materializeRedirect(
    router,
    lane,
    route,
    normalizeError(route, cause),
    options,
  )
}

async function contextualize(
  router: AnyRouter,
  lane: MatchedLane,
  options: ExecuteLaneOptions,
  end: number,
  planSuccessfulLane: () => void,
  retainedEnd: number,
): Promise<IndexedOutcome | undefined> {
  const [location, matches] = lane
  const signal = options[0 /* controller */].signal
  const preload = !!options[3 /* preload */]
  for (let index = options[6 /* resolvedPrefix */] ?? 0; index < end; index++) {
    const match = matches[index]!
    const route = getRoute(router, match)

    match.abortController = options[0 /* controller */]
    // Contextualization is serial, so the previous match already contains the
    // complete parent context for this route.
    const parentContext =
      matches[index - 1]?.context ?? router.options.context ?? {}
    const common = {
      params: match.params,
      location,
      navigate: (opts: any) =>
        router.navigate({
          ...opts,
          _fromLocation: location,
        }),
      buildLocation: router.buildLocation,
      cause: preload ? ('preload' as const) : match.cause,
      abortController: options[0 /* controller */],
      preload,
      matches,
      routeId: route.id,
    }
    try {
      // Reuse the route's cached contribution while rebuilding its inheritance.
      const routeContext = (match._ctx ||= route.options.context
        ? route.options.context({
            ...common,
            deps: match.loaderDeps,
            context: parentContext,
          } satisfies RouteContextOptions<any, any, any, any, any>) || {}
        : undefined)
      match.context = {
        ...parentContext,
        ...routeContext,
      }
    } catch (cause) {
      releaseFlight(router, match)
      return [index, normalizeLaneError(router, lane, route, cause, options)]
    }
    if (signal.aborted) {
      return [index, CANCELED_OUTCOME]
    }
    const validationError = match.paramsError ?? match.searchError
    if (validationError !== undefined) {
      releaseFlight(router, match)
      return [
        index,
        normalizeLaneError(router, lane, route, validationError, options),
      ]
    }
    const beforeLoad = route.options.beforeLoad
    if (!beforeLoad) {
      continue
    }

    const previousStatus = match.status
    if (index >= retainedEnd) {
      match.status = 'pending'
      options[7 /* onReady */]?.()
    }
    try {
      setFetching(router, match, 'beforeLoad', options[0 /* controller */])
      const value = beforeLoad({
        ...common,
        search: match.search,
        context: match.context,
        ...router.options.additionalContext,
      })
      // Always await to give a queued replacement navigation one microtask to
      // kick in before checking cancellation, even for synchronous context.
      const result = await (typeof value?.then === 'function'
        ? waitFor(value, signal)
        : value)
      if (signal.aborted) {
        return [index, CANCELED_OUTCOME]
      }
      const outcome = materializeRedirect(
        router,
        lane,
        route,
        normalize(result, false, route.id),
        options,
      )
      if (outcome[0 /* kind */] !== SUCCESS) {
        releaseFlight(router, match)
        return [index, outcome]
      }
      match.context = {
        ...match.context,
        ...result,
      }
    } catch (cause) {
      releaseFlight(router, match)
      return [index, normalizeLaneError(router, lane, route, cause, options)]
    } finally {
      match.status = previousStatus
      setFetching(router, match, false, options[0 /* controller */])
    }
  }

  // Let a synchronous lane claim predecessor flights before this frame yields.
  planSuccessfulLane()
  return
}

function releaseOwnedFlight(
  router: AnyRouter,
  match: WorkMatch,
  flight?: LoaderFlight,
): AbortController | undefined {
  if (!flight || --flight[2 /* leases */]) {
    return
  }
  if (router._flights?.get(match.id) === flight) {
    const current = router._tx
    if (
      current &&
      !current[0 /* controller */].signal.aborted &&
      !current[3 /* matches */].includes(match) &&
      current[3 /* matches */].some((candidate) => candidate.id === match.id) &&
      current[3 /* matches */].some(
        (candidate) => candidate.isFetching === 'beforeLoad',
      )
    ) {
      // Keep work discoverable only while the current lane is still running
      // beforeLoad. Loader planning performs the matching zero-owner sweep.
      return
    }
    router._flights.delete(match.id)
  }
  return flight[1 /* controller */]
}

function releaseFlight(router: AnyRouter, match: WorkMatch): void {
  const flight = match._flight
  match._flight = undefined
  releaseOwnedFlight(router, match, flight)?.abort()
}
/**
 * Not passing in a `next` ownership recipient
 * is equivalent to discarding the match resources
 */
function transferMatchResources(
  router: AnyRouter,
  previous: Array<AnyRouteMatch>,
  next?: Array<AnyRouteMatch>,
  deferSameIdFlight?: true,
): void {
  const abort: Array<AbortController> = []
  for (const match of previous as Array<WorkMatch>) {
    if (!next?.includes(match)) {
      const flight = match._flight
      match._flight = undefined
      if (
        deferSameIdFlight &&
        flight?.[2 /* leases */] === 1 &&
        router._flights?.get(match.id) === flight &&
        next?.some((candidate) => candidate.id === match.id)
      ) {
        // The successor has not made its same-ID reload decision yet.
        flight[2 /* leases */] = 0
      } else {
        const controller = releaseOwnedFlight(router, match, flight)
        if (controller) {
          abort.push(controller)
        }
      }
    }
  }
  for (const controller of abort) {
    controller.abort()
  }
}

function acquireMatchResources(matches: Array<AnyRouteMatch>): void {
  for (const match of matches as Array<WorkMatch>) {
    const flight = match._flight
    if (flight) {
      flight[2 /* leases */]++
    }
  }
}

function setFetching(
  router: AnyRouter,
  match: WorkMatch,
  value: AnyRouteMatch['isFetching'],
  owner?: AbortController,
): void {
  match.isFetching = value
  if (owner && router._tx?.[0 /* controller */] !== owner) {
    return
  }
  const store = router.stores.byRoute.get(match.routeId)
  const presented = store?.get()
  if (presented?.id === match.id) {
    store!.set({ ...presented, isFetching: value })
  }
}

function getLoaderContext(
  router: AnyRouter,
  lane: ContextualizedLane,
  match: WorkMatch,
  route: AnyRoute,
  controller: AbortController,
  parentMatchPromise: Promise<WorkMatch> | undefined,
  preload: boolean,
): LoaderFnContext {
  const location = lane[0 /* location */]
  return {
    params: match.params,
    location,
    navigate: (opts: any) =>
      router.navigate({
        ...opts,
        _fromLocation: location,
      }),
    cause: preload ? ('preload' as const) : match.cause,
    abortController: controller,
    preload,
    deps: match.loaderDeps,
    parentMatchPromise: parentMatchPromise as any,
    context: match.context,
    route,
    ...router.options.additionalContext,
  }
}

async function loadResource(
  router: AnyRouter,
  lane: ContextualizedLane,
  match: WorkMatch,
  route: AnyRoute,
  loader: RouteLoaderFn<any> | undefined,
  parentMatchPromise: Promise<WorkMatch> | undefined,
  options: ExecuteLaneOptions,
): Promise<LoaderOutcome> {
  const owner = options[0 /* controller */]
  const signal = owner.signal
  if (signal.aborted) {
    return CANCELED_OUTCOME
  }
  if (!loader) {
    return [SUCCESS, undefined]
  }

  let flight = match._flight
  setFetching(router, match, 'loader', owner)
  try {
    if (!flight) {
      const controller = new AbortController()
      flight = [
        Promise.resolve()
          .then(() =>
            loader(
              getLoaderContext(
                router,
                lane,
                match,
                route,
                controller,
                parentMatchPromise,
                !!options[3 /* preload */],
              ),
            ),
          )
          .then(
            (value) => normalize(value, false, route.id),
            (cause) => normalize(cause, true, route.id),
          )
          .then((result): RawLoaderOutcome => {
            // The registry controls discovery; leases keep current consumers
            // sharing the same terminal outcome.
            if (
              result[0 /* kind */] !== SUCCESS &&
              router._flights?.get(match.id) === flight
            ) {
              router._flights!.delete(match.id)
              if (!flight![2 /* leases */]) {
                controller.abort()
              }
            }
            return result[0 /* kind */] === ERROR && flight![2 /* leases */]
              ? normalizeError(route, result[1 /* error */])
              : result
          }),
        controller,
        1,
      ]
      ;(router._flights ??= new Map()).set(match.id, flight)
    }
    match._flight = flight
    match.abortController = flight[1 /* controller */]
    return materializeRedirect(
      router,
      lane,
      route,
      await waitFor(flight[0 /* outcome */], signal),
      options,
    )
  } catch (cause) {
    if (cause !== signal || !signal.aborted) {
      throw cause
    }
    releaseFlight(router, match)
    return CANCELED_OUTCOME
  } finally {
    setFetching(router, match, false, owner)
  }
}

function settleInto(
  match: WorkMatch,
  result: LoaderOutcome,
  preload: boolean,
): asserts match is SettledMatch {
  if (result[0 /* kind */] === REDIRECTED) {
    return
  }
  // Reduction installs only the selected terminal failure. Every other
  // settled attempt remains a renderable, stale match in that lane.
  match.status = 'success'
  match.error = undefined
  if (result[0 /* kind */] === SUCCESS) {
    match.loaderData = result[1 /* data */]
    match.invalid = false
    match.updatedAt = Date.now()
    match.preload = preload
  } else {
    match.invalid = true
  }
}

export function cacheLoaderMatch(
  router: CoordinatorRouter,
  match: SettledMatch,
  planned: AnyRouteMatch | undefined,
): void {
  const current = router._cache.get(match.id) as WorkMatch | undefined
  if (
    current !== planned ||
    router._committed.some(
      (candidate) =>
        candidate.id === match.id &&
        (candidate as WorkMatch)._flight === match._flight,
    )
  ) {
    return
  }
  const cached = {
    ...match,
    _notFound: undefined,
    context: {},
  } as WorkMatch
  if (cached._flight) {
    cached._flight[2 /* leases */]++
  }
  router._cache.set(match.id, cached)
  if (current) {
    releaseFlight(router, current)
  }
}

function getParentSnapshot(
  match: WorkMatch,
  outcome: LoaderOutcome,
): WorkMatch {
  if (outcome[0 /* kind */] === ERROR || outcome[0 /* kind */] === NOT_FOUND) {
    return {
      ...match,
      status: outcome[0 /* kind */] === ERROR ? 'error' : 'notFound',
      error: outcome[1 /* error */],
      _flight: undefined,
    }
  }
  return match
}

function createLoaderTask(
  router: AnyRouter,
  lane: ContextualizedLane,
  index: number,
  tasks: Array<LoaderTask>,
  semanticParent: Promise<WorkMatch> | undefined,
  options: ExecuteLaneOptions,
  retainedEnd: number,
): Promise<WorkMatch> {
  const match = lane[1 /* matches */][index]!
  const route = getRoute(router, match)
  const preload = !!options[3 /* preload */]
  const plannedCacheMatch = router._cache.get(match.id)
  let configured
  let reload = false
  let reloadFailure: LoaderOutcome | undefined
  try {
    if (match.status === 'success') {
      configured = route.options.shouldReload
      if (typeof configured === 'function') {
        configured = configured(
          getLoaderContext(
            router,
            lane,
            match,
            route,
            options[0 /* controller */],
            semanticParent,
            preload,
          ),
        )
      }
      if (options[0 /* controller */].signal.aborted) {
        reloadFailure = CANCELED_OUTCOME
      }
    }
    if (!reloadFailure) {
      if (match.status !== 'success') {
        reload = true
      } else {
        const staleAge =
          preload || match.preload
            ? (route.options.preloadStaleTime ??
              router.options.defaultPreloadStaleTime ??
              30_000)
            : (route.options.staleTime ?? router.options.defaultStaleTime ?? 0)
        reload = !!(
          match.invalid ||
          configured ||
          (configured === undefined &&
            Date.now() - match.updatedAt >= staleAge &&
            (options[5 /* forceStaleReload */] ||
              match.cause === 'enter' ||
              options[2 /* base */].some(
                (candidate) =>
                  candidate.routeId === match.routeId &&
                  candidate.id !== match.id,
              )))
        )
      }
    }
  } catch (cause) {
    match.invalid = true
    releaseFlight(router, match)
    reloadFailure = normalizeLaneError(router, lane, route, cause, options)
  }
  const routeLoader = route.options.loader
  const isLoaderFn = typeof routeLoader === 'function'
  const loader = isLoaderFn ? routeLoader : routeLoader?.handler
  const preloadable = !preload || route.options.preload !== false
  let donor =
    preloadable &&
    routeLoader &&
    !(process.env.NODE_ENV !== 'production' && router._tx?.[6 /* refresh */])
      ? router._flights?.get(match.id)
      : undefined
  if (donor === match._flight || reloadFailure) {
    donor = undefined
  } else if (donor && !reload && !preload && configured === undefined) {
    // Normal cache policy accepts an already-running generation even when this
    // lane itself would not have started another loader.
    reload = true
  } else if (!reload) {
    donor = undefined
  }
  const background = !!(
    routeLoader &&
    reload &&
    match.status === 'success' &&
    !preload &&
    !options[4 /* sync */] &&
    ((isLoaderFn ? undefined : routeLoader.staleReloadMode) ??
      router.options.defaultStaleReloadMode) !== 'blocking'
  )
  const loaded = reload && preloadable
  const blocking =
    loaded && !background && (match.status !== 'success' || !!routeLoader)
  const onReady = index >= retainedEnd ? options[7 /* onReady */] : undefined
  const onLazyReady = route.lazyFn && route._lazy !== true ? onReady : undefined
  if (loaded && !routeLoader) {
    match.invalid = false
    match.updatedAt = Date.now()
  }
  if (donor) {
    donor[2 /* leases */]++
  }
  if (blocking) {
    const acceptedFlight = match._flight
    match._flight = donor
    releaseOwnedFlight(router, match, acceptedFlight)?.abort()
    // A mounted success remains renderable while its loader revalidates. Every
    // non-retained blocking generation presents pending state.
    if (index >= retainedEnd) {
      match.status = 'pending'
    }
    onReady?.()
  }
  if (!loaded) {
    match.isFetching = false
  }
  const outcome =
    !reloadFailure && blocking
      ? loadResource(
          router,
          lane,
          match,
          route,
          loader,
          semanticParent,
          options,
        ).then((result) => {
          settleInto(match, result, preload)
          if (result[0 /* kind */] === SUCCESS) {
            // A settled generation can outlive its lane without keeping unresolved
            // navigation work alive.
            if (routeLoader && !options[0 /* controller */].signal.aborted) {
              cacheLoaderMatch(router, match, plannedCacheMatch)
            }
            // A route is renderable only after both its data and normal component
            // chunk are ready. Its loader data is already available to descendants.
            if (index >= retainedEnd) {
              match.status = 'pending'
            }
          }
          return result
        })
      : Promise.resolve<LoaderOutcome>(
          reloadFailure ?? [SUCCESS, match.loaderData],
        )

  // Keep thrown preloads and rejected chunks in the same task promise.
  const chunkFailure = (async (): Promise<IndexedOutcome | void> => {
    try {
      const chunk = loadRouteChunk(route, undefined, onLazyReady)
      if (chunk) {
        await waitFor(chunk, options[0 /* controller */].signal)
      }
    } catch (cause) {
      if (
        !lane[1 /* matches */].some(
          (candidate, candidateIndex) =>
            candidateIndex <= index &&
            (candidate.status === 'error' ||
              candidate.status === 'notFound' ||
              candidate._notFound),
        )
      ) {
        return [
          index,
          normalizeLaneError(router, lane, route, cause, options),
        ] satisfies IndexedOutcome
      }
    }
    // Readiness requires both the component chunk and loader data.
    const result = await outcome
    if (
      blocking &&
      result[0 /* kind */] === SUCCESS &&
      match.status === 'pending' &&
      !options[0 /* controller */].signal.aborted
    ) {
      match.status = 'success'
      onReady?.()
    }
  })()
  tasks.push([index, outcome, chunkFailure])
  if (!background) {
    return outcome.then((result) => getParentSnapshot(match, result))
  }
  const candidate: WorkMatch = {
    ...match,
    status: 'pending',
    preload: false,
    _flight: donor,
  }
  match.invalid = false
  match.isFetching = 'loader'
  const backgroundOutcome = loadResource(
    router,
    lane,
    candidate,
    route,
    loader,
    semanticParent,
    options,
  ).then((result) => {
    match.isFetching = false
    settleInto(candidate, result, false)
    return result
  })
  ;(lane[2 /* background */] ??= []).push([
    index,
    backgroundOutcome,
    chunkFailure,
    candidate,
  ])
  return backgroundOutcome.then((result) =>
    getParentSnapshot(candidate, result),
  )
}

async function getNotFoundBoundary(
  router: AnyRouter,
  matches: Array<WorkMatch>,
  indexed: IndexedOutcome | undefined,
  signal: AbortSignal,
  fallback = 0,
): Promise<number> {
  const cause = indexed?.[1 /* outcome */][1 /* error or redirect */] as
    | NotFoundError
    | undefined
  let index = cause?.routeId
    ? matches.findIndex((match) => match.routeId === cause.routeId)
    : (indexed?.[0 /* index */] ?? matches.length - 1)
  if (index < 0) {
    index = 0
  }
  for (let i = index; i >= 0; i--) {
    const route = getRoute(router, matches[i]!)
    try {
      const loading = loadRouteChunk(route, false)
      if (loading) {
        await waitFor(loading, signal)
      }
    } catch (cause) {
      if (cause === signal && signal.aborted) {
        throw cause
      }
    }
    if (route.options.notFoundComponent) {
      return i
    }
  }
  return cause?.routeId ? index : fallback
}

function discardBackground(router: AnyRouter, lane: Lane<any>): void {
  if (lane[2 /* background */]) {
    transferMatchResources(
      router,
      lane[2 /* background */].map((task) => task[3 /* candidate */]),
    )
    lane[2 /* background */] = undefined
  }
}

async function settleTasks(
  tasks: Array<LoaderTask>,
  serialFailure?: IndexedOutcome,
  redirectTasks?: Array<BackgroundLoaderTask>,
  gate?: number | Promise<number>,
): Promise<IndexedOutcome | undefined> {
  let loaderFailure: IndexedOutcome | undefined

  try {
    await Promise.all(
      tasks.map((task) =>
        task[1 /* outcome */].then(async (outcome) => {
          const taskIndex = task[0 /* index */]
          if (gate && taskIndex >= (await gate)) {
            return
          }
          if (outcome[0 /* kind */] >= REDIRECTED) {
            throw [taskIndex, outcome] as IndexedOutcome
          }
          if (!loaderFailure && outcome[0 /* kind */] !== SUCCESS) {
            loaderFailure = [taskIndex, outcome]
            // Every started descendant must settle before an ordinary failure
            // wins because a redirect from any of them remains control flow.
            await Promise.all(
              (redirectTasks ?? []).map((nextTask) => {
                if (nextTask[0 /* index */] <= taskIndex) {
                  return
                }
                return nextTask[1 /* outcome */].then((nextOutcome) => {
                  if (nextOutcome[0 /* kind */] === REDIRECTED) {
                    throw [
                      nextTask[0 /* index */],
                      nextOutcome,
                    ] as IndexedOutcome
                  }
                })
              }),
            )
          }
        }),
      ),
    )
  } catch (cause) {
    return cause as IndexedOutcome
  }
  return serialFailure ?? loaderFailure
}

function materializeRedirect(
  router: AnyRouter,
  lane: Lane<any>,
  route: AnyRoute,
  outcome: RawLoaderOutcome,
  options: ExecuteLaneOptions,
  failed?: true,
): LoaderOutcome {
  while (outcome[0 /* kind */] === REDIRECTED) {
    const redirect = outcome[1 /* redirect */]
    const redirectOptions = redirect.options
    try {
      if (redirectOptions.href || redirect.headers.has('Location')) {
        router.resolveRedirect(redirect)
        if (redirectOptions.reloadDocument) {
          return outcome
        }
      }
      if (
        redirectOptions.reloadDocument
          ? options[3 /* preload */]
          : options[1 /* redirects */] >= 20
      ) {
        return outcome
      }
      const location = router.buildLocation({
        ...redirectOptions,
        _fromLocation: lane[0 /* location */],
        _includeValidateSearch: true,
      })
      const publicLocation = location.maskedLocation ?? location
      if (publicLocation.external) {
        // Loader outcomes can be shared by lanes with different search/params.
        // Keep the resolved destination local to this lane.
        const resolved = redirect.clone() as AnyRedirect
        resolved.options = { ...redirectOptions }
        resolved.headers.set('Location', publicLocation.publicHref)
        router.resolveRedirect(resolved)
        // A two-item outcome marks a terminal redirect for preloads.
        return options[3 /* preload */]
          ? [REDIRECTED, resolved]
          : [REDIRECTED, resolved, publicLocation]
      }
      return [REDIRECTED, redirect, location]
    } catch (cause) {
      outcome = failed ? [ERROR, cause] : normalizeError(route, cause)
      failed = true
    }
  }
  return outcome
}

async function reduceLane(
  router: AnyRouter,
  lane: ContextualizedLane,
  tasks: Array<LoaderTask>,
  controller: AbortController,
  settlement: Promise<IndexedOutcome | undefined>,
  onReady?: () => void,
): Promise<ReducedLane | ControlOutcome> {
  const matches = lane[1 /* matches */]
  let failure = await settlement
  let redirectLimitExceeded = false
  const plannedBoundary = matches.findIndex((match) => match._notFound)
  const boundaryOf = (found: IndexedOutcome) =>
    found[1 /* outcome */][0 /* kind */] === NOT_FOUND
      ? getNotFoundBoundary(router, matches, found, controller.signal)
      : found[0 /* index */]
  let readinessEnd = plannedBoundary < 0 ? matches.length : plannedBoundary

  if ((failure?.[1 /* outcome */][0 /* kind */] ?? 0) >= REDIRECTED) {
    readinessEnd = 0
  } else if (failure) {
    readinessEnd = failure[2 /* boundary */] ??= await boundaryOf(failure)
    for (const task of tasks) {
      if (task[0 /* index */] >= readinessEnd) {
        break
      }
      const outcome = await task[1 /* outcome */]
      // Presence means a loader previously succeeded, even with `undefined`.
      if (
        outcome[0 /* kind */] !== SUCCESS &&
        outcome[0 /* kind */] < REDIRECTED &&
        !('loaderData' in matches[task[0 /* index */]]!)
      ) {
        failure = [task[0 /* index */], outcome]
        readinessEnd = failure[2 /* boundary */] = await boundaryOf(failure)
        break
      }
    }
  }

  for (const task of tasks) {
    if (task[0 /* index */] >= readinessEnd) {
      break
    }
    const chunkFailure = await task[2 /* chunkFailure */]
    if (!chunkFailure) {
      continue
    }
    failure = chunkFailure
    break
  }

  if ((failure?.[1 /* outcome */][0 /* kind */] ?? 0) >= REDIRECTED) {
    const outcome = failure![1 /* outcome */]
    if (
      outcome[0 /* kind */] !== REDIRECTED ||
      outcome[1 /* redirect */].options.reloadDocument ||
      outcome[2 /* location */]
    ) {
      discardBackground(router, lane)
      return outcome as ControlOutcome
    }
    redirectLimitExceeded = true
    failure = [0, [ERROR, new Error('Too many redirects')]]
  }

  const boundary = failure
    ? (failure[2 /* boundary */] ?? (await boundaryOf(failure)))
    : plannedBoundary
  if (boundary >= 0) {
    const outcome = failure?.[1 /* outcome */]
    const kind = outcome?.[0 /* kind */]
    const match = matches[boundary]!
    const cause = outcome?.[1 /* error or redirect */]
    const install = () => {
      if (outcome) {
        match._notFound = undefined
        if (kind === ERROR) {
          match.status = 'error'
        } else {
          ;(cause as NotFoundError).routeId = match.routeId
          if (match.routeId === router.routeTree.id) {
            match.status = 'success'
            match._notFound = true
          } else {
            match.status = 'notFound'
          }
        }
        match.error = cause
        match.isFetching = false
      }
    }
    install()
    if (!outcome) {
      onReady?.()
    }
    const route = getRoute(router, match)
    try {
      await waitFor<unknown>(
        outcome
          ? Promise.resolve().then(() =>
              loadRouteChunk(
                route,
                kind === ERROR ? 'errorComponent' : 'notFoundComponent',
              ),
            )
          : Promise.all([
              loadRouteChunk(route),
              loadRouteChunk(route, 'notFoundComponent'),
            ]),
        controller.signal,
      )
    } catch (cause) {
      if (cause === controller.signal && controller.signal.aborted) {
        discardBackground(router, lane)
        return CANCELED_OUTCOME
      }
    }
    if (!outcome) {
      match.status = 'success'
    } else if (redirectLimitExceeded) {
      controller.abort()
      await Promise.all([
        ...tasks.map((task) => task[1 /* outcome */]),
        ...tasks.map((task) => task[2 /* chunkFailure */]),
        ...(lane[2 /* background */] ?? []).map(
          (task) => task[1 /* outcome */],
        ),
      ])
      discardBackground(router, lane)
      transferMatchResources(router, matches)
      install()
    }
  }

  return lane as ReducedLane
}

export async function projectLane(
  router: AnyRouter,
  lane: ReducedLane,
  signal: AbortSignal,
  start = 0,
  end = lane[1 /* matches */].length,
): Promise<ProjectedLane> {
  const matches = lane[1 /* matches */]
  for (let index = start; index < end; index++) {
    const match = matches[index]!
    const routeOptions = getRoute(router, match).options
    if (routeOptions.head || routeOptions.scripts) {
      try {
        const context = {
          ssr: router.options.ssr,
          matches,
          match,
          params: match.params,
          loaderData: match.loaderData,
        }
        const [head, scripts] = await waitFor(
          Promise.all([
            routeOptions.head?.(context),
            routeOptions.scripts?.(context),
          ]),
          signal,
        )
        match.meta = head?.meta
        match.links = head?.links
        match.headScripts = head?.scripts
        match.styles = head?.styles
        match.scripts = scripts
      } catch (cause) {
        if (cause === signal && signal.aborted) {
          break
        }
        console.error(cause)
      }
    }
    if (match.status !== 'success' || match._notFound) {
      break
    }
  }
  return lane as ProjectedLane
}

async function executeClientLane(
  router: AnyRouter,
  location: ParsedLocation,
  matches: Array<AnyRouteMatch>,
  options: ExecuteLaneOptions,
): Promise<LaneResult> {
  const matched = [location, matches as Array<WorkMatch>] as MatchedLane
  const signal = options[0 /* controller */].signal
  let reduced: ReducedLane | ControlOutcome
  try {
    const presented = router.stores.matches.get()
    let plannedBoundary = matches.findIndex((match) => match._notFound)
    if (router.options.notFoundMode !== 'root' && plannedBoundary >= 0) {
      const boundary = await getNotFoundBoundary(
        router,
        matches as Array<WorkMatch>,
        undefined,
        signal,
        plannedBoundary,
      )
      matches[plannedBoundary]!._notFound = undefined
      matches[boundary]!._notFound = true
      plannedBoundary = boundary
    }
    let end = plannedBoundary < 0 ? matches.length : plannedBoundary + 1
    let retainedEnd = 0
    while (retainedEnd < end && retainedEnd !== plannedBoundary) {
      const match = matches[retainedEnd]!
      const committed = options[2 /* base */][retainedEnd]
      const visible = presented[retainedEnd]
      if (
        committed?.id !== match.id ||
        committed.status !== 'success' ||
        match.preload ||
        visible?.id !== match.id ||
        visible.status !== 'success'
      ) {
        break
      }
      retainedEnd++
      if (committed._notFound || visible._notFound) {
        break
      }
    }
    const tasks: Array<LoaderTask> = []
    const start = options[6 /* resolvedPrefix */] ?? 0
    let semanticParent = start
      ? Promise.resolve(matches[start - 1] as WorkMatch)
      : undefined
    const planSuccessfulLane = () => {
      for (let index = start; index < end; index++) {
        if (signal.aborted) {
          break
        }
        semanticParent = createLoaderTask(
          router,
          matched as ContextualizedLane,
          index,
          tasks,
          semanticParent,
          options,
          retainedEnd,
        )
      }
    }
    // From here on `matched` is contextualized: `contextualize` communicates
    // through mutation plus a failure return, so the phase brand is asserted at
    // the two use sites below rather than granted by a (byte-costing) return.
    const failure = await contextualize(
      router,
      matched,
      options,
      end,
      planSuccessfulLane,
      retainedEnd,
    )
    if (failure) {
      options[4 /* sync */] = true
      end = failure[0 /* index */]
      if (failure[1 /* outcome */][0 /* kind */] === NOT_FOUND) {
        const boundary = await getNotFoundBoundary(
          router,
          matches as Array<WorkMatch>,
          failure,
          signal,
        )
        failure[2 /* boundary */] = boundary
        end = Math.min(end, boundary + 1)
      } else if (failure[1 /* outcome */][0 /* kind */] >= REDIRECTED) {
        end = 0
      }
      planSuccessfulLane()
    }
    if (!signal.aborted && !options[3 /* preload */]) {
      const abort: Array<AbortController> = []
      for (const [id, flight] of router._flights ?? []) {
        if (!flight[2 /* leases */]) {
          router._flights!.delete(id)
          abort.push(flight[1 /* controller */])
        }
      }
      for (const controller of abort) {
        controller.abort()
      }
    }
    const reduction = reduceLane(
      router,
      matched as ContextualizedLane,
      tasks,
      options[0 /* controller */],
      settleTasks(tasks, failure, matched[2 /* background */]),
      options[7 /* onReady */],
    )
    if (matched[2 /* background */]?.length) {
      matched[3 /* backgroundSettlement */] = settleTasks(
        matched[2 /* background */],
        undefined,
        undefined,
        reduction.then(
          (foreground) =>
            isControl(foreground) ? 0 : _getRenderedMatches(matches).length,
          () => 0,
        ),
      )
    }
    reduced = await reduction
  } catch (cause) {
    discardBackground(router, matched)
    if (cause === signal && signal.aborted) {
      return CANCELED_OUTCOME
    }
    throw cause
  }
  if (isControl(reduced)) {
    return reduced
  }
  return projectLane(
    router,
    reduced,
    signal,
    options[6 /* resolvedPrefix */] === matches.length
      ? options[6 /* resolvedPrefix */]
      : 0,
  )
}

/**
 * Waits for `pendingMs`, then presents the complete lane. Rendering applies the
 * selected boundary cutoff while retaining every match's structural state.
 * A replacement load for the same match keeps the timer; choosing a different
 * match resets it. `pendingMinMs` starts after the fallback renders.
 */
function offerPending(router: CoordinatorRouter, tx: LoadTransaction): void {
  if (router._tx !== tx) {
    return
  }
  const matches = tx[3 /* matches */]
  const presented = router.stores.matches.get()
  let session = router._pending
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index]!
    const success = match.status === 'success' && !match._notFound
    const presentedPending =
      presented[index]?.id === match.id &&
      presented[index]?.status === 'pending'
    if (success && !presentedPending) {
      continue
    }
    const route = getRoute(router, match as WorkMatch)
    const delay =
      success || match.invalid
        ? 0
        : (route.options.pendingMs ?? router.options.defaultPendingMs)
    const component =
      route.options.pendingComponent ??
      (router.options as any).defaultPendingComponent
    if (!component || typeof delay !== 'number' || delay === Infinity) {
      if (session) {
        session[0 /* generation */] = tx
        session[2 /* deadline */] = 0
        session[4 /* ack */] = true
      }
      return
    }
    const min =
      route.options.pendingMinMs ?? router.options.defaultPendingMinMs ?? 0
    let tookOver = false
    if (session?.[1 /* boundaryId */] === match.id) {
      tookOver = session[0 /* generation */] !== tx
      session[0 /* generation */] = tx
    } else {
      clearTimeout(session?.[3 /* revealTimer */])
      router._pending = session = undefined
    }
    if (!session) {
      // Hydration and redirects can preserve pending presentation without a session.
      // Do not delay it again; conservatively start pendingMinMs from now.
      router._pending = session = [
        tx,
        match.id,
        presentedPending ? Date.now() + min : tx[4 /* startedAt */] + delay,
        undefined,
        presentedPending || undefined,
        component,
      ]
    }
    if (
      session[4 /* ack */] &&
      !tookOver &&
      session[5 /* component */] === component
    ) {
      return
    }
    session[5 /* component */] = component
    if (!session[4 /* ack */]) {
      clearTimeout(session[3 /* revealTimer */])
      const remaining = session[2 /* deadline */] - Date.now()
      if (remaining > 0) {
        session[3 /* revealTimer */] = setTimeout(
          () => offerPending(router, tx),
          remaining,
        )
        return
      }
      session[2 /* deadline */] = 0
    }
    const offered = matches.map((match) => ({
      ...match,
      _flight: undefined,
    }))
    offered[index]!.status = 'pending'
    const ack = (session[4 /* ack */] = router
      .startTransition(() => router.stores.setMatches(offered), offered)
      .then((rendered) => {
        if (
          rendered &&
          router._pending === session &&
          session![4 /* ack */] === ack &&
          !session![2 /* deadline */]
        ) {
          session![2 /* deadline */] = Date.now() + min
        }
        return rendered
      }))
    return
  }
}

/**
 * Cancels pending UI timing unless the current successor can take over the
 * same boundary that remains painted.
 */
function finishPending(router: CoordinatorRouter, tx: LoadTransaction): void {
  const session = router._pending
  if (
    router._tx === tx ||
    !router._tx?.[3 /* matches */].some(
      (match) => match.id === session?.[1 /* boundaryId */],
    )
  ) {
    clearTimeout(session?.[3 /* revealTimer */])
    router._pending = undefined
  }
}

async function awaitPendingMinimum(
  router: CoordinatorRouter,
  tx: LoadTransaction,
): Promise<void> {
  const session = router._pending
  if (!session) {
    return
  }
  clearTimeout(session[3 /* revealTimer */])
  const remaining = session[2 /* deadline */] - Date.now()
  if (
    !session[4 /* ack */] ||
    remaining <= 0 ||
    !_getRenderedMatches(tx[3 /* matches */]).some(
      (match) => match.id === session[1 /* boundaryId */],
    )
  ) {
    return
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await waitFor(
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, remaining)
      }),
      tx[0 /* controller */].signal,
    )
  } catch {}
  clearTimeout(timer)
}

function publishMatches(
  router: CoordinatorRouter,
  matches: Array<AnyRouteMatch>,
): void {
  router._committed = matches
  router.stores.setMatches(matches)
}

export function commitMatches(
  router: CoordinatorRouter,
  tx: LoadTransaction,
  matches: LaneMatches<'projected'>,
  resolvedPrefix?: number,
): void {
  const previous = router._committed
  const previousEnd = router._lifecycleEnd
  const previousCached = router._cache
  for (const match of matches) {
    match.preload = false
    if (resolvedPrefix) {
      match._assetEnd = undefined
    }
  }
  const cut = _getRenderedMatches(matches).length
  const cached = new Map<string, AnyRouteMatch>()
  if (process.env.NODE_ENV === 'production' || !tx[6 /* refresh */]) {
    const now = Date.now()
    // The rendered prefix and settled descendants supersede older generations.
    // Unsettled matches beyond a fallback must not evict a newer preload.
    const superseded = new Set<string>()
    for (let index = 0; index < matches.length; index++) {
      const match = matches[index]!
      if (index < cut || match.status === 'success') {
        superseded.add(match.id)
      }
    }
    for (const match of [...previous, ...previousCached.values()]) {
      if (match.status !== 'success' || superseded.has(match.id)) {
        continue
      }
      const work = match as WorkMatch
      const route = getRoute(router, work)
      if (
        !route.options.loader ||
        now - match.updatedAt >=
          (match.preload
            ? (route.options.preloadGcTime ??
              router.options.defaultPreloadGcTime ??
              300_000)
            : (route.options.gcTime ?? router.options.defaultGcTime ?? 300_000))
      ) {
        continue
      }
      cached.set(
        match.id,
        previousCached.get(match.id) === match
          ? match
          : ({
              ...match,
              _flight: undefined,
              isFetching: false,
              context: {},
            } as WorkMatch),
      )
    }
  }
  // The lane becomes committed before publication can synchronously reenter.
  tx[3 /* matches */] = []
  router._cache = cached
  // Publish lifecycle membership with its branch before observers can reenter.
  const nextEnd = (router._lifecycleEnd = lifecycleEnd(matches))
  publishMatches(router, matches)
  // Retained cache objects keep their leases; only departing owners need handoff.
  const previousMatches = [...previousCached.values(), ...previous]
  transferMatchResources(
    router,
    previousMatches.filter(
      (match: WorkMatch) => match._flight && cached.get(match.id) !== match,
    ),
    matches,
  )
  if (process.env.NODE_ENV !== 'production') {
    const handoff = tx[6 /* refresh */]?.[0 /* handoff */]
    if (handoff && router._handoff === handoff) {
      handoff[1 /* finish */]()
    }
  }
  runRouteLifecycle(router, previous, matches, previousEnd, nextEnd, tx)
}

/**
 * Resolve once the router has settled on a transaction other than `owner`.
 * Each transaction's completion follows its current successor, so all waiters
 * share the same chain instead of polling every successor independently.
 */
async function awaitCurrent(
  router: CoordinatorRouter,
  owner?: LoadTransaction,
): Promise<void> {
  let current = router._tx
  while (current && current !== owner) {
    owner = current
    await current[5 /* done */]
    current = router._tx
  }
}

function followRedirect(
  router: CoordinatorRouter,
  tx: LoadTransaction,
  outcome: RedirectOutcome,
): Promise<void> {
  const options = outcome[1 /* redirect */].options
  const location = outcome[2 /* location */]
  if (!location) {
    return router.navigate({
      ...options,
      replace: true,
      ignoreBlocker: true,
    } as any)
  }
  if (options.reloadDocument) {
    return router.navigate({
      href: (location.maskedLocation ?? location).publicHref,
      reloadDocument: true,
      replace: true,
      ignoreBlocker: true,
    } as any)
  }
  ;(location as ParsedLocation & { _redirects?: number })._redirects =
    tx[1 /* redirects */] + 1
  router._pendingLocation = location
  const committed = router.commitLocation({
    ...location,
    viewTransition: options.viewTransition,
    replace: true,
    resetScroll: options.resetScroll,
    hashScrollIntoView: options.hashScrollIntoView,
    ignoreBlocker: true,
  })
  queueMicrotask(() => {
    if (router._pendingLocation === location) {
      router._pendingLocation = undefined
    }
  })
  return committed
}

async function runBackground(
  router: CoordinatorRouter,
  tx: LoadTransaction,
  base: Array<AnyRouteMatch>,
  tasks: Array<BackgroundLoaderTask>,
  settlement: Promise<IndexedOutcome | undefined>,
): Promise<void> {
  const next = base.map((match) => ({ ...match }))
  acquireMatchResources(next)
  for (const task of tasks) {
    releaseFlight(router, next[task[0 /* index */]]!)
    next[task[0 /* index */]] = task[3 /* candidate */]
  }
  // Phase jump: the clones inherit beforeLoad context from the committed
  // foreground lane, which already ran `contextualize` for these matches.
  const lane = [tx[2 /* location */], next] as ContextualizedLane
  let reduced: ReducedLane | ControlOutcome
  try {
    reduced = await reduceLane(
      router,
      lane,
      tasks,
      tx[0 /* controller */],
      settlement,
    )
  } catch (cause) {
    transferMatchResources(router, next)
    throw cause
  }
  if (isControl(reduced)) {
    transferMatchResources(router, next)
    if (
      reduced[0 /* kind */] === REDIRECTED &&
      router._tx === tx &&
      router._committed === base
    ) {
      await followRedirect(router, tx, reduced)
    }
    return
  }
  await projectLane(router, reduced, tx[0 /* controller */].signal)
  if (router._tx !== tx || router._committed !== base) {
    transferMatchResources(router, next)
    return
  }
  for (const match of next as Array<WorkMatch>) {
    const cached = router._cache.get(match.id) as WorkMatch | undefined
    if (cached?._flight && cached._flight === match._flight) {
      router._cache.delete(match.id)
      releaseFlight(router, cached)
    }
  }
  publishMatches(router, next)
  transferMatchResources(router, base, next)
}

async function runClientTransaction(
  router: CoordinatorRouter,
  tx: LoadTransaction,
  forceStaleReload: boolean,
  onReady?: () => void,
  sync?: boolean,
  resolvedPrefix?: number,
): Promise<void> {
  const result = await executeClientLane(
    router,
    tx[2 /* location */],
    tx[3 /* matches */],
    [
      tx[0 /* controller */],
      tx[1 /* redirects */],
      router._committed,
      undefined,
      sync,
      forceStaleReload,
      resolvedPrefix,
      onReady,
    ],
  )

  if (isControl(result)) {
    const follow = result[0 /* kind */] === REDIRECTED && router._tx === tx
    if (!follow || result[1 /* redirect */].options.reloadDocument) {
      finishPending(router, tx)
    }
    transferMatchResources(router, tx[3 /* matches */])
    tx[3 /* matches */] = []
    if (!follow) {
      return
    }
    if (router._tx !== tx) {
      finishPending(router, tx)
      return
    }
    if (process.env.NODE_ENV !== 'production' && tx[6 /* refresh */]) {
      router._refreshNextLoad = true
    }
    await followRedirect(router, tx, result)
    return
  }
  const matches = result[1 /* matches */]
  if (router._tx === tx) {
    // Only an acknowledged fallback owns a minimum. Recheck at the commit
    // boundary because native view transitions can defer their update callback.
    await awaitPendingMinimum(router, tx)
  }
  if (router._tx !== tx) {
    finishPending(router, tx)
    transferMatchResources(router, matches)
    discardBackground(router, result)
    return
  }
  const toLocation = tx[2 /* location */]
  const changeInfo = getLocationChangeInfo(
    toLocation,
    router.stores.resolvedLocation.get(),
  )
  const background = result[2 /* background */]
  await router.startViewTransition(async () => {
    if (router._tx === tx) {
      await awaitPendingMinimum(router, tx)
    }
    if (router._tx !== tx) {
      finishPending(router, tx)
      transferMatchResources(router, matches)
      discardBackground(router, result)
      return
    }
    const commit = () => {
      finishPending(router, tx)
      commitMatches(router, tx, matches, resolvedPrefix)
      if (router._tx !== tx) {
        return
      }
      router.emit({ type: 'onLoad', ...changeInfo })
      if (router._tx === tx) {
        router.emit({ type: 'onBeforeRouteMount', ...changeInfo })
      }
    }
    const rendered = await router.startTransition(commit, matches)
    if (process.env.NODE_ENV !== 'production' && tx[6 /* refresh */]) {
      tx[6 /* refresh */] = undefined
    }
    if (router._tx !== tx) {
      discardBackground(router, result)
      return
    }
    if (background?.length) {
      // Publish background matches only after the foreground acknowledgement.
      // Otherwise fast work can replace the acknowledged generation
      // before the framework commits it and strand the navigation.
      runBackground(
        router,
        tx,
        matches,
        background,
        result[3 /* backgroundSettlement */]!,
      ).catch(console.error)
    }
    router.batch(() => {
      router.stores.resolvedLocation.set(toLocation)
      router.stores.status.set('idle')
      if (router._tx === tx) {
        router.emit({ type: 'onResolved', ...changeInfo })
      }
      if (rendered && router._tx === tx) {
        router.emit({ type: 'onRendered', ...changeInfo })
      }
    })
    if (router._tx !== tx) {
      return
    }
    router._commitPromise?.resolve()
    router._commitPromise = undefined
  })
}

export async function loadClientRoute(
  router: CoordinatorRouter,
  opts?: { sync?: boolean },
): Promise<void> {
  let rematerialize = false
  if (process.env.NODE_ENV !== 'production') {
    rematerialize = !!router._refreshNextLoad || !!router._tx?.[6 /* refresh */]
  }
  const previousOwner = router._tx
  const resolvedLocation = router.stores.resolvedLocation.get()
  const previousLocation = resolvedLocation ?? router.stores.location.get()
  const location = router.latestLocation
  const pendingLocation = router._pendingLocation as
    | (ParsedLocation & { _redirects?: number })
    | undefined
  const redirects =
    pendingLocation?.href === location.href
      ? (pendingLocation._redirects ?? 0)
      : 0
  const handoff = router._handoff
  const hydrationController = rematerialize
    ? undefined
    : handoff?.[0 /* claim */]()
  const preflight = new AbortController()
  const previousPreflight = router._preflight
  router._preflight = preflight
  if (!rematerialize && !hydrationController) {
    handoff?.[1 /* finish */]()
  }
  previousPreflight?.abort()
  // The preflight controller is not exposed to route hooks. Every replacement
  // aborts its predecessor, so a live signal is the sole authority here.
  if (!preflight.signal.aborted) {
    const changeInfo = getLocationChangeInfo(location, resolvedLocation)
    router.emit({ type: 'onBeforeNavigate', ...changeInfo })
    if (!preflight.signal.aborted) {
      router.emit({ type: 'onBeforeLoad', ...changeInfo })
    }
  }
  if (preflight.signal.aborted) {
    await awaitCurrent(router, previousOwner)
    return
  }
  const sameHref = previousLocation.href === location.href
  let controller = preflight
  const matches =
    process.env.NODE_ENV !== 'production' && rematerialize
      ? router.matchRoutes(location, {
          _controller: preflight,
          _rematerialize: true,
        })
      : router.matchRoutes(location, { _controller: preflight })
  acquireMatchResources(matches)
  const resolvedPrefix = hydrationController
    ? handoff![1 /* finish */](matches)
    : undefined
  if (resolvedPrefix) {
    controller = hydrationController!
  } else {
    hydrationController?.abort()
  }
  if (preflight.signal.aborted) {
    transferMatchResources(router, matches)
    await awaitCurrent(router, previousOwner)
    return
  }
  router._preflight = undefined

  let settle: ((value: void | PromiseLike<void>) => void) | undefined
  const run = () =>
    runClientTransaction(
      router,
      tx,
      sameHref,
      () => offerPending(router, tx),
      opts?.sync,
      resolvedPrefix,
    )
  const done = opts?.sync
    ? new Promise<void>((resolve) => (settle = resolve))
    : Promise.resolve().then(run)
  const tx: LoadTransaction = [
    controller,
    redirects,
    location,
    matches,
    Date.now(),
    done.then(() => awaitCurrent(router, tx)),
  ]
  if (process.env.NODE_ENV !== 'production' && rematerialize) {
    tx[6 /* refresh */] = [handoff]
    router._refreshNextLoad = undefined
  }
  router._tx = tx
  if (previousOwner) {
    for (const match of router.stores.matches.get() as Array<WorkMatch>) {
      if (router._tx !== tx) {
        break
      }
      if (match.isFetching) {
        setFetching(router, match, false)
      }
    }
    previousOwner[0 /* controller */].abort()
    transferMatchResources(
      router,
      previousOwner[3 /* matches */],
      tx[3 /* matches */],
      true,
    )
  }
  if (router._tx !== tx) {
    transferMatchResources(router, tx[3 /* matches */])
    tx[3 /* matches */] = []
    settle?.()
    await awaitCurrent(router, tx)
    return
  }
  router.batch(() => {
    router.stores.status.set('pending')
    router.stores.location.set(location)
  })
  // An unresolved cold root has no UI to retain. Provisional not-found waits
  // for lazy routes to place the final boundary.
  if (
    resolvedPrefix ||
    (!router._committed.length &&
      matches[0]?.status !== 'success' &&
      !matches.some((match) => match._notFound))
  ) {
    offerPending(router, tx)
  }
  // Let explicit synchronous loads publish ready pending work before paint.
  settle?.(run())
  await tx[5 /* done */]
}

export async function refreshClientRoute(
  router: CoordinatorRouter,
): Promise<void> {
  const pending = router._tx
  if (
    pending &&
    !pending[6 /* refresh */] &&
    router.stores.status.get() === 'pending'
  ) {
    await pending[5 /* done */]
    if (router._tx !== pending) {
      await awaitCurrent(router, pending)
    }
  }
  // Existing owners remain presented but cannot donate stale work.
  router._flights?.clear()
  router.clearCache()
  router._refreshNextLoad = true
  await loadClientRoute(router, { sync: true })
}

export async function preloadClientRoute<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption,
  TDefaultStructuralSharingOption extends boolean,
  TRouterHistory extends RouterHistory,
  TDehydrated extends Record<string, any> = Record<string, any>,
  TFrom extends RoutePaths<TRouteTree> | string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
  TMaskTo extends string = '',
>(
  router: RouterCore<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TRouterHistory,
    TDehydrated
  >,
  opts: NavigateOptions<
    RouterCore<
      TRouteTree,
      TTrailingSlashOption,
      TDefaultStructuralSharingOption,
      TRouterHistory,
      TDehydrated
    >,
    TFrom,
    TTo,
    TMaskFrom,
    TMaskTo
  >,
): Promise<Array<AnyRouteMatch> | undefined> {
  if (
    process.env.NODE_ENV !== 'production' &&
    ((router as CoordinatorRouter)._refreshNextLoad ||
      router._tx?.[6 /* refresh */])
  ) {
    return
  }
  let location = router.buildLocation(
    opts as Parameters<typeof router.buildLocation>[0],
  )
  for (let redirects = 0; ; redirects++) {
    const base = router._committed
    const controller = new AbortController()
    let matches: Array<AnyRouteMatch> | undefined
    let active: boolean | Map<AbortController, Array<AnyRouteMatch>> | undefined
    let result: LaneResult
    try {
      try {
        matches = router.matchRoutes(location, {
          _controller: controller,
        })
        acquireMatchResources(matches)
        active = (router._preloads ??= new Map()).set(controller, matches)
        result = await executeClientLane(router, location, matches, [
          controller,
          redirects,
          base,
          true,
        ])
      } finally {
        if (active) {
          active = (
            active as Map<AbortController, Array<AnyRouteMatch>>
          ).delete(controller)
          transferMatchResources(router, matches!)
        }
        controller.abort()
      }
      if (!isControl(result)) {
        return result[1 /* matches */]
      }
      // Only a materialized redirect has a third tuple item.
      if (
        !active ||
        result.length < 3 ||
        (process.env.NODE_ENV !== 'production' &&
          ((router as CoordinatorRouter)._refreshNextLoad ||
            router._tx?.[6 /* refresh */]))
      ) {
        return
      }
      location = result[2 /* location */]!
    } catch (cause) {
      if (!isNotFound(cause)) {
        console.error(cause)
      }
      return
    }
  }
}

// --- SSR hydration (client entry via @tanstack/router-core/ssr/client) ---

declare global {
  interface Window {
    [GLOBAL_TSR]?: TsrSsrGlobal
    [GLOBAL_SEROVAL]?: any
  }
}

export async function hydrate(router: AnyRouter): Promise<void> {
  if (process.env.NODE_ENV !== 'production' && !window.$_TSR) {
    throw new Error(
      'Invariant failed: Expected to find bootstrap data on window.$_TSR, but we did not. Please file an issue!',
    )
  }
  const tsr = window.$_TSR!

  const adapters = router.options.serializationAdapters
  if (adapters?.length) {
    tsr.t = new Map(
      adapters.map((adapter) => [adapter.key, adapter.fromSerializable]),
    )
    tsr.buffer.forEach((script) => script())
  }
  tsr.initialized = true

  const dehydratedRouter = tsr.router
  if (process.env.NODE_ENV !== 'production' && !dehydratedRouter) {
    throw new Error(
      'Invariant failed: Expected to find a dehydrated data on window.$_TSR.router, but we did not. Please file an issue!',
    )
  }
  router.ssr = { manifest: dehydratedRouter!.manifest }
  router.options.ssr = {
    nonce: (
      document.querySelector('meta[property="csp-nonce"]') as
        | HTMLMetaElement
        | undefined
    )?.content,
  }

  const dehydratedMatches = dehydratedRouter!.matches

  const controller = new AbortController()
  const previousPreflight = router._preflight
  router._preflight = controller
  previousPreflight?.abort()
  // Only a new slot owner supersedes hydration.
  const isCurrent = () => router._preflight === controller

  let location!: AnyRouter['latestLocation']
  let candidates!: Array<AnyRouteMatch>
  let handoffHistoryHref!: string
  let handoffHistoryState: unknown
  try {
    await waitFor(
      router.options.hydrate?.(dehydratedRouter!.dehydratedData),
      controller.signal,
    )
    if (!isCurrent()) {
      return
    }
    // Hydration trusts transported context and beforeLoad. The raw history
    // entry owns the handoff; route structure is verified after rematching.
    const historyLocation = router.history.location
    handoffHistoryHref = historyLocation.href
    handoffHistoryState = historyLocation.state
    router.updateLatestLocation()
    location = router.latestLocation
    router.stores.location.set(location)
    candidates = router.matchRoutes(location, {
      _controller: controller,
    })
  } catch (cause) {
    if (isCurrent()) {
      router._preflight = undefined
    }
    controller.abort(cause)
    if (cause !== controller.signal) {
      throw cause
    }
  }
  if (!isCurrent()) {
    return
  }
  const committed: Array<AnyRouteMatch> = []
  let pendingBoundary: number | undefined
  let verifiedAssetEnd = 0
  const retryFrom = (index: number) => {
    // The failing route's identity is still verified, but no descendant is.
    verifiedAssetEnd = Math.min(verifiedAssetEnd, index + 1)
    const removed = committed.splice(index)
    for (const match of removed) {
      if (
        getRoute(router, match).options.loader &&
        (match.status === 'success' ||
          (!match.invalid && 'loaderData' in match))
      ) {
        cacheLoaderMatch(
          router,
          // Phase jump: dehydrated server data is already past the loader
          // phase — the guard above verified a settled success (or transported
          // loaderData), so this clone is settled without a client settleInto.
          {
            ...match,
            status: 'success',
            error: undefined,
            preload: true,
          } as SettledMatch,
          router._cache.get(match.id),
        )
      }
    }
    transferMatchResources(router, removed)
  }

  // A longer server lane is valid only when the local match already caps the
  // branch at a global not-found boundary. Otherwise no transported work is
  // safe to attach to the shorter client lane.
  const shared =
    dehydratedMatches.length > candidates.length
      ? candidates.findIndex((match) => match._notFound) + 1
      : dehydratedMatches.length
  let isTerminal = false
  for (let index = 0; index < shared; index++) {
    const candidate = candidates[index]!
    const dehydrated = dehydratedMatches[index]!
    if (dehydrated.i !== dehydrateSsrMatchId(candidate.id)) {
      pendingBoundary ??= index
      break
    }
    verifiedAssetEnd = index + 1
    const route = getRoute(router, candidate)
    if (
      'l' in dehydrated ||
      (dehydrated.s === 'success' &&
        dehydrated.e === undefined &&
        route.options.loader)
    ) {
      candidate.loaderData = dehydrated.l
    }
    candidate.status = dehydrated.s
    candidate.ssr = dehydrated.ssr
    route.options.ssr = candidate.ssr
    candidate.updatedAt = dehydrated.u
    candidate.error = dehydrated.e
    candidate._notFound ||= dehydrated.g
    const terminal =
      candidate.status === 'error' ||
      candidate.status === 'notFound' ||
      candidate._notFound
    if (terminal) {
      isTerminal = true
      committed.push(candidate)
      if (candidate.ssr === false || candidate.ssr === 'data-only') {
        pendingBoundary ??= index
      }
      break
    }
    if (candidate.status === 'pending') {
      pendingBoundary ??= index
      break
    }

    committed.push(candidate)
    if (candidate.ssr === 'data-only') {
      pendingBoundary ??= index
    }
  }
  if (
    !isTerminal &&
    committed.length === shared &&
    shared < candidates.length
  ) {
    pendingBoundary = shared
  }

  // Hooks observe structural membership. Execution remains limited to
  // `committed`, the accepted server prefix.
  const chunks = committed.map(async (match) => {
    try {
      const route = getRoute(router, match)
      await (match._notFound
        ? Promise.all([
            loadRouteChunk(route),
            loadRouteChunk(route, 'notFoundComponent'),
          ])
        : loadRouteChunk(
            route,
            match.status === 'error'
              ? 'errorComponent'
              : match.status === 'notFound'
                ? 'notFoundComponent'
                : undefined,
          ))
      return true
    } catch {
      return false
    }
  })
  let chunkFailure = 0
  try {
    while (
      chunkFailure < chunks.length &&
      (await waitFor(chunks[chunkFailure]!, controller.signal))
    ) {
      chunkFailure++
    }
  } catch {
    return
  }
  if (!isCurrent()) {
    return
  }
  if (chunkFailure < committed.length) {
    retryFrom(chunkFailure)
  }

  // The first pending match is already visible, so prepare its route context
  // without granting its beforeLoad or loader any hydration authority.
  const contextEnd = Math.max(
    pendingBoundary === committed.length
      ? committed.length + 1
      : committed.length,
    // `chunks.length` keeps the pre-retry committed length, so a smaller
    // `chunkFailure` is the exclusive bound of the verified context prefix.
    chunkFailure < chunks.length ? chunkFailure : verifiedAssetEnd,
  )
  for (let index = 0; index < contextEnd; index++) {
    const match = candidates[index]!
    const route = getRoute(router, match)
    const parentContext =
      candidates[index - 1]?.context ?? router.options.context ?? {}
    let routeContext
    if (route.options.context) {
      try {
        routeContext = match._ctx =
          route.options.context({
            deps: match.loaderDeps,
            params: match.params,
            context: parentContext,
            location,
            navigate: (opts: any) =>
              router.navigate({
                ...opts,
                _fromLocation: location,
              }),
            buildLocation: router.buildLocation,
            cause: match.cause,
            abortController: controller,
            preload: false,
            matches: candidates,
            routeId: route.id,
          }) || {}
      } catch {
        if (!isCurrent()) {
          return
        }
        if (
          match.status !== 'error' &&
          match.status !== 'notFound' &&
          !match._notFound
        ) {
          // Never present transported success without reconstructed context.
          pendingBoundary = Math.min(pendingBoundary ?? index, index)
          retryFrom(index)
          break
        }
      }
      if (!isCurrent()) {
        return
      }
    }
    match.context = {
      ...parentContext,
      ...routeContext,
      ...(committed[index] && dehydratedMatches[index]!.b),
    }
  }

  await projectLane(
    router,
    [location, candidates] as any,
    controller.signal,
    0,
    verifiedAssetEnd,
  )
  if (!isCurrent()) {
    return
  }
  const needsClientLoad =
    pendingBoundary !== undefined || committed.length < shared
  const committedMatches =
    isTerminal && committed.length === shared ? candidates : committed
  let presented = needsClientLoad ? candidates : committedMatches
  let dataOnlyAssetEnd: number | undefined
  if (needsClientLoad && pendingBoundary !== undefined) {
    const boundary = presented[pendingBoundary]!
    // A verified descendant proves this data-only boundary was nonterminal.
    dataOnlyAssetEnd =
      boundary.ssr === 'data-only' && verifiedAssetEnd > pendingBoundary + 1
        ? verifiedAssetEnd
        : undefined
    presented = presented.slice()
    presented[pendingBoundary] = {
      ...boundary,
      status: 'pending',
      ssr: boundary.ssr === 'data-only' ? 'data-only' : false,
      _assetEnd: dataOnlyAssetEnd,
    }
  }

  const claim = () => {
    const historyLocation = router.history.location
    return needsClientLoad &&
      !router._tx &&
      historyLocation.href === handoffHistoryHref &&
      historyLocation.state === handoffHistoryState &&
      router._committed === committedMatches &&
      committedMatches.length &&
      !controller.signal.aborted
      ? controller
      : undefined
  }
  const handoff: NonNullable<AnyRouter['_handoff']> = [
    claim,
    (matches) => {
      if (router._handoff !== handoff) {
        return
      }
      // `finish` is single-use. Consume the slot before validating or moving
      // resources so reentrant work cannot claim the same handoff.
      router._handoff = undefined
      const prefix = committedMatches.length
      if (
        !matches ||
        !claim() ||
        committedMatches.some((match, index) => match.id !== matches[index]?.id)
      ) {
        controller.abort()
        return
      }
      let handoffAssetEnd = dataOnlyAssetEnd
      if (handoffAssetEnd !== undefined) {
        for (let index = prefix; index < handoffAssetEnd; index++) {
          if (candidates[index]?.id !== matches[index]?.id) {
            handoffAssetEnd = index > pendingBoundary! + 1 ? index : undefined
            break
          }
        }
      }
      const clones = committedMatches.map((match) => ({ ...match }))
      if (handoffAssetEnd !== undefined) {
        clones[pendingBoundary!]!._assetEnd = handoffAssetEnd
      }
      transferMatchResources(router, matches.splice(0, prefix, ...clones))
      for (let index = prefix; index < matches.length; index++) {
        const match = matches[index]!
        const hydrated = candidates[index]
        if (hydrated?.id === match.id && hydrated._ctx) {
          match._ctx = hydrated._ctx
        }
        match.abortController = controller
      }
      return prefix
    },
  ]
  router._committed = committedMatches
  router._lifecycleEnd = lifecycleEnd(committedMatches)
  router._handoff = handoff
  router._preflight = undefined
  router.batch(() => {
    router.stores.setMatches(presented)
    router.stores.status.set('idle')
    if (!needsClientLoad) {
      router.stores.resolvedLocation.set(router.stores.location.get())
    }
  })
}
