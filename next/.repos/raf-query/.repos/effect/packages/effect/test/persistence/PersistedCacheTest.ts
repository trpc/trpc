import { assert, it } from "@effect/vitest"
import type { Vitest } from "@effect/vitest"
import type { Duration, Layer } from "effect"
import { Context, Data, Effect, Exit, Schema } from "effect"
import { Persistable, PersistedCache, Persistence } from "effect/persistence"

class User extends Schema.Class<User>("User")({
  id: Schema.Number,
  name: Schema.String
}) {}

class TTLRequest extends Persistable.Class<{
  payload: { id: number }
}>()("TTLRequest", {
  primaryKey: (req) => `TTLRequest:${req.id}`,
  success: User,
  error: Schema.String
}) {}

export class TransientError extends Data.TaggedError("TransientError") {}

class LookupService extends Context.Service<LookupService, { readonly value: string }>()("LookupService") {}

export const suiteWith = <R>(
  storeId: string,
  layer: Layer.Layer<Persistence.Persistence, unknown, R>,
  testApi: Vitest.MethodsNonLive<R>,
  timeout: Duration.Input = "60 seconds"
) =>
  testApi.layer(layer, { timeout })(`PersistedCache (${storeId})`, (it) => {
    it.effect("smoke test", () =>
      Effect.gen(function*() {
        const persistence = yield* Persistence.Persistence
        const store = yield* persistence.make({ storeId: "users" })
        let invocations = 0
        let cache = yield* PersistedCache.make((req: TTLRequest) =>
          Effect.sync(() => {
            invocations++
            return new User({ id: req.id, name: "John" })
          }), {
          storeId: "users",
          timeToLive: () => 5000
        })
        const user = yield* cache.get(new TTLRequest({ id: 1 }))
        assert.deepStrictEqual(user, new User({ id: 1, name: "John" }))
        assert.deepStrictEqual(
          yield* store.get(new TTLRequest({ id: 1 })),
          Exit.succeed(new User({ id: 1, name: "John" }))
        )
        assert.strictEqual(invocations, 1)
        assert.deepStrictEqual(yield* cache.get(new TTLRequest({ id: 1 })), new User({ id: 1, name: "John" }))
        assert.strictEqual(invocations, 1)

        cache = yield* PersistedCache.make((req: TTLRequest) =>
          Effect.sync(() => {
            invocations++
            return new User({ id: req.id, name: "John" })
          }), {
          storeId: "users",
          timeToLive: (_req, _exit) => 5000
        })
        assert.deepStrictEqual(yield* cache.get(new TTLRequest({ id: 1 })), new User({ id: 1, name: "John" }))
        assert.strictEqual(invocations, 1)

        yield* store.setMany([
          [new TTLRequest({ id: 1 }), Exit.fail("Not found")],
          [new TTLRequest({ id: 2 }), Exit.succeed(new User({ id: 2, name: "Jane" }))]
        ])
        const results = yield* store.getMany([new TTLRequest({ id: 1 }), new TTLRequest({ id: 2 })])
        assert.deepStrictEqual(results, [
          Exit.fail("Not found"),
          Exit.succeed(new User({ id: 2, name: "Jane" }))
        ])
      }), 30_000)

    it.effect("requireServicesAt: 'lookup' requires lookup services at get-time", () =>
      Effect.gen(function*() {
        const cache = yield* PersistedCache.make(
          (req: TTLRequest) => Effect.map(LookupService, (service) => new User({ id: req.id, name: service.value })),
          {
            storeId: `${storeId}-require-services-at`,
            timeToLive: () => 5000,
            requireServicesAt: "lookup"
          }
        )

        const result1 = yield* cache.get(new TTLRequest({ id: 1 })).pipe(
          Effect.provideService(LookupService, LookupService.of({ value: "first" }))
        )
        const result2 = yield* cache.get(new TTLRequest({ id: 2 })).pipe(
          Effect.provideService(LookupService, LookupService.of({ value: "second" }))
        )
        const result3 = yield* cache.get(new TTLRequest({ id: 1 })).pipe(
          Effect.provideService(LookupService, LookupService.of({ value: "third" }))
        )

        assert.deepStrictEqual(result1, new User({ id: 1, name: "first" }))
        assert.deepStrictEqual(result2, new User({ id: 2, name: "second" }))
        assert.deepStrictEqual(result3, new User({ id: 1, name: "first" }))
      }), 30_000)
  })

export const suite = (storeId: string, layer: Layer.Layer<Persistence.Persistence, unknown>) =>
  suiteWith(storeId, layer, it)
