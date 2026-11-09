import { Context, Effect, Layer, Metric, Option, Queue, Schema } from "effect"
import * as Headers from "effect/http/Headers"
import * as Rpc from "effect/rpc/Rpc"
import * as RpcGroup from "effect/rpc/RpcGroup"
import * as RpcMiddleware from "effect/rpc/RpcMiddleware"
import * as RpcServer from "effect/rpc/RpcServer"

export class User extends Schema.Class<User>("User")({
  id: Schema.String,
  name: Schema.String
}) {}

class StreamUsers extends Rpc.make("StreamUsers", {
  success: User,
  payload: {
    id: Schema.String
  },
  stream: true
}) {}

class CurrentUser extends Context.Service<CurrentUser, User>()("CurrentUser") {}

class Unauthorized extends Schema.Error<Unauthorized>("Unauthorized")({
  _tag: Schema.tag("Unauthorized")
}) {}

class AuthMiddleware extends RpcMiddleware.Service<AuthMiddleware, {
  provides: CurrentUser
}>()("AuthMiddleware", {
  error: Unauthorized,
  requiredForClient: true
}) {}

class TimingMiddleware extends RpcMiddleware.Service<TimingMiddleware>()("TimingMiddleware") {}

class GetUser extends Rpc.make("GetUser", {
  success: User,
  payload: { id: Schema.String }
}) {}

export const UserRpcs = RpcGroup.make(
  GetUser,
  Rpc.make("GetUserOption", {
    success: Schema.Option(User),
    payload: { id: Schema.String }
  }),
  StreamUsers,
  Rpc.make("GetInterrupts", {
    success: Schema.Number
  }),
  Rpc.make("GetEmits", {
    success: Schema.Number
  }),
  Rpc.make("ProduceDefect"),
  Rpc.make("Never"),
  Rpc.make("nested.test"),
  Rpc.make("TimedMethod", {
    payload: {
      shouldFail: Schema.Boolean
    },
    success: Schema.Number
  }).middleware(TimingMiddleware),
  Rpc.make("GetTimingMiddlewareMetrics", {
    success: Schema.Struct({
      success: Schema.Number,
      defect: Schema.Number,
      count: Schema.Number
    })
  })
).middleware(AuthMiddleware)

export const AuthLayer = Layer.succeed(AuthMiddleware)(
  AuthMiddleware.of((effect, options) =>
    Effect.provideService(
      effect,
      CurrentUser,
      new User({ id: options.headers.userid ?? "1", name: options.headers.name ?? "Fallback name" })
    )
  )
)

const rpcSuccesses = Metric.counter("rpc_middleware_success")
const rpcDefects = Metric.counter("rpc_middleware_defects")
const rpcCount = Metric.counter("rpc_middleware_count")
export const TimingLayer = Layer.succeed(TimingMiddleware)(
  TimingMiddleware.of((effect) =>
    effect.pipe(
      Effect.tap(Metric.update(rpcSuccesses, 1)),
      Effect.tapDefect(() => Metric.update(rpcDefects, 1)),
      Effect.ensuring(Metric.update(rpcCount, 1))
    )
  )
)

export const UsersLayer = UserRpcs.toLayer(Effect.gen(function*() {
  let interrupts = 0
  let emits = 0
  return UserRpcs.of({
    GetUser: (_) =>
      CurrentUser.pipe(
        Rpc.fork
      ),
    GetUserOption: Effect.fnUntraced(function*(req) {
      return Option.some(new User({ id: req.id, name: "John" }))
    }),
    StreamUsers: Effect.fnUntraced(function*(req, _) {
      const mailbox = yield* Queue.bounded<User>(0)

      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          interrupts++
        })
      )

      yield* Queue.offer(mailbox, new User({ id: req.id, name: "John" })).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            emits++
          })
        ),
        Effect.delay(100),
        Effect.forever,
        Effect.forkScoped
      )

      return mailbox
    }),
    GetInterrupts: () => Effect.sync(() => interrupts),
    GetEmits: () => Effect.sync(() => emits),
    ProduceDefect: () => Effect.die("boom"),
    Never: () => Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(() => interrupts++))),
    "nested.test": () => Effect.void,
    TimedMethod: (_) => _.shouldFail ? Effect.die("boom") : Effect.succeed(1),
    GetTimingMiddlewareMetrics: () =>
      Effect.all({
        defect: Metric.value(rpcDefects).pipe(Effect.map((_) => _.count)),
        success: Metric.value(rpcSuccesses).pipe(Effect.map((_) => _.count)),
        count: Metric.value(rpcCount).pipe(Effect.map((_) => _.count))
      })
  })
}))

export const RpcLayer = RpcServer.layer(UserRpcs, {
  disableFatalDefects: true
}).pipe(
  Layer.provide([
    UsersLayer,
    AuthLayer,
    TimingLayer
  ])
)

export const AuthClient = RpcMiddleware.layerClient(AuthMiddleware, ({ next, request }) =>
  next({
    ...request,
    headers: Headers.set(request.headers, "name", "Logged in user")
  }))
