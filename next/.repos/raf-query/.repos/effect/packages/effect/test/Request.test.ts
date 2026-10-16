import { assert, describe, expect, it } from "@effect/vitest"
import { Array, Context, Data, Deferred, Equal, Fiber, Hash, Schema } from "effect"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { flow, pipe } from "effect/Function"
import { Persistable, Persistence } from "effect/persistence"
import * as Request from "effect/Request"
import * as Resolver from "effect/RequestResolver"

class Counter extends Context.Service<Counter, { count: number }>()("Counter") {}
class Requests extends Context.Service<Requests, { count: number }>()("Requests") {}
class Interrupts extends Context.Reference("Interrupts", {
  defaultValue: () => ({ interrupts: 0 })
}) {}
class RequestService extends Context.Reference("RequestService", {
  defaultValue: () => ({ value: "default" })
}) {}
const delay = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.andThen(
    Effect.promise(() => new Promise((r) => setTimeout(() => r(0), 0))),
    self
  )

const userIds: ReadonlyArray<number> = Array.range(1, 26)

const userNames: ReadonlyMap<number, string> = new Map(
  Array.zipWith(
    userIds,
    Array.map(Array.range(97, 122), (a) => String.fromCharCode(a)),
    (a, b) => [a, b] as const
  )
)

type UserRequest = GetAllIds | GetNameById

interface GetAllIds extends Request.Request<ReadonlyArray<number>> {
  readonly _tag: "GetAllIds"
}
const GetAllIds = Request.tagged<GetAllIds>("GetAllIds")

interface GetRequestService extends Request.Request<string> {
  readonly _tag: "GetRequestService"
}
const GetRequestService = Request.tagged<GetRequestService>("GetRequestService")

class GetNameById extends Request.TaggedClass("GetNameById")<
  {
    readonly id: number
  },
  string,
  string
> {}

const makeUserResolver = Effect.gen(function*() {
  const counter = yield* Counter
  const requests_ = yield* Requests

  const resolver = Resolver.make<UserRequest>(Effect.fnUntraced(function*(entries) {
    counter.count++
    requests_.count += entries.length
    for (const entry of entries) {
      yield* delay(processRequest(entry))
    }
  })).pipe(Resolver.batchN(15))

  const getIds = Effect.request(GetAllIds(), resolver)
  const getNameById = (id: number) => Effect.request(new GetNameById({ id }), resolver)
  const getNameByIdPiped = (id: number) => pipe(new GetNameById({ id }), Effect.request(resolver))
  const getNames = getIds.pipe(
    Effect.flatMap(Effect.forEach(getNameById, { concurrency: "unbounded" })),
    Effect.onInterrupt(() =>
      Effect.tap(Interrupts, (i) => {
        i.interrupts++
        return Effect.void
      })
    )
  )

  return { getNames, getIds, getNameById, getNameByIdPiped } as const
})

const makeUserResolverTagged = Effect.gen(function*() {
  const counter = yield* Counter
  const requests = yield* Requests

  const resolver = Resolver.fromEffectTagged<UserRequest>()({
    GetAllIds: Effect.fnUntraced(function*(reqs) {
      counter.count++
      requests.count += reqs.length
      return reqs.map(() => userIds)
    }),
    GetNameById: Effect.fnUntraced(function*(reqs) {
      counter.count++
      requests.count += reqs.length

      const names: Array<string> = []
      for (let i = 0; i < reqs.length; i++) {
        const req = reqs[i]
        if (!userNames.has(req.request.id)) return yield* Effect.fail("Not Found")
        names.push(userNames.get(req.request.id)!)
      }
      return names
    })
  }).pipe(Resolver.batchN(15))

  const getIds = Effect.request(GetAllIds(), resolver)
  const getNameById = (id: number) => Effect.request(new GetNameById({ id }), resolver)
  const allNames = getIds.pipe(
    Effect.flatMap(Effect.forEach(getNameById, { concurrency: "unbounded" }))
  )

  return { allNames, getIds, getNameById } as const
})

const processRequest = (entry: Request.Entry<UserRequest>): Effect.Effect<void> => {
  switch (entry.request._tag) {
    case "GetAllIds": {
      return Request.complete(entry, Exit.succeed(userIds))
    }
    case "GetNameById": {
      if (userNames.has(entry.request.id)) {
        const userName = userNames.get(entry.request.id)!
        return Request.complete(entry, Exit.succeed(userName))
      }
      return Request.completeEffect(entry, Exit.fail("Not Found"))
    }
  }
}

const provideEnv = flow(
  Effect.provideServiceEffect(Counter, Effect.sync(() => ({ count: 0 }))),
  Effect.provideServiceEffect(Requests, Effect.sync(() => ({ count: 0 })))
)

describe("Request", { concurrent: false }, () => {
  it("preserves __proto__ as an own constructor property", () => {
    interface ProtoRequest extends Request.Request<void> {
      readonly "__proto__": { readonly polluted: boolean }
    }
    const make = Request.of<ProtoRequest>()
    const value = { polluted: true }
    const request = make({ ["__proto__"]: value })

    assert.isTrue(Request.isRequest(request))
    assert.isTrue(Object.hasOwn(request, "__proto__"))
    assert.strictEqual(request["__proto__"], value)
  })

  it("copies enumerable symbol properties in Class", () => {
    const key = Symbol()
    class SymbolRequest extends Request.Class<{ readonly [key]: string }, void> {}

    assert.strictEqual(new SymbolRequest({ [key]: "value" })[key], "value")
  })

  it("compares StructuralProto values when hashes collide", () => {
    class Req extends Request.Class<{ id: string; account: string }, string> {}

    const a = new Req({ id: "id-8", account: "acct-1975" })
    const b = new Req({ id: "id-18", account: "acct-433" })

    assert.strictEqual(Hash.hash(a), Hash.hash(b))
    assert.strictEqual(Equal.equals(a, b), false)
  })

  it.effect(
    "requests are executed correctly",
    Effect.fnUntraced(function*() {
      const { getNames } = yield* makeUserResolver
      const names = yield* getNames
      const counter = yield* Counter
      const requests = yield* Requests
      assert.strictEqual(counter.count, 3)
      assert.strictEqual(requests.count, userIds.length + 1)
      assert.deepStrictEqual(names, userIds.map((id) => userNames.get(id)))
    }, provideEnv)
  )

  it.effect(
    "requests with dual syntax are executed correctly",
    Effect.fnUntraced(function*() {
      const names = yield* (yield* makeUserResolver).getNames
      const counter = yield* Counter
      const requests = yield* Requests
      assert.strictEqual(counter.count, 3)
      assert.strictEqual(requests.count, userIds.length + 1)
      assert.deepStrictEqual(names, userIds.map((id) => userNames.get(id)))
    }, provideEnv)
  )

  it.effect(
    "requests are executed correctly with fromEffectTagged",
    Effect.fnUntraced(function*() {
      const { allNames } = yield* makeUserResolverTagged
      const names = yield* allNames
      const count = yield* Counter
      expect(count.count).toEqual(3)
      expect(names.length).toBeGreaterThan(2)
      expect(names).toEqual(userIds.map((id) => userNames.get(id)))
    }, provideEnv)
  )

  it.effect("fromEffectTagged preserves typed errors", () =>
    Effect.gen(function*() {
      const resolver = Resolver.fromEffectTagged<GetNameById>()({
        GetNameById: () => Effect.fail("missing")
      })
      const error = yield* Effect.flip(Effect.request(new GetNameById({ id: 1 }), resolver))

      assert.strictEqual(error, "missing")
    }))

  it.effect("fromEffectTagged preserves defects", () =>
    Effect.gen(function*() {
      const defect = new Error("boom")
      const resolver = Resolver.fromEffectTagged<GetNameById>()({
        GetNameById: () => Effect.die(defect)
      })
      const exit = yield* Effect.exit(Effect.request(new GetNameById({ id: 1 }), resolver))

      assert.isTrue(Exit.isFailure(exit))
      if (Exit.isFailure(exit)) {
        assert.strictEqual(exit.cause.reasons.length, 1)
        const reason = exit.cause.reasons[0]
        assert.isTrue(Cause.isDieReason(reason))
        if (Cause.isDieReason(reason)) {
          assert.strictEqual(reason.defect, defect)
        }
      }
    }))

  it.effect("fromEffectTagged preserves interrupts", () =>
    Effect.gen(function*() {
      const resolver = Resolver.fromEffectTagged<GetNameById>()({
        GetNameById: () => Effect.interrupt
      })
      const exit = yield* Effect.exit(Effect.request(new GetNameById({ id: 1 }), resolver))

      assert.isTrue(Exit.hasInterrupts(exit))
    }))

  it.effect.each([
    { name: "array", make: (values: Array<string>) => values },
    { name: "array iterator", make: (values: Array<string>) => values.values() },
    {
      name: "generator",
      make: (values: Array<string>) =>
        (function*() {
          yield* values
        })()
    }
  ])("fromEffectTagged resolves requests from $name results", ({ make }) =>
    Effect.gen(function*() {
      const resolver = Resolver.fromEffectTagged<GetNameById>()({
        GetNameById: (requests) => Effect.succeed(make(requests.map(({ request }) => String(request.id))))
      })
      const names = yield* Effect.forEach(
        [1, 2, 3],
        (id) => Effect.request(new GetNameById({ id }), resolver),
        { concurrency: "unbounded" }
      )

      assert.deepStrictEqual(names, ["1", "2", "3"])
    }))

  it.effect(
    "requests don't break interruption",
    Effect.fnUntraced(
      function*() {
        const { getNames } = yield* makeUserResolver
        const fiber = yield* Effect.forkChild(getNames)
        yield* Effect.yieldNow
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)
        expect(exit._tag).toEqual("Failure")
        if (exit._tag === "Failure") {
          expect(Cause.hasInterruptsOnly(exit.cause)).toEqual(true)
        }
        expect(yield* Counter).toEqual({ count: 0 })
        expect(yield* Interrupts).toEqual({ interrupts: 1 })
      },
      provideEnv,
      Effect.provideService(Interrupts, { interrupts: 0 })
    )
  )

  it.effect(
    "requests work with uninterruptible",
    Effect.fnUntraced(
      function*() {
        const { getNames } = yield* makeUserResolver
        const fiber = yield* Effect.forkChild(Effect.uninterruptible(getNames))
        yield* Effect.yieldNow
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)
        expect(exit._tag).toEqual("Failure")
        if (exit._tag === "Failure") {
          expect(Cause.hasInterruptsOnly(exit.cause)).toEqual(true)
        }
        expect(yield* Counter).toEqual({ count: 3 })
        expect(yield* Interrupts).toEqual({ interrupts: 0 })
      },
      provideEnv,
      Effect.provideService(Interrupts, { interrupts: 0 })
    )
  )

  it.effect(
    "grouped requests can be interrupted before execution",
    Effect.fnUntraced(function*() {
      let resolverExecuted = false

      const resolver = Resolver.make<GetNameById>(Effect.fnUntraced(function*(entries) {
        resolverExecuted = true
        for (const entry of entries) {
          entry.completeUnsafe(Exit.succeed(userNames.get(entry.request.id)!))
        }
      })).pipe(
        Resolver.grouped(({ request }) => request.id),
        Resolver.setDelayEffect(Effect.never)
      )

      const fiber = yield* Effect.forkChild(Effect.request(new GetNameById({ id: userIds[0] }), resolver))
      yield* Effect.yieldNow
      yield* Fiber.interrupt(fiber)
      const exit = yield* Fiber.await(fiber)

      assert.strictEqual(exit._tag, "Failure")
      if (exit._tag === "Failure") {
        assert.strictEqual(Cause.hasInterruptsOnly(exit.cause), true)
      }
      assert.strictEqual(resolverExecuted, false)
    })
  )

  for (const cached of [false, true]) {
    it.effect(`repro: cancelling a pending batch does not poison ${cached ? "cached" : "uncached"} requests`, () =>
      Effect.gen(function*() {
        const gate = yield* Deferred.make<void>()
        const base = Resolver.make<GetNameById>((entries) =>
          Effect.sync(() => {
            for (const entry of entries) entry.completeUnsafe(Exit.succeed("Alice"))
          })
        ).pipe(Resolver.setDelayEffect(Deferred.await(gate)))
        const resolver = cached ? yield* Resolver.withCache(base, { capacity: 10 }) : base
        const request = new GetNameById({ id: 1 })

        const first = yield* Effect.request(request, resolver).pipe(Effect.forkChild({ startImmediately: true }))
        yield* Fiber.interrupt(first)
        const next = yield* Effect.request(request, resolver).pipe(Effect.forkChild({ startImmediately: true }))

        // Allow execution only after cancelling the first batch and retrying.
        yield* Deferred.succeed(gate, undefined)
        yield* Effect.yieldNow
        const exit = next.pollUnsafe()
        yield* Fiber.interrupt(next)

        assert.deepStrictEqual(exit, Exit.succeed("Alice"))
      }))
  }

  it.effect("withCache removes cancelled entries from a surviving batch", () =>
    Effect.gen(function*() {
      const gate = yield* Deferred.make<void>()
      const batches: Array<Array<number>> = []
      const resolver = yield* Resolver.make<GetNameById>((entries) =>
        Effect.sync(() => {
          batches.push(entries.map((entry) => entry.request.id))
          for (const entry of entries) entry.completeUnsafe(Exit.succeed(String(entry.request.id)))
        })
      ).pipe(
        Resolver.setDelayEffect(Effect.andThen(Effect.yieldNow, Deferred.await(gate))),
        Resolver.withCache({ capacity: 10 })
      )
      const first = yield* Effect.request(new GetNameById({ id: 1 }), resolver).pipe(
        Effect.forkChild({ startImmediately: true })
      )
      const other = yield* Effect.request(new GetNameById({ id: 2 }), resolver).pipe(
        Effect.forkChild({ startImmediately: true })
      )
      yield* Fiber.interrupt(first)
      yield* Deferred.succeed(gate, undefined)
      yield* Effect.yieldNow
      assert.deepStrictEqual(other.pollUnsafe(), Exit.succeed("2"))
      assert.deepStrictEqual(batches, [[2]])

      const retry = yield* Effect.request(new GetNameById({ id: 1 }), resolver).pipe(
        Effect.forkChild({ startImmediately: true })
      )
      yield* Effect.yieldNow
      assert.deepStrictEqual(retry.pollUnsafe(), Exit.succeed("1"))
      assert.deepStrictEqual(batches, [[2], [1]])
    }))

  for (const cancelFirst of [false, true]) {
    it.effect(`withCache preserves coalesced requests when the ${cancelFirst ? "first" : "second"} caller cancels`, () =>
      Effect.gen(function*() {
        const gate = yield* Deferred.make<void>()
        const batches: Array<number> = []
        const resolver = yield* Resolver.make<GetNameById>((entries) =>
          Effect.sync(() => {
            batches.push(entries.length)
            for (const entry of entries) entry.completeUnsafe(Exit.succeed("Alice"))
          })
        ).pipe(Resolver.setDelayEffect(Deferred.await(gate)), Resolver.withCache({ capacity: 10 }))
        const first = yield* Effect.request(new GetNameById({ id: 1 }), resolver).pipe(
          Effect.forkChild({ startImmediately: true })
        )
        const second = yield* Effect.request(new GetNameById({ id: 1 }), resolver).pipe(
          Effect.forkChild({ startImmediately: true })
        )
        const cancelled = cancelFirst ? first : second
        const remaining = cancelFirst ? second : first
        yield* Fiber.interrupt(cancelled)
        assert.isTrue(Exit.hasInterrupts(yield* Fiber.await(cancelled)))
        assert.deepStrictEqual(batches, [])
        yield* Deferred.succeed(gate, undefined)
        yield* Effect.yieldNow

        assert.deepStrictEqual(remaining.pollUnsafe(), Exit.succeed("Alice"))
        assert.strictEqual(yield* Effect.request(new GetNameById({ id: 1 }), resolver), "Alice")
        assert.deepStrictEqual(batches, [1])
      }))
  }

  it.effect("withCache still caches completed failures", () =>
    Effect.gen(function*() {
      let calls = 0
      const resolver = yield* Resolver.make<GetNameById>((entries) =>
        Effect.sync(() => {
          calls++
          for (const entry of entries) entry.completeUnsafe(Exit.fail("Not Found"))
        })
      ).pipe(Resolver.withCache({ capacity: 10 }))

      for (let i = 0; i < 2; i++) {
        assert.deepStrictEqual(
          yield* Effect.exit(Effect.request(new GetNameById({ id: 1 }), resolver)),
          Exit.fail("Not Found")
        )
      }
      assert.strictEqual(calls, 1)
    }))

  it.effect("withCache does not cache interrupted resolver results", () =>
    Effect.gen(function*() {
      let calls = 0
      const resolver = yield* Resolver.make<GetNameById>((entries) =>
        Effect.sync(() => {
          calls++
          for (const entry of entries) {
            entry.completeUnsafe(calls === 1 ? Exit.interrupt() : Exit.succeed("Alice"))
          }
        })
      ).pipe(Resolver.withCache({ capacity: 10 }))

      assert.isTrue(Exit.hasInterrupts(yield* Effect.exit(Effect.request(new GetNameById({ id: 1 }), resolver))))
      assert.strictEqual(yield* Effect.request(new GetNameById({ id: 1 }), resolver), "Alice")
      assert.strictEqual(calls, 2)
    }))

  it.effect("withCache cancellation does not evict a replacement entry", () =>
    Effect.gen(function*() {
      const gate = yield* Deferred.make<void>()
      const batches: Array<Array<number>> = []
      let delays = 0
      const resolver = yield* Resolver.make<GetNameById>((entries) =>
        Effect.sync(() => {
          batches.push(entries.map((entry) => entry.request.id))
          for (const entry of entries) entry.completeUnsafe(Exit.succeed("Alice"))
        })
      ).pipe(
        Resolver.grouped(({ request }) => request.id),
        Resolver.setDelayEffect(Effect.suspend(() => ++delays === 1 ? Deferred.await(gate) : Effect.yieldNow)),
        Resolver.withCache({ capacity: 1 })
      )
      const first = yield* Effect.request(new GetNameById({ id: 1 }), resolver).pipe(
        Effect.forkChild({ startImmediately: true })
      )
      yield* Effect.yieldNow
      // Completing another group evicts the first entry while its batch is still pending.
      yield* Effect.request(new GetNameById({ id: 2 }), resolver)
      yield* Effect.yieldNow
      const replacement = yield* Effect.request(new GetNameById({ id: 1 }), resolver).pipe(
        Effect.forkChild({ startImmediately: true })
      )
      yield* Fiber.interrupt(first)
      const coalesced = yield* Effect.request(new GetNameById({ id: 1 }), resolver).pipe(
        Effect.forkChild({ startImmediately: true })
      )
      yield* Deferred.succeed(gate, undefined)
      yield* Effect.yieldNow

      assert.deepStrictEqual(replacement.pollUnsafe(), Exit.succeed("Alice"))
      assert.deepStrictEqual(coalesced.pollUnsafe(), Exit.succeed("Alice"))
      assert.deepStrictEqual(batches, [[2], [1]])
    }))

  it.effect("withCache allows an equal retry from the cancelled delay's finalizer", () =>
    Effect.gen(function*() {
      const gate = yield* Deferred.make<void>()
      const context = yield* Effect.context<never>()
      const results: Array<Request.Result<GetNameById>> = []
      const batches: Array<number> = []
      let cancelledCallbacks = 0
      let finalizers = 0
      const resolver = yield* Resolver.make<GetNameById>((entries) =>
        Effect.sync(() => {
          batches.push(entries.length)
          for (const entry of entries) entry.completeUnsafe(Exit.succeed("Alice"))
        })
      ).pipe(
        Resolver.setDelayEffect(
          Deferred.await(gate).pipe(
            Effect.onInterrupt(() =>
              Effect.sync(() => {
                finalizers++
                Effect.requestUnsafe(new GetNameById({ id: 1 }), {
                  resolver,
                  context,
                  onExit: (exit) => results.push(exit)
                })
              })
            )
          )
        ),
        Resolver.withCache({ capacity: 10 })
      )
      const cancel = Effect.requestUnsafe(new GetNameById({ id: 1 }), {
        resolver,
        context,
        onExit: () => cancelledCallbacks++
      })
      cancel()
      assert.strictEqual(finalizers, 1)
      assert.deepStrictEqual(results, [])
      cancel()
      yield* Deferred.succeed(gate, undefined)
      yield* Effect.yieldNow

      assert.strictEqual(cancelledCallbacks, 0)
      assert.strictEqual(finalizers, 1)
      assert.deepStrictEqual(results, [Exit.succeed("Alice")])
      assert.deepStrictEqual(batches, [1])
    }))

  it.effect("withCache preserves the race winner when the losing resolver is interrupted", () =>
    Effect.gen(function*() {
      const finished = yield* Deferred.make<void>()
      let calls = 0
      let interruptions = 0
      const fast = Resolver.fromEffect<GetNameById>(() =>
        Effect.andThen(
          Effect.yieldNow,
          Effect.sync(() => {
            calls++
            return "Alice"
          })
        )
      )
      const slow = Resolver.fromEffect<GetNameById>(() =>
        Effect.never.pipe(Effect.onInterrupt(() =>
          Effect.sync(() => {
            interruptions++
          })
        ))
      )
      const resolver = yield* Resolver.race(fast, slow).pipe(
        Resolver.around(() => Effect.void, () => Deferred.succeed(finished, undefined)),
        Resolver.withCache({ capacity: 10 })
      )

      assert.strictEqual(yield* Effect.request(new GetNameById({ id: 1 }), resolver), "Alice")
      // Wait for the losing resolver's interruption before reading the cache again.
      yield* Deferred.await(finished)
      assert.strictEqual(interruptions, 1)
      assert.deepStrictEqual(
        yield* Effect.exit(Effect.request(new GetNameById({ id: 1 }), resolver)),
        Exit.succeed("Alice")
      )
      assert.strictEqual(calls, 1)
    }))

  it.effect("withCache accepts refreshed results from stale-while-revalidate", () =>
    Effect.gen(function*() {
      class GetName extends Persistable.Class()("GetName", {
        primaryKey: () => "name",
        success: Schema.String
      }) {}
      const store = yield* (yield* Persistence.Persistence).make({ storeId: "names" })
      yield* store.set(new GetName(), Exit.succeed("Alice"))
      const finished = yield* Deferred.make<void>()
      let calls = 0
      const persisted = yield* Resolver.fromFunction<GetName>(() => {
        calls++
        return "Bob"
      }).pipe(Resolver.persisted({ storeId: "names", staleWhileRevalidate: () => true }))
      const resolver = yield* persisted.pipe(
        Resolver.around(() => Effect.void, () => Deferred.succeed(finished, undefined)),
        Resolver.withCache({ capacity: 10 })
      )

      assert.strictEqual(yield* Effect.request(new GetName(), resolver), "Alice")
      yield* Deferred.await(finished)
      assert.strictEqual(yield* Effect.request(new GetName(), resolver), "Bob")
      assert.strictEqual(calls, 1)
    }).pipe(Effect.provide(Persistence.layerMemory)))

  it.effect("persisted propagates failures to unfinished requests", () =>
    Effect.gen(function*() {
      class GetValue extends Persistable.Class<{ payload: { id: number } }>()("GetValue", {
        primaryKey: ({ id }) => String(id),
        success: Schema.String,
        error: Persistence.PersistenceError
      }) {}
      const request = new GetValue({ id: 1 })
      const error = new Persistence.PersistenceError({ message: "backend failed" })
      const resolver = Resolver.make<GetValue>((entries) => {
        entries[0].completeUnsafe(Exit.succeed("first"))
        return Effect.fail(error)
      })
      const persisted = yield* Resolver.persisted(resolver, { storeId: "resolver-failure" })

      assert.deepStrictEqual(
        yield* Effect.forEach(
          [request, request, new GetValue({ id: 2 })],
          (request) => Effect.exit(Effect.request(request, persisted)),
          { concurrency: "unbounded" }
        ),
        [Exit.succeed("first"), Exit.fail(error), Exit.fail(error)]
      )
    }).pipe(Effect.provide(Persistence.layerMemory)))

  it.effect("persisted stores synchronous resolver failures", () =>
    Effect.gen(function*() {
      class GetValue extends Persistable.Class()("ThrowingValue", {
        primaryKey: () => "value",
        success: Schema.String
      }) {}
      let calls = 0
      const resolver = Resolver.make<GetValue>(() => {
        calls++
        throw "backend defect"
      })
      const persisted = yield* Resolver.persisted(resolver, { storeId: "resolver-throw" })
      const request = new GetValue()

      assert.deepStrictEqual(yield* Effect.exit(Effect.request(request, persisted)), Exit.die("backend defect"))
      assert.deepStrictEqual(yield* Effect.exit(Effect.request(request, persisted)), Exit.die("backend defect"))
      assert.strictEqual(calls, 1)
    }).pipe(Effect.provide(Persistence.layerMemory)))

  it.effect(
    "batching preserves individual & identical requests",
    Effect.fnUntraced(function*() {
      const { getNameById } = yield* makeUserResolver
      yield* Effect.all([getNameById(userIds[0]), getNameById(userIds[0])], {
        concurrency: "unbounded",
        discard: true
      })
      const requests = yield* Requests
      const invocations = yield* Counter
      expect(requests.count).toEqual(2)
      expect(invocations.count).toEqual(1)
    }, provideEnv)
  )

  it.effect(
    "grouped requests + batchN",
    Effect.fnUntraced(function*() {
      let count = 0
      let requestsCount = 0

      class Key extends Data.Class<{ id: number }> {}

      const resolver = Resolver.make<GetNameById>(Effect.fnUntraced(function*(entries) {
        count++
        requestsCount += entries.length
        for (const entry of entries) {
          entry.completeUnsafe(Exit.succeed(userNames.get(entry.request.id)!))
        }
      })).pipe(
        Resolver.batchN(5),
        Resolver.grouped(({ request }) => new Key({ id: request.id % 2 }))
      )

      yield* Effect.forEach(userIds, (id) => Effect.request(new GetNameById({ id }), resolver), {
        concurrency: "unbounded"
      })

      expect(count).toEqual(6)
      expect(requestsCount).toEqual(26)
    })
  )

  it.effect("batchN normalizes the maximum batch size", () =>
    Effect.gen(function*() {
      const sizes = yield* Effect.forEach([Number.NaN, -1, 0, 0.5, 1.9, 2.9], (n) =>
        Effect.gen(function*() {
          const batchSizes: Array<number> = []
          const resolver = Resolver.make<GetNameById>((entries) =>
            Effect.sync(() => {
              batchSizes.push(entries.length)
              for (const entry of entries) {
                entry.completeUnsafe(Exit.succeed(String(entry.request.id)))
              }
            })
          ).pipe(Resolver.batchN(n))

          yield* Effect.forEach([1, 2, 3], (id) => Effect.request(new GetNameById({ id }), resolver), {
            concurrency: "unbounded"
          })
          return batchSizes
        }))

      assert.deepStrictEqual(sizes, [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
        [2, 1]
      ])
    }))

  it.effect(
    "batch fibers use request services for runAll",
    Effect.fnUntraced(function*() {
      const resolver = Resolver.make<GetRequestService>(Effect.fnUntraced(function*(entries) {
        const value = (yield* RequestService).value
        for (const entry of entries) {
          entry.completeUnsafe(Exit.succeed(value))
        }
      })).pipe(Resolver.batchN(1))

      const value = yield* Effect.request(GetRequestService(), resolver).pipe(
        Effect.provideService(RequestService, { value: "provided" })
      )

      assert.strictEqual(value, "provided")
    })
  )

  it.effect(
    "batch fibers use request services for delay effects",
    Effect.fnUntraced(function*() {
      let delayServiceValue = ""

      const resolver = Resolver.make<GetRequestService>((entries) =>
        Effect.sync(() => {
          for (const entry of entries) {
            entry.completeUnsafe(Exit.succeed("ok"))
          }
        })
      ).pipe(
        Resolver.setDelayEffect(
          Effect.andThen(
            Effect.yieldNow,
            Effect.gen(function*() {
              delayServiceValue = (yield* RequestService).value
            })
          )
        )
      )

      yield* Effect.request(GetRequestService(), resolver).pipe(
        Effect.provideService(RequestService, { value: "provided" })
      )

      assert.strictEqual(delayServiceValue, "provided")
    })
  )
})
