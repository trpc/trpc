import { createServerHistory } from '@tanstack/history'
import {
  createCsrfMiddleware,
  createNullProtoObject,
  csrfSymbol,
  flattenMiddlewares,
  mergeHeaders,
  safeObjectMerge,
} from '@tanstack/start-client-core'
import {
  _getRenderedMatches,
  executeRewriteInput,
  isDangerousProtocol,
  isPromise,
  isRedirect,
} from '@tanstack/router-core'
import {
  attachRouterServerSsrUtils,
  bindSsrResponseToRequest,
  disposeSsrResponse,
  getNormalizedURL,
  isSsrResponse,
  normalizeSsrResponse,
  replaceSsrResponse,
  stripSsrResponseBody,
  waitForRequest,
} from '@tanstack/router-core/ssr/server'
import {
  getStartContext,
  runWithStartContext,
} from '@tanstack/start-storage-context'
import { requestHandler } from './request-response'
import { getStartManifest } from './router-manifest'
import { handleServerAction } from './server-functions-handler'
import { createEarlyHintsCollector } from './early-hints'
import {
  createCachedBaseManifestLoader,
  createFinalManifestResolver,
} from './finalManifest'

import { HEADERS } from './constants'
import { ServerFunctionSerializationAdapter } from './serializer/ServerFunctionSerializationAdapter'
import type {
  AnyFunctionMiddleware,
  AnyRequestMiddleware,
  AnyStartInstanceOptions,
  RouteMethod,
  RouteMethodHandlerFn,
  RouterEntry,
  StartEntry,
} from '@tanstack/start-client-core'
import type { RequestHandler } from './request-handler'
import type {
  AnyRoute,
  AnyRouter,
  AnySerializationAdapter,
  Register,
} from '@tanstack/router-core'
import type {
  HandlerCallback,
  HandlerCallbackResult,
  SsrResponse,
} from '@tanstack/router-core/ssr/server'
import type { FinalManifestOptions } from './finalManifest'

type TODO = any

type AnyMiddlewareServerFn =
  | AnyRequestMiddleware['options']['server']
  | AnyFunctionMiddleware['options']['server']

export interface CreateStartHandlerOptions extends FinalManifestOptions {
  handler: HandlerCallback<AnyRouter>
}

function getStartResponseHeaders(opts: { router: AnyRouter }) {
  const headers = mergeHeaders(
    {
      'Content-Type': 'text/html; charset=utf-8',
    },
    ..._getRenderedMatches(opts.router.stores.matches.get()).map((match) => {
      return match.headers
    }),
  )
  return headers
}

interface PluginAdaptersEntry {
  hasPluginAdapters: boolean
  pluginSerializationAdapters: Array<AnySerializationAdapter>
}

interface Entries {
  startEntry: StartEntry
  routerEntry: RouterEntry
  pluginAdapters: PluginAdaptersEntry
}

// Cached entries - promises stored immediately to prevent concurrent imports
// that can cause race conditions during module initialization
let entriesPromise: Promise<Entries> | undefined
let hasWarnedMissingCsrfMiddleware = false
const defaultCsrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})
const getCachedBaseManifest = createCachedBaseManifestLoader(() =>
  getStartManifest(),
)
const getProdBaseManifest: typeof getStartManifest = () =>
  getCachedBaseManifest()
const getBaseManifest =
  process.env.TSS_DEV_SERVER === 'true' ? getStartManifest : getProdBaseManifest
const createEarlyHintsForRequest: typeof createEarlyHintsCollector =
  process.env.TSS_DEV_SERVER === 'true'
    ? () => undefined
    : createEarlyHintsCollector

async function loadEntries(): Promise<Entries> {
  const [routerEntry, startEntry, pluginAdapters] = await Promise.all([
    // @ts-ignore When building, we currently don't respect tsconfig.ts' `include` so we are not picking up the .d.ts from start-client-core
    import('#tanstack-router-entry'),
    // @ts-ignore When building, we currently don't respect tsconfig.ts' `include` so we are not picking up the .d.ts from start-client-core
    import('#tanstack-start-entry'),
    // @ts-ignore When building, we currently don't respect tsconfig.ts' `include` so we are not picking up the .d.ts from start-client-core
    import('#tanstack-start-plugin-adapters'),
  ])
  return {
    routerEntry: routerEntry as unknown as RouterEntry,
    startEntry: startEntry as unknown as StartEntry,
    pluginAdapters: pluginAdapters as unknown as PluginAdaptersEntry,
  }
}

function getEntries() {
  if (!entriesPromise) {
    entriesPromise = loadEntries()
  }
  return entriesPromise
}

function hasCsrfMiddleware(
  middlewares: Array<AnyRequestMiddleware | AnyFunctionMiddleware>,
): boolean {
  return middlewares.some((middleware) => csrfSymbol in middleware)
}

function warnMissingCsrfMiddlewareOnce() {
  if (hasWarnedMissingCsrfMiddleware) return
  hasWarnedMissingCsrfMiddleware = true

  console.warn(`TanStack Start server functions are not protected by the CSRF middleware.

Server functions are same-origin RPC endpoints and should be protected from cross-site requests.

Add the CSRF middleware in src/start.ts:

  const csrfMiddleware = createCsrfMiddleware({
    filter: (ctx) => ctx.handlerType === 'serverFn',
  })

  export const startInstance = createStart(() => ({
    requestMiddleware: [csrfMiddleware],
  }))

If you intentionally handle CSRF another way, disable this warning:

  tanstackStart({
    serverFns: {
      disableCsrfMiddlewareWarning: true,
    },
  })`)
}

// Pre-computed constants
const ROUTER_BASEPATH = process.env.TSS_ROUTER_BASEPATH || '/'
const SERVER_FN_BASE = process.env.TSS_SERVER_FN_BASE
const IS_PRERENDERING = process.env.TSS_PRERENDERING === 'true'
const IS_SHELL_ENV = process.env.TSS_SHELL === 'true'
const IS_DEV = process.env.NODE_ENV === 'development'

// Reusable error messages
const ERR_NO_RESPONSE = IS_DEV
  ? `It looks like you forgot to return a response from your server route handler. If you want to defer to the app router, make sure to have a component set in this route.`
  : 'Internal Server Error'

const ERR_NO_DEFER = IS_DEV
  ? `You cannot defer to the app router if there is no component defined on this route.`
  : 'Internal Server Error'

function throwRouteHandlerError(): never {
  throw new Error(ERR_NO_RESPONSE)
}

function throwIfMayNotDefer(): never {
  throw new Error(ERR_NO_DEFER)
}

function getResponseFromResult(result: TODO): TODO {
  return isSsrResponse(result) || result instanceof Response
    ? result
    : result?.response
}

type StreamSsrResponse = Extract<SsrResponse, { serverSsrCleanup: 'stream' }>

type ResponseBody = NonNullable<Response['body']>
type ResponseWithBody = Response & { readonly body: ResponseBody }

/** The context object threaded through one middleware pipeline. */
interface PipelineContext {
  request: Request
  pathname: string
  handlerType: 'serverFn' | 'router'
  context: Record<string, unknown>
  params?: Record<string, unknown>
  response?: Response
  // Middleware may add arbitrary own properties through `next(ctx)`.
  [key: string]: unknown
}

interface MiddlewareResponseOwnership {
  response: ResponseWithBody
  sourceBody: ResponseBody
  streamResponse?: StreamSsrResponse
}

// Entries are released with their response; the map is never cleared by hand.
const responseBodySources = new WeakMap<Response, Response>()

function disposeResponseResult(result: TODO, reason: unknown): void {
  const response = getResponseFromResult(result)
  if (isSsrResponse(response) || response instanceof Response) {
    disposeSsrResponse(response, reason)
  }
}

/**
 * Marks `response` as directly derived from the current `source`.
 * Middleware must consume or cancel any other `clone()` or `tee()` branches.
 */
export function transferResponseBodyOwnership<TResponse extends Response>(
  source: Response,
  response: TResponse,
): TResponse {
  if (!source.body || !response.body) {
    throw new Error('Response body ownership requires two response bodies')
  }
  responseBodySources.set(response, source)
  return response
}

function hasResponseBody(value: unknown): value is ResponseWithBody {
  return value instanceof Response && value.body !== null
}

function inheritsResponseOwnership(
  ownership: MiddlewareResponseOwnership,
  candidate: unknown,
): candidate is ResponseWithBody {
  return (
    hasResponseBody(candidate) &&
    (candidate.body === ownership.response.body ||
      responseBodySources.get(candidate) === ownership.response)
  )
}

function disposeResponseOwnership(
  ownership: MiddlewareResponseOwnership,
  reason: unknown,
): void {
  const { response, sourceBody, streamResponse } = ownership
  streamResponse?.dispose(reason)
  if (!streamResponse || response.body !== sourceBody) {
    void response.body.cancel(reason).catch(() => {})
  }
}

function getOwnedResponse(
  ownership: MiddlewareResponseOwnership,
): HandlerCallbackResult {
  const { response, sourceBody, streamResponse } = ownership
  if (!streamResponse) {
    return response
  }
  if (streamResponse.response === response && response.body === sourceBody) {
    return streamResponse
  }
  if (response.body === sourceBody) {
    return { ...streamResponse, response }
  }
  return {
    ...streamResponse,
    response,
    dispose(reason): undefined {
      disposeResponseOwnership(ownership, reason)
    },
  }
}

function createLateResponseDisposer(signal: AbortSignal) {
  return (result: TODO) => disposeResponseResult(result, signal.reason)
}

/**
 * Compose middleware around a terminal response handler. With no middleware
 * the terminal runs directly.
 */
async function executeMiddleware(
  middlewares: Array<TODO>,
  terminal: TODO,
  ctx: PipelineContext,
  signal: AbortSignal,
  terminalNext?: TODO,
): Promise<HandlerCallbackResult> {
  let index = -1
  let responseOwnership: MiddlewareResponseOwnership | undefined
  // Once the pipeline returned, the HTTP runtime owns the response. A result
  // that settles later (for example the loser of a `Promise.race`) must not
  // replace or cancel it.
  let settled = false
  const disposeAbandonedResult = createLateResponseDisposer(signal)

  const setResponse = (response: TODO) => {
    const ssrResponse = isSsrResponse(response) ? response : undefined
    const streamResponse =
      ssrResponse?.serverSsrCleanup === 'stream' ? ssrResponse : undefined
    const exposed: Response | undefined = ssrResponse
      ? ssrResponse.response
      : response
    const current = responseOwnership

    if (settled) {
      if (exposed !== ctx.response) {
        disposeResponseResult(response, 'late middleware response')
      }
      return
    }
    if (current && current.response === exposed) {
      current.streamResponse ??= streamResponse
    } else if (current && inheritsResponseOwnership(current, exposed)) {
      current.response = exposed
      current.streamResponse ??= streamResponse
    } else {
      if (current) {
        disposeResponseOwnership(current, 'middleware response replaced')
      }
      if (hasResponseBody(exposed)) {
        responseOwnership = {
          response: exposed,
          sourceBody: exposed.body,
          streamResponse,
        }
      } else {
        responseOwnership = undefined
      }
    }
    ctx.response = exposed
  }

  const reconcileCtxResponse = () => {
    if (ctx.response !== responseOwnership?.response) {
      setResponse(ctx.response)
    }
  }

  let nextPromise: Promise<TODO> | undefined

  function next(nextCtx?: TODO): Promise<TODO> {
    const result = runNext(nextCtx)
    nextPromise = result
    return result
  }

  async function runNext(nextCtx?: TODO): Promise<TODO> {
    signal.throwIfAborted()

    // Merge context if provided using safeObjectMerge for prototype pollution prevention
    if (nextCtx) {
      if (nextCtx.context) {
        ctx.context = safeObjectMerge(ctx.context, nextCtx.context)
      }
      // Copy own properties except context (Object.keys returns only own enumerable properties)
      for (const key of Object.keys(nextCtx)) {
        if (key === 'response') {
          setResponse(nextCtx.response)
        } else if (key !== 'context') {
          ctx[key] = nextCtx[key]
        }
      }
    }

    index++
    const isTerminal = index === middlewares.length
    const middleware =
      index < middlewares.length
        ? middlewares[index]
        : isTerminal
          ? terminal
          : undefined
    const middlewareNext = isTerminal && terminalNext ? terminalNext : next
    if (!middleware) {
      return ctx
    }

    let result: TODO
    try {
      const pending = middleware({ ...ctx, next: middlewareNext })
      // A directly returned next() promise already propagates request aborts.
      if (nextPromise && pending === nextPromise) {
        nextPromise = undefined
        await pending
        if (signal.aborted) {
          throw signal.reason
        }
        return ctx
      } else if (!isPromise(pending)) {
        result = pending
        signal.throwIfAborted()
      } else {
        result = await waitForRequest(
          pending,
          signal,
          disposeAbandonedResult,
          disposeAbandonedResult,
        )
      }
    } catch (err) {
      reconcileCtxResponse()
      if (signal.aborted) {
        if (result !== undefined) {
          disposeAbandonedResult(result)
        }
        if (err !== signal.reason) {
          disposeAbandonedResult(err)
        }
        throw signal.reason
      }
      if (err instanceof Response) {
        setResponse(err)
        return ctx
      }
      throw err
    }

    if (isTerminal && terminalNext && !result) {
      throwRouteHandlerError()
    }

    reconcileCtxResponse()
    if (result && result !== ctx) {
      const response = getResponseFromResult(result)
      if (response !== undefined && response !== ctx.response) {
        setResponse(response)
      }
      if (
        response !== result &&
        result.context &&
        result.context !== ctx.context
      ) {
        ctx.context = safeObjectMerge(ctx.context, result.context)
      }
    }

    return ctx
  }

  try {
    await runNext()
    const response = ctx.response
    if (!response) {
      throwRouteHandlerError()
    }
    reconcileCtxResponse()
    if (signal.aborted) {
      throw signal.reason
    }
    settled = true
    return responseOwnership ? getOwnedResponse(responseOwnership) : response
  } catch (err) {
    settled = true
    if (responseOwnership) {
      disposeResponseOwnership(
        responseOwnership,
        signal.aborted ? signal.reason : err,
      )
    }
    throw err
  }
}

/**
 * Creates the TanStack Start request handler.
 *
 * @example Backwards-compatible usage (handler callback only):
 * ```ts
 * export default createStartHandler(defaultStreamHandler)
 * ```
 *
 * @example With CDN URL rewriting:
 * ```ts
 * export default createStartHandler({
 *   handler: defaultStreamHandler,
 *   transformAssets: 'https://cdn.example.com',
 * })
 * ```
 *
 * @example With per-request URL rewriting:
 * ```ts
 * export default createStartHandler({
 *   handler: defaultStreamHandler,
 *   transformAssets: {
 *     transform: ({ url }) => {
 *       const cdnBase = getRequest().headers.get('x-cdn-base') || ''
 *       return { href: `${cdnBase}${url}` }
 *     },
 *     cache: false,
 *   },
 * })
 * ```
 */
export function createStartHandler<TRegister = Register>(
  cbOrOptions: HandlerCallback<AnyRouter> | CreateStartHandlerOptions,
): RequestHandler<TRegister> {
  const handlerOptions: FinalManifestOptions =
    typeof cbOrOptions === 'function' ? {} : cbOrOptions
  const cb: HandlerCallback<AnyRouter> =
    typeof cbOrOptions === 'function' ? cbOrOptions : cbOrOptions.handler
  const finalManifestResolver = createFinalManifestResolver({
    ...handlerOptions,
    cacheCreateTransform: process.env.TSS_DEV_SERVER !== 'true',
  })
  const resolveManifestForRequest =
    process.env.TSS_DEV_SERVER === 'true'
      ? finalManifestResolver.resolveUncached
      : finalManifestResolver.resolveCached

  if (process.env.TSS_DEV_SERVER !== 'true') {
    finalManifestResolver.warmup({
      getBaseManifest: () => getBaseManifest(undefined),
    })
  }

  const startRequestResolver: RequestHandler<Register> = async (
    request,
    requestOpts,
  ) => {
    const signal = request.signal
    let router: AnyRouter | undefined
    let routerPromise: Promise<AnyRouter> | undefined
    let responseOwnsCleanup = false

    try {
      signal.throwIfAborted()
      // normalizing and sanitizing the pathname here for server, so we always deal with the same format during SSR.
      // during normalization paths like '//posts' are flattened to '/posts'.
      // in these cases we would prefer to redirect to the new path
      const { url, handledProtocolRelativeURL } = getNormalizedURL(request.url)
      const href = url.pathname + url.search + url.hash
      const origin = url.origin

      if (handledProtocolRelativeURL) {
        return Response.redirect(url, 308)
      }

      const entries = await waitForRequest(getEntries(), signal)
      const isServerFnRequest =
        !!SERVER_FN_BASE && url.pathname.startsWith(SERVER_FN_BASE)
      const startInstance = entries.startEntry.startInstance
      let startOptions: AnyStartInstanceOptions
      if (startInstance) {
        const pendingStartOptions = startInstance.getOptions()
        startOptions = isPromise(pendingStartOptions)
          ? await waitForRequest(pendingStartOptions, signal)
          : pendingStartOptions
        signal.throwIfAborted()
      } else {
        startOptions = {} as AnyStartInstanceOptions
      }

      const { hasPluginAdapters, pluginSerializationAdapters } =
        entries.pluginAdapters

      const serializationAdapters = [
        ...(startOptions.serializationAdapters || []),
        ...(hasPluginAdapters ? pluginSerializationAdapters : []),
        ServerFunctionSerializationAdapter,
      ]

      const requestStartOptions = {
        ...startOptions,
        requestMiddleware: startInstance
          ? startOptions.requestMiddleware
          : isServerFnRequest
            ? [defaultCsrfMiddleware]
            : undefined,
        serializationAdapters,
      }

      // Flatten request middlewares once
      const flattenedRequestMiddlewares = requestStartOptions.requestMiddleware
        ? flattenMiddlewares(requestStartOptions.requestMiddleware)
        : []

      // Create set for deduplication
      const executedRequestMiddlewares = new Set<TODO>(
        flattenedRequestMiddlewares,
      )

      // Memoized router getter
      const getRouter = (): Promise<AnyRouter> => {
        routerPromise ??= (async () => {
          signal.throwIfAborted()
          const requestRouter = await waitForRequest(
            entries.routerEntry.getRouter(),
            signal,
          )

          let isShell = IS_SHELL_ENV
          if (IS_PRERENDERING && !isShell) {
            isShell = request.headers.get(HEADERS.TSS_SHELL) === 'true'
          }

          const history = createServerHistory(href)

          requestRouter.update({
            history,
            isShell,
            isPrerendering: IS_PRERENDERING,
            origin: requestRouter.options.origin ?? origin,
            // Start-owned options that RouterConstructorOptions omits.
            ...{
              defaultSsr: requestStartOptions.defaultSsr,
              serializationAdapters: [
                ...requestStartOptions.serializationAdapters,
                ...(requestRouter.options.serializationAdapters || []),
              ],
            },
            basepath: ROUTER_BASEPATH,
          })

          router = requestRouter
          return requestRouter
        })()

        return routerPromise
      }

      const handlerType = isServerFnRequest
        ? ('serverFn' as const)
        : ('router' as const)
      const startContext = {
        getRouter,
        startOptions: requestStartOptions,
        request,
        executedRequestMiddlewares,
        handlerType,
      }
      let terminal: (ctx: PipelineContext) => unknown

      if (isServerFnRequest) {
        if (
          process.env.NODE_ENV !== 'production' &&
          process.env.TSS_DISABLE_CSRF_MIDDLEWARE_WARNING !== 'true' &&
          !hasCsrfMiddleware(flattenedRequestMiddlewares)
        ) {
          warnMissingCsrfMiddlewareOnce()
        }

        const serverFnId = url.pathname
          .slice(SERVER_FN_BASE.length)
          .split('/')[0]

        if (!serverFnId) {
          throw new Error('Invalid server action param for serverFnId')
        }

        terminal = ({ context }) =>
          runWithStartContext(
            { ...startContext, contextAfterGlobalMiddlewares: context },
            () =>
              handleServerAction({
                request,
                context: requestOpts?.context,
                serverFnId,
              }),
          )
      } else {
        const executeRouter = async (
          serverContext: TODO,
          matchedRoutes?: ReadonlyArray<AnyRoute>,
        ): Promise<SsrResponse> => {
          if (
            !/(^|,)\s*(\*\/\*|text\/html)/.test(
              request.headers.get('Accept') || '*/*',
            )
          ) {
            return normalizeSsrResponse(
              Response.json(
                { error: 'Only HTML requests are supported here' },
                { status: 406 },
              ),
            )
          }

          const manifest = await waitForRequest(
            resolveManifestForRequest({
              request,
              requestInlineCss: requestOpts?.inlineCss,
              getBaseManifest: () => getBaseManifest(matchedRoutes),
            }),
            signal,
          )

          const earlyHints = createEarlyHintsForRequest({
            onEarlyHints: requestOpts?.onEarlyHints,
            responseLinkHeader: requestOpts?.responseLinkHeader,
          })

          earlyHints?.collectStatic({ manifest, matchedRoutes })

          const routerInstance = await getRouter()

          attachRouterServerSsrUtils({
            router: routerInstance,
            manifest,
            getRequestAssets: () =>
              getStartContext({ throwIfNotFound: false })?.requestAssets,
          })

          // `additionalContext` is request-scoped and only read from router.options
          // during load; avoid a full router.update() and redundant location parse.
          routerInstance.options.additionalContext = { serverContext }
          await routerInstance.load({ _signal: signal })
          signal.throwIfAborted()

          if (routerInstance._serverResult?.type === 'redirect') {
            return normalizeSsrResponse(routerInstance._serverResult.redirect)
          }

          earlyHints?.collectDynamic(
            _getRenderedMatches(routerInstance.stores.matches.get()),
          )

          // Pass request-scoped assets to dehydrate for manifest injection
          const ctx = getStartContext({ throwIfNotFound: false })
          await routerInstance.serverSsr!.dehydrate({
            requestAssets: ctx?.requestAssets,
            signal,
          })
          signal.throwIfAborted()

          const responseHeaders = getStartResponseHeaders({
            router: routerInstance,
          })
          earlyHints?.appendResponseHeaders(responseHeaders)
          signal.throwIfAborted()
          const disposeLate = createLateResponseDisposer(signal)
          const response = await waitForRequest(
            cb({
              request,
              router: routerInstance,
              responseHeaders,
            }),
            signal,
            disposeLate,
            disposeLate,
          )
          return normalizeSsrResponse(response)
        }

        terminal = ({ context }) =>
          runWithStartContext(
            { ...startContext, contextAfterGlobalMiddlewares: context },
            () =>
              handleServerRoutes({
                getRouter,
                request,
                url,
                executeRouter,
                context,
                executedRequestMiddlewares,
              }),
          )
      }

      const middlewareResponse = await executeMiddleware(
        flattenedRequestMiddlewares.map((d) => d.options.server),
        terminal,
        {
          request,
          pathname: url.pathname,
          handlerType,
          context: createNullProtoObject(requestOpts?.context),
        },
        signal,
      )

      let result: SsrResponse
      try {
        result = await handleRedirectResponse(
          middlewareResponse,
          getRouter,
          signal,
          isServerFnRequest && request.headers.get('x-tsr-serverFn') === 'true',
        )
        if (request.method === 'HEAD') {
          result = stripSsrResponseBody(result, 'HEAD body stripped')
        }
      } catch (error) {
        disposeResponseResult(
          middlewareResponse,
          signal.aborted ? signal.reason : error,
        )
        throw error
      }
      bindSsrResponseToRequest(router, result, signal)
      signal.throwIfAborted()
      responseOwnsCleanup = result.serverSsrCleanup === 'stream'
      return result.response
    } finally {
      if (router?.serverSsr && !responseOwnsCleanup) {
        // Clean up router SSR state if it was set up but won't be cleaned up by the callback
        // (e.g., in redirect cases or early returns before the callback is invoked).
        // Transformed streaming response bodies clean up when consumed/cancelled.
        router.serverSsr.cleanup()
      }
      // `routerPromise` stays memoized: a streamed Suspense boundary or a late
      // server function may still ask for this request's router.
    }
  }

  return requestHandler(startRequestResolver)
}

const relativeRedirectProtocols = new Set<string>()

async function handleRedirectResponse(
  response: HandlerCallbackResult,
  getRouter: () => Promise<AnyRouter>,
  signal: AbortSignal,
  serializeRedirect: boolean,
): Promise<SsrResponse> {
  signal.throwIfAborted()
  const ssrResponse = normalizeSsrResponse(response)
  const redirect = ssrResponse.response
  if (!isRedirect(redirect)) {
    return ssrResponse
  }

  const opts = redirect.options
  const href = redirect.headers.get('Location') || opts.href
  if (
    !href &&
    opts.to &&
    typeof opts.to === 'string' &&
    !opts.to.startsWith('/')
  ) {
    throw new Error(
      `Server side redirects must use absolute paths via the 'href' or 'to' options. The redirect() method's "to" property accepts an internal path only. Use the "href" property to provide an external URL. Received: ${JSON.stringify(opts)}`,
    )
  }

  if (
    !href &&
    ['params', 'search', 'hash'].some(
      (d) => typeof (opts as TODO)[d] === 'function',
    )
  ) {
    throw new Error(
      `Server side redirects must use static search, params, and hash values and do not support functional values. Received functional values for: ${Object.keys(
        opts,
      )
        .filter((d) => typeof (opts as TODO)[d] === 'function')
        .map((d) => `"${d}"`)
        .join(', ')}`,
    )
  }

  signal.throwIfAborted()
  // Unambiguous relative hrefs need no route resolution or protocol policy.
  // Every scheme falls back to the router to honor its custom allowlist.
  if (href && !isDangerousProtocol(href, relativeRedirectProtocols)) {
    opts.href = href
    redirect.headers.set('Location', href)
  } else {
    const router = await getRouter()
    signal.throwIfAborted()
    // Resolves `redirect` in place.
    router.resolveRedirect(redirect)
  }

  if (serializeRedirect) {
    const redirectOptions = { ...(opts as TODO) }
    delete redirectOptions.headers
    const responseHeaders = new Headers(redirect.headers)
    responseHeaders.set('content-type', 'application/json')
    return replaceSsrResponse(
      ssrResponse,
      Response.json(
        { ...redirectOptions, isSerializedRedirect: true },
        { headers: responseHeaders },
      ),
      'redirect response replaced',
    )
  }

  return ssrResponse
}

function withParsedParams(
  handler: RouteMethodHandlerFn<any, AnyRoute, any, any, any, any, any>,
  matchedRoutes: ReadonlyArray<AnyRoute>,
): TODO {
  if (
    !matchedRoutes.some(
      (route) => route.options.params?.parse ?? route.options.parseParams,
    )
  ) {
    return handler
  }

  return (ctx: TODO) => {
    // Parse inside the pipeline so middleware can catch errors. Keep the raw
    // params for app-router validation when the handler defers to rendering.
    const params = Object.assign(Object.create(null), ctx.params)
    for (const route of matchedRoutes) {
      const parse = route.options.params?.parse ?? route.options.parseParams
      if (parse) {
        Object.assign(params, parse(params))
      }
    }
    return handler({ ...ctx, params })
  }
}

async function handleServerRoutes({
  getRouter,
  request,
  url,
  executeRouter,
  context,
  executedRequestMiddlewares,
}: {
  getRouter: () => Promise<AnyRouter>
  request: Request
  url: URL
  executeRouter: (
    serverContext: any,
    matchedRoutes?: ReadonlyArray<AnyRoute>,
  ) => Promise<SsrResponse>
  context: any
  executedRequestMiddlewares: Set<AnyRequestMiddleware>
}): Promise<SsrResponse> {
  const router = await getRouter()
  const rewrittenUrl = executeRewriteInput(router.rewrite, url)
  const pathname = rewrittenUrl.pathname
  // this will perform a fuzzy match, however for server routes we need an exact match
  // if the route is not an exact match, executeRouter will handle rendering the app router
  // the match will be cached internally, so no extra work is done during the app router render
  const [matchedRoutes, rawParams, foundRoute] =
    router.getMatchedRoutes(pathname)

  const isExactMatch = foundRoute && rawParams['**'] === undefined

  // Collect and dedupe route middlewares
  const routeMiddlewares: Array<AnyMiddlewareServerFn> = []
  let terminalHandler: TODO = (ctx: TODO) =>
    executeRouter(ctx.context, matchedRoutes)
  let terminalNext: TODO

  // Collect middleware from matched routes, filtering out those already executed
  // in the request phase
  for (const route of matchedRoutes) {
    const serverMiddleware = route.options.server?.middleware as
      | Array<AnyRequestMiddleware>
      | undefined
    if (serverMiddleware) {
      const flattened = flattenMiddlewares(serverMiddleware)
      for (const m of flattened) {
        if (!executedRequestMiddlewares.has(m)) {
          routeMiddlewares.push(m.options.server)
        }
      }
    }
  }

  // Add handler middleware if exact match
  const server = foundRoute?.options.server
  if (server?.handlers && isExactMatch) {
    const handlers =
      typeof server.handlers === 'function'
        ? server.handlers({ createHandlers: (d: any) => d })
        : server.handlers

    const requestMethod = request.method.toUpperCase() as RouteMethod
    // Per RFC 9110 §9.3.2, HEAD must return the same header fields as GET.
    // Priority for HEAD: explicit HEAD handler → GET → ANY (last resort).
    const handler =
      requestMethod === 'HEAD'
        ? (handlers['HEAD'] ?? handlers['GET'] ?? handlers['ANY'])
        : (handlers[requestMethod] ?? handlers['ANY'])
    if (handler) {
      const mayDefer = !!foundRoute.options.component

      if (typeof handler !== 'function') {
        if (handler.middleware?.length) {
          const handlerMiddlewares = flattenMiddlewares(handler.middleware)
          for (const m of handlerMiddlewares) {
            routeMiddlewares.push(m.options.server)
          }
        }
      }
      const routeHandler =
        typeof handler === 'function' ? handler : handler.handler
      if (routeHandler) {
        const parsedHandler = withParsedParams(routeHandler, matchedRoutes)
        if (!mayDefer) {
          terminalHandler = parsedHandler
          terminalNext = throwIfMayNotDefer
        } else {
          routeMiddlewares.push(parsedHandler)
        }
      }
    }
  }

  const response = await executeMiddleware(
    routeMiddlewares,
    terminalHandler,
    {
      request,
      context,
      params: rawParams,
      pathname,
      handlerType: 'router',
    },
    request.signal,
    terminalNext,
  )

  return normalizeSsrResponse(response)
}
