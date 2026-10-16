import { type Cause, Context, Effect, Latch, Layer, MutableRef, Option, Queue, Schedule, Schema, Stream } from "effect"
import type { Envelope } from "effect/cluster"
import { ClusterSchema, Entity } from "effect/cluster"
import { MemoryTransaction } from "effect/cluster/MessageStorage"
import type { RpcGroup } from "effect/rpc"
import { Rpc, RpcSchema } from "effect/rpc"

export class User extends Schema.Class<User>("User")({
  id: Schema.Number,
  name: Schema.String
}) {}

export class BoomError extends Schema.TaggedError<BoomError>()("BoomError", {
  cause: Schema.Unknown
}) {}

export class StreamWithKey extends Rpc.make("StreamWithKey", {
  success: RpcSchema.Stream(Schema.Number, Schema.Never),
  payload: { key: Schema.String },
  primaryKey: ({ key }) => key
}) {}

export const TestEntity = Entity.make("TestEntity", [
  Rpc.make("GetUser", {
    success: User,
    payload: { id: Schema.Number }
  }),
  Rpc.make("GetUserVolatile", {
    success: User,
    payload: { id: Schema.Number }
  }).annotate(ClusterSchema.Persisted, false),
  Rpc.make("Never"),
  Rpc.make("Fail", { error: BoomError }),
  Rpc.make("NeverFork"),
  Rpc.make("NeverVolatile").annotate(ClusterSchema.Persisted, false),
  Rpc.make("RequestWithKey", {
    payload: { key: Schema.String },
    primaryKey: ({ key }) => key
  }),
  StreamWithKey,
  Rpc.make("GetAllUsers", {
    success: User,
    payload: { ids: Schema.Array(Schema.Number) },
    stream: true
  }),
  Rpc.make("WithTransaction", {
    success: Schema.Boolean,
    payload: { id: Schema.Number }
  }).annotate(ClusterSchema.Dynamic, Context.add(ClusterSchema.WithTransaction, true))
]).annotateRpcs(ClusterSchema.Persisted, true)

export class TestEntityState extends Context.Service<TestEntityState>()("TestEntityState", {
  make: Effect.gen(function*() {
    const messages = yield* Queue.make<void>()
    const streamMessages = yield* Queue.make<void, Cause.Done>()
    const envelopes = yield* Queue.make<
      RpcGroup.Rpcs<typeof TestEntity.protocol> extends infer R ? R extends Rpc.Any ? Envelope.Request<R> : never
        : never
    >()
    const interrupts = yield* Queue.make<
      RpcGroup.Rpcs<typeof TestEntity.protocol> extends infer R ? R extends Rpc.Any ? Envelope.Request<R> : never
        : never
    >()
    const defectTrigger = MutableRef.make(false)
    const layerBuilds = MutableRef.make(0)
    const buildLatch = Latch.makeUnsafe(true)

    return {
      messages,
      streamMessages,
      envelopes,
      interrupts,
      defectTrigger,
      layerBuilds,
      buildLatch
    } as const
  })
}) {
  static readonly layer = Layer.effect(this)(this.make)
}

export const TestEntityNoState = TestEntity.toLayer(
  Effect.gen(function*() {
    const state = yield* TestEntityState

    MutableRef.update(state.layerBuilds, (count) => count + 1)
    yield* state.buildLatch.await

    const never = (envelope: any) =>
      Effect.suspend(() => {
        Queue.offerUnsafe(state.envelopes, envelope)
        return Effect.never
      }).pipe(Effect.onInterrupt(() => {
        Queue.offerUnsafe(state.interrupts, envelope)
        return Effect.void
      }))
    return TestEntity.of({
      GetUser: (envelope) =>
        Effect.sync(() => {
          Queue.offerUnsafe(state.envelopes, envelope)
          if (state.defectTrigger.current) {
            MutableRef.set(state.defectTrigger, false)
            throw new Error("User not found")
          }
          return new User({ id: envelope.payload.id, name: `User ${envelope.payload.id}` })
        }),
      GetUserVolatile: (envelope) =>
        Effect.sync(() => {
          Queue.offerUnsafe(state.envelopes, envelope)
          return new User({ id: envelope.payload.id, name: `User ${envelope.payload.id}` })
        }),
      Never: never,
      Fail: () => Effect.fail(new BoomError({ cause: new Error("boom") })),
      NeverFork: (envelope) => Rpc.fork(never(envelope)),
      NeverVolatile: never,
      RequestWithKey: (envelope) => {
        Queue.offerUnsafe(state.envelopes, envelope)
        return Queue.take(state.messages)
      },
      StreamWithKey: (envelope) => {
        let sequence = Option.match(envelope.lastSentChunkValue, {
          onNone: () => 0,
          onSome: (value) => value + 1
        })
        return Stream.fromQueue(state.streamMessages).pipe(
          Stream.map(() => sequence++)
        )
      },
      GetAllUsers: (envelope) => {
        Queue.offerUnsafe(state.envelopes, envelope)
        return Stream.fromIterable(envelope.payload.ids.map((id) => new User({ id, name: `User ${id}` }))).pipe(
          Stream.rechunk(1)
        )
      },
      WithTransaction: () => MemoryTransaction
    })
  }),
  { defectRetryPolicy: Schedule.forever }
)

export const TestEntityLayer = TestEntityNoState.pipe(Layer.provideMerge(TestEntityState.layer))

export const CallerId = Context.Service<never, string>(
  "effect/test/cluster/CallerId"
)

export const ContextBleedEntity = Entity.make("ContextBleedEntity", [
  Rpc.make("ReadCaller", { success: Schema.String }).annotate(ClusterSchema.Persisted, false),
  Rpc.make("ReadCallerPersisted", { success: Schema.String }).annotate(ClusterSchema.Persisted, true)
])

const readCaller = () => Effect.map(Effect.serviceOption(CallerId), Option.getOrElse(() => "none"))

export const ContextBleedLayer = ContextBleedEntity.toLayer({
  ReadCaller: readCaller,
  ReadCallerPersisted: readCaller
})
