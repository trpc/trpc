import { assert, describe, it } from "@effect/vitest"
import { Deferred, type Duration, Effect, Exit, Fiber, Layer, Queue, Ref, Scope, Stream } from "effect"

import { GraphQLClient, GraphQLMiddleware, GraphQLProtocol } from "effect/graphql"
import { TransportError } from "effect/graphql/GraphQLClientError"
import * as Headers from "effect/http/Headers"
import * as UrlParams from "effect/http/UrlParams"
import { TestClock } from "effect/testing"
import { expectReason, IssuesGroup, IssueUpdated, Viewer, type WsMessage, wsServer } from "./fixtures.ts"

const url = "ws://localhost/graphql"

const event = (title: string) => ({ data: { issueUpdated: { title } } })

const subscription = (id: string): GraphQLProtocol.GraphQLRequest => ({
  kind: "subscription",
  query: IssueUpdated.document,
  operationName: "IssueUpdated",
  variables: { id },
  headers: Headers.empty,
  urlParams: UrlParams.empty
})

interface Options {
  readonly connectionParams?: Effect.Effect<Record<string, unknown> | undefined, unknown>
  readonly connectionAckTimeout?: Duration.Input
  readonly keepAlive?: Duration.Input | false
  readonly idleTimeout?: Duration.Input
}

const makeProtocol = (server: Effect.Success<typeof wsServer>, options?: Options) =>
  GraphQLProtocol.makeWebSocket({ url, ...options }).pipe(Effect.provide(server.layer))

/** Starts a subscription and accepts its connection, returning the failure fiber. */
const acceptedSubscription = Effect.fnUntraced(function*(server: Effect.Success<typeof wsServer>, options?: Options) {
  const protocol = yield* makeProtocol(server, options)
  const fiber = yield* protocol.subscribe(subscription("A")).pipe(Stream.runDrain, Effect.flip, Effect.forkChild)
  const { connection } = yield* server.accept
  const subscribe = yield* Queue.take(connection.received)
  return { fiber, connection, subscribe }
})

describe("GraphQLProtocol.makeWebSocket", () => {
  it.effect("subscribes only after connection_ack and routes events by operation id", () =>
    Effect.gen(function*() {
      const server = yield* wsServer
      const protocol = yield* makeProtocol(server, { connectionParams: Effect.succeed({ token: "t1" }) })
      const a = yield* protocol.subscribe(subscription("A")).pipe(Stream.runCollect, Effect.forkChild)
      const b = yield* protocol.subscribe(subscription("B")).pipe(Stream.runCollect, Effect.forkChild)

      const connection = yield* Queue.take(server.connections)
      assert.deepStrictEqual(connection.options, "graphql-transport-ws")
      assert.deepStrictEqual(yield* Queue.take(connection.received), {
        type: "connection_init",
        payload: { token: "t1" }
      })
      yield* TestClock.adjust("1 second")
      assert.strictEqual(yield* Queue.size(connection.received), 0)

      yield* connection.send({ type: "connection_ack" })
      const ids: Record<string, string> = {}
      for (const message of [yield* Queue.take(connection.received), yield* Queue.take(connection.received)]) {
        assert.strictEqual(message.type, "subscribe")
        ids[(message.payload as { variables: { id: string } }).variables.id] = message.id!
      }

      yield* connection.send({ id: ids.B, type: "next", payload: event("b") })
      yield* connection.send({ id: ids.A, type: "next", payload: event("a") })
      yield* connection.send({ id: ids.A, type: "complete" })
      yield* connection.send({ id: ids.B, type: "complete" })
      assert.deepStrictEqual(yield* Fiber.join(a), [{ body: event("a") }])
      assert.deepStrictEqual(yield* Fiber.join(b), [{ body: event("b") }])
    }))

  it.effect("a missing connection_ack is a TransportError", () =>
    Effect.gen(function*() {
      const server = yield* wsServer
      const protocol = yield* makeProtocol(server, { connectionAckTimeout: "5 seconds" })
      const fiber = yield* protocol.subscribe(subscription("A")).pipe(Stream.runDrain, Effect.flip, Effect.forkChild)
      yield* Queue.take(server.connections)
      yield* TestClock.adjust("5 seconds")
      assert.instanceOf(yield* Fiber.join(fiber), TransportError)
    }))

  it.effect("a close while connectionParams is pending fails the waiting operation", () =>
    Effect.gen(function*() {
      const server = yield* wsServer
      const protocol = yield* makeProtocol(server, { connectionParams: Effect.never })
      const fiber = yield* protocol.subscribe(subscription("A")).pipe(Stream.runDrain, Effect.flip, Effect.forkChild)
      const connection = yield* Queue.take(server.connections)
      yield* connection.close(1006)
      yield* TestClock.adjust("1 minute")
      assert.isDefined(fiber.pollUnsafe())
      assert.strictEqual((yield* Fiber.join(fiber)).closeCode, 1006)
    }))

  // Shape is checked before the id lookup, so an unknown id does not excuse it.
  const invalidMessages: ReadonlyArray<WsMessage> = [
    { type: "not-a-graphql-message" },
    { type: "next", id: "unknown", payload: [] }
  ]
  for (const invalid of invalidMessages) {
    it.effect(`an invalid message ${JSON.stringify(invalid)} closes the connection with 4400`, () =>
      Effect.gen(function*() {
        const server = yield* wsServer
        const { connection, fiber } = yield* acceptedSubscription(server)
        yield* connection.send(invalid)
        const error = yield* Fiber.join(fiber)
        assert.strictEqual(error.closeCode, 4400)
        assert.isFalse(error.isRetryable)
        assert.strictEqual(yield* Deferred.await(connection.closed), 4400)
      }))
  }

  it.effect("1002 is a fatal close", () =>
    Effect.gen(function*() {
      const server = yield* wsServer
      const { connection, fiber } = yield* acceptedSubscription(server)
      yield* connection.close(1002)
      const error = yield* Fiber.join(fiber)
      assert.strictEqual(error.closeCode, 1002)
      assert.isFalse(error.isRetryable)
    }))

  it.effect("answers ping with pong, pings every keepAlive and treats a missed frame as a retryable close", () =>
    Effect.gen(function*() {
      const server = yield* wsServer
      const { connection, fiber } = yield* acceptedSubscription(server, { keepAlive: "10 seconds" })
      yield* connection.send({ type: "ping" })
      assert.deepStrictEqual(yield* Queue.take(connection.received), { type: "pong" })

      yield* TestClock.adjust("10 seconds")
      assert.deepStrictEqual(yield* Queue.take(connection.received), { type: "ping" })
      yield* TestClock.adjust("10 seconds")
      assert.isTrue((yield* Fiber.join(fiber)).isRetryable)
    }))

  it.effect("interrupting a subscription sends a client complete", () =>
    Effect.gen(function*() {
      const server = yield* wsServer
      const { connection, fiber, subscribe } = yield* acceptedSubscription(server)
      yield* Fiber.interrupt(fiber)
      assert.deepStrictEqual(yield* Queue.take(connection.received), { id: subscribe.id, type: "complete" })
    }))

  it.effect("a lost connection fails in-flight queries, and the next operation reconnects with fresh connectionParams", () =>
    Effect.gen(function*() {
      const server = yield* wsServer
      const tokens = yield* Ref.make(0)
      const protocol = yield* makeProtocol(server, {
        connectionParams: Effect.map(Ref.updateAndGet(tokens, (n) => n + 1), (n) => ({ token: n }))
      })
      const query: GraphQLProtocol.GraphQLRequest = {
        kind: "query",
        query: Viewer.document,
        operationName: "Viewer",
        variables: {},
        headers: Headers.empty,
        urlParams: UrlParams.empty
      }

      const inFlight = yield* protocol.execute(query).pipe(Effect.flip, Effect.forkChild)
      const first = yield* server.accept
      assert.deepStrictEqual(first.init.payload, { token: 1 })
      yield* Queue.take(first.connection.received)
      yield* first.connection.close(1006)
      assert.isTrue((yield* Fiber.join(inFlight)).isRetryable)

      const retried = yield* protocol.execute(query).pipe(Effect.forkChild)
      const second = yield* server.accept
      assert.deepStrictEqual(second.init.payload, { token: 2 })
      const subscribe = yield* Queue.take(second.connection.received)
      yield* second.connection.send({ id: subscribe.id, type: "next", payload: { data: { viewer: { login: "tim" } } } })
      yield* second.connection.send({ id: subscribe.id, type: "complete" })
      assert.deepStrictEqual(yield* Fiber.join(retried), { body: { data: { viewer: { login: "tim" } } } })
    }))

  it.effect("an operation started after the scope closed fails with a non-retryable TransportError", () =>
    Effect.gen(function*() {
      const server = yield* wsServer
      const scope = yield* Scope.make()
      const protocol = yield* makeProtocol(server).pipe(Scope.provide(scope))
      yield* Scope.close(scope, Exit.void)
      const fiber = yield* protocol.subscribe(subscription("A")).pipe(
        Stream.runDrain,
        Effect.flip,
        Effect.timeout("5 seconds"),
        Effect.forkChild
      )
      yield* TestClock.adjust("5 seconds")
      const error = yield* Fiber.join(fiber)
      assert.instanceOf(error, TransportError)
      assert.isFalse(error.isRetryable)
    }))

  it.effect("connects on the first operation and closes idleTimeout after the last one", () =>
    Effect.gen(function*() {
      const server = yield* wsServer
      const protocol = yield* makeProtocol(server, { idleTimeout: "30 seconds", keepAlive: false })
      yield* TestClock.adjust("1 minute")
      assert.strictEqual(yield* Queue.size(server.connections), 0)

      const fiber = yield* protocol.subscribe(subscription("A")).pipe(Stream.runCollect, Effect.forkChild)
      const { connection } = yield* server.accept
      const subscribe = yield* Queue.take(connection.received)
      yield* connection.send({ id: subscribe.id, type: "complete" })
      yield* Fiber.join(fiber)

      yield* TestClock.adjust("29 seconds")
      assert.isFalse(yield* Deferred.isDone(connection.closed))
      yield* TestClock.adjust("1 second")
      assert.strictEqual(yield* Deferred.await(connection.closed), 1000)
    }))
})

describe("GraphQLProtocol.layerWebSocket with GraphQLClient", () => {
  it.effect("a retryable close resubscribes through the middleware chain; a server error is a ResponseError", () =>
    Effect.gen(function*() {
      class Count extends GraphQLMiddleware.Service<Count>()("test/Count") {}
      const subscribes = yield* Ref.make(0)
      const CountLive = Layer.succeed(Count, {
        execute: ({ next, request }) => next(request),
        subscribe: ({ next, request }) => Stream.unwrap(Effect.as(Ref.update(subscribes, (n) => n + 1), next(request)))
      })
      const server = yield* wsServer
      const context = yield* Layer.build(
        Layer.merge(GraphQLProtocol.layerWebSocket({ url }).pipe(Layer.provide(server.layer)), CountLive)
      )
      const client = yield* GraphQLClient.make(IssuesGroup.middleware(Count)).pipe(Effect.provide(context))
      const fiber = yield* client.IssueUpdated({ id: "I_1" }).pipe(
        Stream.runCollect,
        expectReason("ResponseError"),
        Effect.forkChild
      )

      const first = yield* server.accept
      yield* Queue.take(first.connection.received)
      yield* first.connection.close(1006)
      // The client's default schedule waits 500ms before resubscribing.
      yield* TestClock.adjust("500 millis")

      const second = yield* server.accept
      const subscribe = yield* Queue.take(second.connection.received)
      yield* second.connection.send({ id: subscribe.id, type: "error", payload: [{ message: "denied" }] })
      const reason = yield* Fiber.join(fiber)
      assert.deepStrictEqual(reason.errors, [{ message: "denied" }])
      assert.strictEqual(yield* Ref.get(subscribes), 2)
    }))
})
