export interface GlobalMiddlewareContext {
  requestTrace?: string
  requestTotal?: number
  functionTrace?: string
  functionTotal?: number
}

export interface GlobalMiddlewareRouteContext extends GlobalMiddlewareContext {
  serverContext?: GlobalMiddlewareContext
  globalMiddlewareContext?: GlobalMiddlewareContext
}

export type RequestMiddlewareCount = 0 | 1 | 2 | 3

const requestMiddlewareCountKey = '__TSR_SSR_BENCH_REQUEST_MIDDLEWARE_COUNT__'

type BenchmarkGlobal = typeof globalThis & {
  [requestMiddlewareCountKey]?: RequestMiddlewareCount
}

const expectedRequestContexts: ReadonlyArray<GlobalMiddlewareContext> = [
  {},
  { requestTrace: 'req.r1', requestTotal: 1 },
  { requestTrace: 'req.r1.r2', requestTotal: 3 },
  { requestTrace: 'req.r1.r2.r3', requestTotal: 6 },
]

export const expectedRequestTrace = 'req.r1.r2.r3'
export const expectedRequestTotal = 6
export const expectedFunctionTrace = 'fn.f1.f2'
export const expectedFunctionTotal = 30

export function setRequestMiddlewareCount(count: RequestMiddlewareCount) {
  const benchmarkGlobal = globalThis as BenchmarkGlobal
  benchmarkGlobal[requestMiddlewareCountKey] = count
}

export function getRequestMiddlewareCount(): RequestMiddlewareCount {
  return (globalThis as BenchmarkGlobal)[requestMiddlewareCountKey] ?? 3
}

export function getExpectedRequestContext(
  count: RequestMiddlewareCount,
): GlobalMiddlewareContext {
  return expectedRequestContexts[count]!
}

export function makeDocumentMarker(
  id: string,
  context: GlobalMiddlewareContext,
) {
  return `document:${context.requestTrace}:${id}:${context.requestTotal}`
}

export function getGlobalMiddlewareContext(context: unknown) {
  const routeContext = (context ?? {}) as GlobalMiddlewareRouteContext

  return (
    routeContext.globalMiddlewareContext ??
    routeContext.serverContext ??
    routeContext
  )
}

export function makeServerRouteMarker(
  id: string,
  context: GlobalMiddlewareContext,
) {
  return `route:${context.requestTrace}:${id}:${context.requestTotal}`
}

export function makeServerFnMarker(
  q: string,
  context: GlobalMiddlewareContext,
) {
  return `fn:${context.requestTrace}:${context.functionTrace}:${q}:${context.requestTotal}:${context.functionTotal}`
}
