// Keep this filename free of a secondary extension so declaration generation
// can rewrite relative imports for both ESM and CJS.
import { isNotFound } from './not-found'
import { isRedirect, redirect } from './redirect'
import { rootRouteId } from './root'
import { loadRouteChunk } from './load-client'
import { waitForReason } from './await-signal'
import {
  getLocationChangeInfo,
  lifecycleEnd,
  runRouteLifecycle,
} from './router'
import type { ParsedLocation } from './location'
import type { AnyRouteMatch } from './Matches'
import type { NotFoundError } from './not-found'
import type {
  AnyRoute,
  BeforeLoadContextOptions,
  LoaderFnContext,
  RouteContextOptions,
  SsrContextOptions,
} from './route'
import type { AnyRedirect } from './redirect'
import type { AnyRouter, SSROption } from './router'

declare const serverLanePhase: unique symbol

type ServerLane<TPhase extends 'matched' | 'contextualized' | 'reduced'> = {
  readonly [serverLanePhase]: TPhase
  location: ParsedLocation
  matches: Array<AnyRouteMatch>
}

type MatchedLane = ServerLane<'matched'>

type IndexedOutcome = [index: number, outcome: LoaderOutcome, boundary?: number]

type ContextualizedLane = ServerLane<'contextualized'> & {
  end: number
  failure?: IndexedOutcome
}

type ReducedLane = ServerLane<'reduced'>

const SUCCESS = 0
const ERROR = 1
const NOT_FOUND = 2
const REDIRECTED = 3
const SKIPPED = 4

const MATCH_SETTLED_ABORT_REASON = Object.freeze({
  name: 'AbortError',
  message: 'TanStack Router aborted this server match because it settled.',
})

const REDIRECT_ABORT_REASON = Object.freeze({
  name: 'AbortError',
  message: 'TanStack Router aborted this server match because of a redirect.',
})

type LoaderOutcome =
  | [typeof SUCCESS, data: unknown]
  | [typeof ERROR, error: unknown]
  | [typeof NOT_FOUND, error: NotFoundError]
  | [typeof REDIRECTED, redirect: AnyRedirect]
  | [typeof SKIPPED]

type LoaderTask = {
  index: number
  outcome: Promise<LoaderOutcome>
  match: Promise<AnyRouteMatch>
}

export type ServerLoadResult =
  | {
      type: 'render'
      status: 200 | 404 | 500
      matches: Array<AnyRouteMatch>
    }
  | { type: 'redirect'; redirect: AnyRedirect }

function getRoute(router: AnyRouter, match: AnyRouteMatch): AnyRoute {
  return router.routesById[match.routeId]
}

function normalize(value: unknown, rejected: boolean): LoaderOutcome {
  if (isRedirect(value)) {
    return [REDIRECTED, value]
  }
  if (isNotFound(value)) {
    return [NOT_FOUND, value]
  }
  if (rejected && typeof (value as any)?.then === 'function') {
    value = new Error('A Promise was thrown', { cause: value })
  }
  return rejected ? [ERROR, value] : [SUCCESS, value]
}

function normalizeError(
  router: AnyRouter,
  lane: { location: ParsedLocation },
  route: AnyRoute,
  cause: unknown,
  signal?: AbortSignal,
  notify = true,
): LoaderOutcome {
  signal?.throwIfAborted()
  let outcome = normalize(cause, true)
  if (outcome[0] !== ERROR) {
    return materializeRedirect(router, lane, route, outcome, signal, notify)
  }
  try {
    route.options.onError?.(outcome[1])
  } catch (onErrorCause) {
    outcome = normalize(onErrorCause, true)
  }
  signal?.throwIfAborted()
  return materializeRedirect(router, lane, route, outcome, signal, notify)
}

function materializeRedirect(
  router: AnyRouter,
  lane: { location: ParsedLocation },
  route: AnyRoute,
  outcome: LoaderOutcome,
  signal?: AbortSignal,
  notify = true,
): LoaderOutcome {
  if (outcome[0] !== REDIRECTED) {
    return outcome
  }
  signal?.throwIfAborted()
  try {
    outcome[1].options._fromLocation = lane.location
    router.resolveRedirect(outcome[1])
    signal?.throwIfAborted()
    return outcome
  } catch (cause) {
    signal?.throwIfAborted()
    return notify
      ? normalizeError(router, lane, route, cause, signal, false)
      : [ERROR, cause]
  }
}

function maybe<TValue>(
  value: TValue,
  cause: unknown,
): { status: 'success'; value: TValue } | { status: 'error'; error: unknown } {
  if (cause !== undefined) {
    return { status: 'error', error: cause }
  }
  return { status: 'success', value }
}

function navigateFrom(router: AnyRouter, location: ParsedLocation) {
  return (options: any) =>
    router.navigate({
      ...options,
      _fromLocation: location,
    })
}

function waitFor<T>(value: Promise<T>, signal?: AbortSignal): Promise<T> {
  return signal ? waitForReason(value, signal) : value
}

function resolveSsr(
  router: AnyRouter,
  lane: MatchedLane,
  index: number,
): SSROption | Promise<SSROption> {
  const match = lane.matches[index]!
  const route = getRoute(router, match)
  const parentSsr = lane.matches[index - 1]?.ssr

  if (router.isShell()) {
    return route.id === rootRouteId
  }
  if (parentSsr === false) {
    return false
  }

  const inherit = (value: SSROption): SSROption => {
    return value === true && parentSsr === 'data-only' ? 'data-only' : value
  }
  const defaultSsr = router.options.defaultSsr ?? true
  const inheritedDefault = inherit(defaultSsr)
  // A functional override can fail. Establish the inherited policy first so
  // the selected error boundary retains the route's actual renderability.
  match.ssr = inheritedDefault
  const option = route.options.ssr
  if (option === undefined) {
    return inheritedDefault
  }
  if (typeof option !== 'function') {
    return inherit(option)
  }

  const context: SsrContextOptions<any, any, any> = {
    search: maybe(match.search, match.searchError),
    params: maybe(match.params, match.paramsError),
    location: lane.location,
    matches: lane.matches.map((candidate) => ({
      index: candidate.index,
      pathname: candidate.pathname,
      fullPath: candidate.fullPath,
      staticData: candidate.staticData,
      id: candidate.id,
      routeId: candidate.routeId,
      search: maybe(candidate.search, candidate.searchError),
      params: maybe(candidate.params, candidate.paramsError),
      ssr: candidate.ssr,
    })),
  }
  try {
    return Promise.resolve(option(context)).then((value) =>
      inherit(value ?? defaultSsr),
    )
  } catch (cause) {
    // Functional failures keep their asynchronous cancellation checkpoint.
    return Promise.reject(cause)
  }
}

function stampNotFound(
  match: AnyRouteMatch,
  outcome: LoaderOutcome,
): LoaderOutcome {
  if (outcome[0] === NOT_FOUND && !outcome[1].routeId) {
    outcome[1].routeId = match.routeId
  }
  return outcome
}

async function contextualize(
  router: AnyRouter,
  lane: MatchedLane,
  signal?: AbortSignal,
): Promise<ContextualizedLane> {
  const globalBoundary = lane.matches.findIndex((match) => match._notFound)
  let end = globalBoundary < 0 ? lane.matches.length : globalBoundary + 1
  let failure: IndexedOutcome | undefined
  let parentContext: Record<string, unknown> = {
    ...(router.options.context ?? {}),
  }

  for (let index = 0; index < end; index++) {
    const match = lane.matches[index]!
    const route = getRoute(router, match)
    try {
      const ssr = resolveSsr(router, lane, index)
      // Functional policies are assimilated into a native Promise above.
      match.ssr = ssr instanceof Promise ? await ssr : ssr
    } catch (cause) {
      signal?.throwIfAborted()
      failure = [
        index,
        stampNotFound(
          match,
          normalizeError(router, lane, route, cause, signal),
        ),
      ]
      end = index
    }
    signal?.throwIfAborted()
    if (failure?.[1][0] === REDIRECTED) {
      break
    }

    match.__beforeLoadContext = undefined
    let context = parentContext
    try {
      let routeContext
      if (route.options.context) {
        const routeContextOptions: RouteContextOptions<
          any,
          any,
          any,
          any,
          any
        > = {
          deps: match.loaderDeps,
          params: match.params,
          context: parentContext,
          location: lane.location,
          navigate: navigateFrom(router, lane.location),
          buildLocation: router.buildLocation,
          cause: match.cause,
          abortController: match.abortController,
          preload: false,
          matches: lane.matches,
          routeId: route.id,
        }
        routeContext = route.options.context(routeContextOptions) ?? undefined
      }
      context = {
        ...parentContext,
        ...routeContext,
      }
      match.context = context
    } catch (cause) {
      signal?.throwIfAborted()
      if (!failure) {
        failure = [
          index,
          stampNotFound(
            match,
            normalizeError(router, lane, route, cause, signal),
          ),
        ]
      }
      end = index
      break
    }
    signal?.throwIfAborted()
    if (failure) {
      break
    }
    const validationError = match.paramsError ?? match.searchError
    if (validationError !== undefined) {
      failure = [
        index,
        stampNotFound(
          match,
          normalizeError(router, lane, route, validationError, signal),
        ),
      ]
      end = index
      break
    }
    signal?.throwIfAborted()

    if (match.ssr === false || !route.options.beforeLoad) {
      parentContext = context
      continue
    }

    const abortController = match.abortController
    const options: BeforeLoadContextOptions<
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any
    > = {
      search: match.search,
      abortController,
      params: match.params,
      preload: false,
      context,
      location: lane.location,
      navigate: navigateFrom(router, lane.location),
      buildLocation: router.buildLocation,
      cause: match.cause,
      matches: lane.matches,
      routeId: route.id,
      ...router.options.additionalContext,
    }

    try {
      const beforeLoadContext = await route.options.beforeLoad(options)
      signal?.throwIfAborted()
      const outcome = stampNotFound(
        match,
        materializeRedirect(
          router,
          lane,
          route,
          normalize(beforeLoadContext, false),
          signal,
        ),
      )
      if (outcome[0] !== SUCCESS) {
        failure = [index, outcome]
        end = index
        break
      }
      match.__beforeLoadContext = beforeLoadContext
      match.context = {
        ...context,
        ...beforeLoadContext,
      }
      parentContext = match.context
    } catch (cause) {
      signal?.throwIfAborted()
      failure = [
        index,
        stampNotFound(
          match,
          normalizeError(router, lane, route, cause, signal),
        ),
      ]
      end = index
      break
    }
  }

  return {
    location: lane.location,
    matches: lane.matches,
    end,
    failure,
  } as ContextualizedLane
}

function getLoaderContext(
  router: AnyRouter,
  lane: ContextualizedLane,
  match: AnyRouteMatch,
  route: AnyRoute,
  index: number,
  tasks: Array<LoaderTask>,
): LoaderFnContext {
  return {
    params: match.params,
    deps: match.loaderDeps,
    preload: false,
    parentMatchPromise: tasks[index - 1]?.match,
    abortController: match.abortController,
    context: match.context,
    location: lane.location,
    navigate: navigateFrom(router, lane.location),
    cause: match.cause,
    route,
    ...router.options.additionalContext,
  }
}

function createLoaderTask(
  router: AnyRouter,
  lane: ContextualizedLane,
  index: number,
  tasks: Array<LoaderTask>,
  signal?: AbortSignal,
): LoaderTask {
  const match = lane.matches[index]!
  const route = getRoute(router, match)
  let outcome: Promise<LoaderOutcome>

  if (match.ssr === false) {
    outcome = Promise.resolve<LoaderOutcome>([SKIPPED])
  } else {
    const routeLoader = route.options.loader
    const loader =
      typeof routeLoader === 'function' ? routeLoader : routeLoader?.handler
    if (!loader) {
      outcome = Promise.resolve<LoaderOutcome>([SUCCESS, undefined])
    } else {
      outcome = Promise.resolve()
        .then(() =>
          loader(getLoaderContext(router, lane, match, route, index, tasks)),
        )
        .then(
          (result) => normalize(result, false),
          (cause) => normalize(cause, true),
        )
        .then((result): LoaderOutcome => {
          if (
            signal?.aborted ||
            match.abortController.signal.reason === REDIRECT_ABORT_REASON
          ) {
            return [SKIPPED]
          }
          if (result[0] === ERROR) {
            result = normalizeError(router, lane, route, result[1], signal)
          } else {
            result = materializeRedirect(router, lane, route, result, signal)
          }
          return stampNotFound(match, result)
        })
    }
  }

  const parentMatch = outcome.then((result) => {
    const snapshot = { ...match }
    if (result[0] === SUCCESS) {
      snapshot.loaderData = result[1]
      snapshot.status = 'success'
      snapshot.error = undefined
      snapshot.invalid = false
      snapshot.isFetching = false
    } else if (result[0] === ERROR) {
      snapshot.status = 'error'
      snapshot.error = result[1]
    } else if (result[0] === NOT_FOUND) {
      snapshot.status = 'notFound'
      snapshot.error = result[1]
    }
    return snapshot
  })

  return { index, outcome, match: parentMatch }
}

async function getNotFoundBoundary(
  router: AnyRouter,
  matches: Array<AnyRouteMatch>,
  indexed: IndexedOutcome | undefined,
  signal?: AbortSignal,
  fallback = 0,
): Promise<number> {
  const cause = indexed?.[1][1] as NotFoundError | undefined
  let index = cause?.routeId
    ? matches.findIndex((match) => match.routeId === cause.routeId)
    : (indexed?.[0] ?? matches.length - 1)
  if (index < 0) {
    index = 0
  }
  for (let candidate = index; candidate >= 0; candidate--) {
    const route = getRoute(router, matches[candidate]!)
    try {
      const loading = loadRouteChunk(route, false)
      if (loading) {
        await loading
      }
    } catch {
      signal?.throwIfAborted()
    }
    signal?.throwIfAborted()
    if (route.options.notFoundComponent) {
      return candidate
    }
  }
  return cause?.routeId ? index : fallback
}

function abortMatches(
  matches: Array<AnyRouteMatch>,
  start = 0,
  reason: unknown = MATCH_SETTLED_ABORT_REASON,
): void {
  for (let index = start; index < matches.length; index++) {
    matches[index]!.abortController.abort(reason)
  }
}

async function applyFailure(
  router: AnyRouter,
  lane: ContextualizedLane,
  indexed: IndexedOutcome | undefined,
  signal?: AbortSignal,
): Promise<{ status: 200 | 404 | 500; boundary?: number; kind?: number }> {
  if (!indexed) {
    const boundary = lane.matches.findIndex((match) => match._notFound)
    if (boundary >= 0) {
      abortMatches(lane.matches, boundary + 1)
      return { status: 404, boundary, kind: NOT_FOUND }
    }
    return { status: 200 }
  }

  const [index, outcome] = indexed
  if (outcome[0] === ERROR) {
    const match = lane.matches[index]!
    match._notFound = undefined
    match.status = 'error'
    match.error = outcome[1]
    match.isFetching = false
    abortMatches(lane.matches, index + 1)
    return { status: 500, boundary: index, kind: ERROR }
  }

  const boundary =
    indexed[2] ??
    (await getNotFoundBoundary(router, lane.matches, indexed, signal))
  const match = lane.matches[boundary]!
  const cause = outcome[1] as NotFoundError
  cause.routeId = match.routeId
  match._notFound = undefined
  if (match.routeId === router.routeTree.id) {
    match.status = 'success'
    match._notFound = true
    match.error = cause
  } else {
    match.status = 'notFound'
    match.error = cause
  }
  match.isFetching = false
  abortMatches(lane.matches, boundary + 1)
  return { status: 404, boundary, kind: NOT_FOUND }
}

async function loadNormalChunks(
  router: AnyRouter,
  lane: ContextualizedLane,
  end: number,
  signal?: AbortSignal,
): Promise<IndexedOutcome | undefined> {
  const chunks: Array<IndexedOutcome | Promise<IndexedOutcome | undefined>> = []
  for (let index = 0; index < lane.matches.length; index++) {
    const match = lane.matches[index]!
    if (index >= end || match.ssr !== true || match.status !== 'success') {
      continue
    }
    const route = getRoute(router, match)
    try {
      const loading = loadRouteChunk(route)
      if (loading) {
        const chunk = loading.then(
          () => {
            signal?.throwIfAborted()
            return undefined
          },
          (cause) => {
            signal?.throwIfAborted()
            return [
              index,
              stampNotFound(
                match,
                normalizeError(router, lane, route, cause, signal),
              ),
            ] as IndexedOutcome
          },
        )
        // Route-order reduction can return before later chunks settle.
        void chunk.catch(() => {})
        chunks.push(chunk)
      }
    } catch (cause) {
      signal?.throwIfAborted()
      chunks.push([
        index,
        stampNotFound(
          match,
          normalizeError(router, lane, route, cause, signal),
        ),
      ])
    }
  }
  for (const chunk of chunks) {
    const indexed = Array.isArray(chunk) ? chunk : await chunk
    if (indexed) {
      return indexed
    }
  }
  return undefined
}

async function projectLane(
  router: AnyRouter,
  lane: ReducedLane,
  signal?: AbortSignal,
): Promise<void> {
  for (const match of lane.matches) {
    const routeOptions = getRoute(router, match).options
    if (routeOptions.head || routeOptions.scripts || routeOptions.headers) {
      const context = {
        ssr: router.options.ssr,
        matches: lane.matches,
        match,
        params: match.params,
        loaderData: match.loaderData,
      }
      try {
        const [head, scripts, headers] = await Promise.all([
          routeOptions.head?.(context),
          routeOptions.scripts?.(context),
          routeOptions.headers?.(context),
        ])
        signal?.throwIfAborted()
        match.meta = head?.meta
        match.links = head?.links
        match.headScripts = head?.scripts
        match.styles = head?.styles
        match.scripts = scripts
        match.headers = headers
      } catch (cause) {
        signal?.throwIfAborted()
        console.error(cause)
      }
    }
    if (match.ssr === false || match.status !== 'success' || match._notFound) {
      break
    }
  }
}

async function executeServerLane(
  router: AnyRouter,
  location: ParsedLocation,
  matchedMatches: Array<AnyRouteMatch>,
  signal?: AbortSignal,
): Promise<ServerLoadResult> {
  const matched = {
    location,
    matches: matchedMatches.map((match) => ({
      ...match,
      __beforeLoadContext: undefined,
      context: {},
      isFetching: false,
      abortController: new AbortController(),
    })),
  } as MatchedLane
  const abortLane = () =>
    abortMatches(
      matched.matches,
      0,
      signal?.reason ?? MATCH_SETTLED_ABORT_REASON,
    )
  if (signal?.aborted) {
    abortLane()
    signal.throwIfAborted()
  }
  signal?.addEventListener('abort', abortLane, { once: true })

  try {
    const plannedGlobalBoundary = matched.matches.findIndex(
      (match) => match._notFound,
    )
    if (router.options.notFoundMode !== 'root' && plannedGlobalBoundary >= 0) {
      const boundary = await getNotFoundBoundary(
        router,
        matched.matches,
        undefined,
        signal,
        plannedGlobalBoundary,
      )
      if (boundary !== plannedGlobalBoundary) {
        matched.matches[plannedGlobalBoundary]!._notFound = undefined
        matched.matches[boundary]!._notFound = true
      }
    }
    const lane = await contextualize(router, matched, signal)
    signal?.throwIfAborted()

    let loaderEnd = lane.end
    if (lane.failure?.[1][0] === REDIRECTED) {
      loaderEnd = 0
    } else if (lane.failure?.[1][0] === NOT_FOUND) {
      lane.failure[2] = await getNotFoundBoundary(
        router,
        lane.matches,
        lane.failure,
        signal,
      )
      loaderEnd = Math.min(loaderEnd, lane.failure[2] + 1)
    }

    const tasks: Array<LoaderTask> = []
    for (let index = 0; index < loaderEnd; index++) {
      const task = createLoaderTask(router, lane, index, tasks, signal)
      tasks.push(task)
    }

    let loaderFailure: IndexedOutcome | undefined
    let control = lane.failure?.[1][0] === REDIRECTED ? lane.failure : undefined
    try {
      await Promise.all(
        tasks.map((task) =>
          task.outcome.then((loadedOutcome) => {
            const match = lane.matches[task.index]!
            const outcome = loadedOutcome
            if (outcome[0] === SUCCESS) {
              match.loaderData = outcome[1]
              match.status = 'success'
              match.error = undefined
              match.invalid = false
              match.isFetching = false
              match.updatedAt = Date.now()
            } else if (outcome[0] === REDIRECTED) {
              control = [task.index, outcome]
              throw control
            } else {
              // A selective-SSR skip must stay pending for hydration. Every
              // settled server attempt is otherwise renderable unless
              // reduction selects it as the lane's terminal failure.
              if (match.ssr !== false) {
                match.status = 'success'
                match.error = undefined
                match.invalid = true
                match.isFetching = false
              }
              if (!loaderFailure && outcome[0] !== SKIPPED) {
                loaderFailure = [task.index, outcome]
              }
            }
          }),
        ),
      )
    } catch (cause) {
      if (!Array.isArray(cause)) {
        throw cause
      }
      control = cause as IndexedOutcome
    }
    signal?.throwIfAborted()

    if (control?.[1][0] === REDIRECTED) {
      abortMatches(lane.matches, 0, REDIRECT_ABORT_REASON)
      return { type: 'redirect', redirect: control[1][1] }
    }

    let failure = lane.failure ?? loaderFailure
    const plannedBoundary = lane.matches.findIndex((match) => match._notFound)
    let readinessEnd: number
    if (failure) {
      const outcomeEnd = (failure[2] ??=
        failure[1][0] === NOT_FOUND
          ? await getNotFoundBoundary(router, lane.matches, failure, signal)
          : failure[0])
      for (const task of tasks) {
        if (task.index >= outcomeEnd) {
          break
        }
        const outcome = await task.outcome
        // Presence means a loader previously succeeded, even with `undefined`.
        if (
          outcome[0] !== SUCCESS &&
          outcome[0] < REDIRECTED &&
          !('loaderData' in lane.matches[task.index]!)
        ) {
          failure = [task.index, outcome]
          failure[2] =
            outcome[0] === NOT_FOUND
              ? await getNotFoundBoundary(router, lane.matches, failure, signal)
              : task.index
          break
        }
      }
      readinessEnd = failure[2]
    } else {
      readinessEnd = plannedBoundary < 0 ? lane.matches.length : plannedBoundary
    }
    const requiredFailure = await loadNormalChunks(
      router,
      lane,
      readinessEnd,
      signal,
    )
    signal?.throwIfAborted()
    if (requiredFailure) {
      if (requiredFailure[1][0] === REDIRECTED) {
        abortMatches(lane.matches, 0, REDIRECT_ABORT_REASON)
        return { type: 'redirect', redirect: requiredFailure[1][1] }
      }
      failure = requiredFailure
    }

    const terminal = await applyFailure(router, lane, failure, signal)
    if (terminal.boundary !== undefined) {
      const match = lane.matches[terminal.boundary]!
      if (match.ssr === true) {
        const route = getRoute(router, match)
        try {
          if (terminal.kind === ERROR) {
            await loadRouteChunk(route, 'errorComponent')
          } else if (match._notFound) {
            await Promise.all([
              loadRouteChunk(route),
              loadRouteChunk(route, 'notFoundComponent'),
            ])
          } else {
            await loadRouteChunk(route, 'notFoundComponent')
          }
        } catch {}
        signal?.throwIfAborted()
      }
    }

    signal?.throwIfAborted()
    await projectLane(
      router,
      {
        location: lane.location,
        matches: lane.matches,
      } as ReducedLane,
      signal,
    )
    signal?.throwIfAborted()
    // Deferred loader work can outlive this lane, and the request signal above
    // only covers one way a response ends. SSR cleanup covers them all:
    //
    // - client disconnected                          -> abort (work may be pending)
    // - serialization or lifetime timeout             -> abort (a deferred value hung)
    // - body disposed server-side (HEAD strip,
    //   middleware replaced the response)            -> abort (never delivered)
    // - plain response / `hydrate: false`: the
    //   loader data was never dehydrated              -> abort (never consumed)
    // - stream completed: every dehydrated value
    //   already settled                               -> nothing left to abort
    //
    // `settled` is false in exactly the first four cases.
    router.serverSsr?.onCleanup((settled) => {
      if (!settled) {
        abortLane()
      }
    })
    return { type: 'render', status: terminal.status, matches: lane.matches }
  } finally {
    signal?.removeEventListener('abort', abortLane)
  }
}

type ServerLoadOptions = NonNullable<Parameters<AnyRouter['load']>[0]> & {
  _signal?: AbortSignal
}

export async function loadServerRoute(
  router: AnyRouter,
  opts?: ServerLoadOptions,
): Promise<void> {
  router.updateLatestLocation()
  const next = router.latestLocation
  const previous = router._committed
  const previousEnd = router._lifecycleEnd
  let result: ServerLoadResult
  try {
    const canonical = router.buildLocation({
      to: next.pathname,
      search: true,
      params: true,
      hash: true,
      state: true,
      _includeValidateSearch: true,
    })
    if (next.publicHref !== canonical.publicHref) {
      const href = canonical.publicHref || '/'
      throw redirect({ href })
    }

    const fromLocation = router.stores.resolvedLocation.get()
    const changeInfo = getLocationChangeInfo(next, fromLocation)
    router.emit({ type: 'onBeforeNavigate', ...changeInfo })
    router.emit({ type: 'onBeforeLoad', ...changeInfo })
    opts?._signal?.throwIfAborted()
    result = await waitFor(
      executeServerLane(router, next, router.matchRoutes(next), opts?._signal),
      opts?._signal,
    )
    opts?._signal?.throwIfAborted()
  } catch (cause) {
    opts?._signal?.throwIfAborted()
    if (!isRedirect(cause)) {
      throw cause
    }
    cause.options._fromLocation = next
    result = { type: 'redirect', redirect: router.resolveRedirect(cause) }
  }

  router._serverResult = result
  let nextEnd = 0
  router.batch(() => {
    router.stores.location.set(next)
    router.stores.status.set('idle')
    if (result.type === 'render') {
      router._committed = result.matches
      nextEnd = router._lifecycleEnd = lifecycleEnd(result.matches)
      router.stores.setMatches(result.matches)
      router.stores.resolvedLocation.set(next)
    }
  })
  if (result.type === 'render') {
    runRouteLifecycle(router, previous, result.matches, previousEnd, nextEnd)
  }
  router._commitPromise?.resolve()
  router._commitPromise = undefined
}
