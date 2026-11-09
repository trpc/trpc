import * as Effect from "effect/Effect"
import * as HttpRouter from "effect/http/HttpRouter"
import * as Layer from "effect/Layer"
import * as Scheduler from "effect/Scheduler"
import { AsyncLocalStorage } from "node:async_hooks"

export interface WorkerdResponse {
  readonly status: number
  readonly headers: Headers
  readonly body: string
}

/**
 * Serves requests like a Cloudflare Workers isolate: the app is built while
 * the first request is served, and a timer belongs to the request that set it.
 * Once a request has finished sending its body, its pending timers never fire.
 */
export const makeWorkerdHarness = Effect.fnUntraced(function*<A, E>(
  serverLayer: Layer.Layer<A, E, HttpRouter.HttpRouter>
) {
  const owners = new AsyncLocalStorage<{ completed: boolean }>()
  const scheduler = new Scheduler.MixedScheduler("async", (task) => {
    const owner = owners.getStore()
    const timer = setTimeout(() => {
      if (owner?.completed !== true) task()
    }, 0)
    return () => clearTimeout(timer)
  })
  const appLayer = serverLayer.pipe(
    Layer.provideMerge(Layer.succeed(Scheduler.Scheduler, scheduler))
  )
  let app: {
    readonly handler: (request: Request) => Promise<Response>
    readonly dispose: () => Promise<void>
  } | undefined
  yield* Effect.addFinalizer(() => Effect.promise(() => app?.dispose() ?? Promise.resolve()))

  const request = (input: Request): Effect.Effect<WorkerdResponse> =>
    Effect.promise((signal) => {
      const owner = { completed: false }
      signal.addEventListener("abort", () => {
        owner.completed = true
      })
      return owners.run(owner, async () => {
        try {
          app ??= HttpRouter.toWebHandler(appLayer, { disableLogger: true })
          const response = await app.handler(input)
          // A Workers request completes once its whole body, including SSE, is sent.
          const body = await response.text()
          return { status: response.status, headers: response.headers, body }
        } finally {
          owner.completed = true
        }
      })
    })

  return { request } as const
})
