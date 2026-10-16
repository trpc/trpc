import { assert, describe, it } from "@effect/vitest"
import { Cause, Context, Effect, Fiber, Option, Stream } from "effect"
// @ts-ignore
// oxlint-disable-next-line @typescript-eslint/no-unused-vars
import { NodeInspectSymbol } from "effect/Inspectable"
import * as Layer from "effect/Layer"
import * as RpcClient from "effect/rpc/RpcClient"
import type { RpcClientError } from "effect/rpc/RpcClientError"
import type * as RpcGroup from "effect/rpc/RpcGroup"
import * as RpcServer from "effect/rpc/RpcServer"
import * as RpcTest from "effect/rpc/RpcTest"
import { AuthClient, AuthLayer, TimingLayer, User, UserRpcs, UsersLayer } from "./rpc-schemas.ts"

export class UsersClient extends Context.Service<
  UsersClient,
  RpcClient.RpcClient<RpcGroup.Rpcs<typeof UserRpcs>, RpcClientError>
>()("UsersClient") {
  static readonly layer = Layer.effect(UsersClient)(RpcClient.make(UserRpcs)).pipe(
    Layer.provide(AuthClient)
  )
  static layerTest = Layer.effect(UsersClient)(RpcTest.makeClient(UserRpcs)).pipe(
    Layer.provide([UsersLayer, AuthLayer, TimingLayer, AuthClient])
  )
}

export const e2eSuite = <E>(
  name: string,
  layer: Layer.Layer<UsersClient | RpcServer.Protocol, E>,
  concurrent = true
) => {
  describe(name, { concurrent, timeout: 30_000 }, () => {
    it.effect("should get user", () =>
      Effect.gen(function*() {
        const client = yield* UsersClient
        const user = yield* client.GetUser({ id: "1" })
        assert.instanceOf(user, User)
        assert.deepStrictEqual(user, new User({ id: "1", name: "Logged in user" }))
      }).pipe(Effect.provide(layer)))

    it.effect("nested method", () =>
      Effect.gen(function*() {
        const client = yield* UsersClient
        yield* client["nested.test"]()
      }).pipe(Effect.provide(layer)))

    it.effect("should not flatten Option", () =>
      Effect.gen(function*() {
        const client = yield* UsersClient
        const user = yield* client.GetUserOption({ id: "1" })
        assert.deepStrictEqual(user, Option.some(new User({ id: "1", name: "John" })))
      }).pipe(Effect.provide(layer)))

    it.effect("headers", () =>
      Effect.gen(function*() {
        const client = yield* UsersClient
        const user = yield* client.GetUser({ id: "1" })
        assert.instanceOf(user, User)
        assert.deepStrictEqual(user, new User({ id: "123", name: "Logged in user" }))
      }).pipe(
        RpcClient.withHeaders({ userId: "123" }),
        Effect.provide(layer)
      ))

    it.live("Stream", () =>
      Effect.gen(function*() {
        const client = yield* UsersClient
        const users: Array<User> = []
        const fiber = yield* client.StreamUsers({ id: "1" }).pipe(
          Stream.take(5),
          Stream.runForEach((user) =>
            Effect.sync(() => {
              users.push(user)
            })
          ),
          Effect.forkChild
        )

        yield* Fiber.join(fiber)
        assert.lengthOf(users, 5)

        // test interrupts
        const interrupts = yield* client.GetInterrupts()
        assert.equal(interrupts, 1)

        const { supportsAck } = yield* RpcServer.Protocol

        // test backpressure
        if (supportsAck) {
          const emits = yield* client.GetEmits()
          assert.equal(emits, 5)
        }
      }).pipe(Effect.provide(layer)), { timeout: 20000 })

    it.effect("defect", () =>
      Effect.gen(function*() {
        const client = yield* UsersClient
        const cause = yield* client.ProduceDefect().pipe(
          Effect.sandbox,
          Effect.flip
        )
        assert.deepStrictEqual(cause, Cause.die("boom"))
      }).pipe(
        RpcClient.withHeaders({ userId: "123" }),
        Effect.provide(layer)
      ))

    it.live("never", () =>
      Effect.gen(function*() {
        const client = yield* UsersClient
        const fiber = yield* client.Never().pipe(
          Effect.forkChild
        )
        yield* Effect.sleep(500)
        assert.isUndefined(fiber.pollUnsafe())

        yield* Fiber.interrupt(fiber)
        yield* Effect.sleep(100)

        const { supportsAck } = yield* RpcServer.Protocol
        if (supportsAck) {
          const interrupts = yield* client.GetInterrupts()
          assert.equal(interrupts, 1)
        }
      }).pipe(
        RpcClient.withHeaders({ userId: "123" }),
        Effect.provide(layer)
      ))

    it.effect("timing middleware", () =>
      Effect.gen(function*() {
        const client = yield* UsersClient
        const result = yield* client.TimedMethod({ shouldFail: false })
        assert.equal(result, 1)
        yield* client.TimedMethod({ shouldFail: true }).pipe(Effect.exit)
        const { count, defect, success } = yield* client.GetTimingMiddlewareMetrics()
        assert.notEqual(count, 0)
        assert.notEqual(defect, 0)
        assert.notEqual(success, 0)
      }).pipe(Effect.provide(layer)))
  })
}
