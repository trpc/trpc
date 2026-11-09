import { Effect, Exit, Pool, Scope } from "effect"
import { Bench } from "tinybench"

const poolSize = 10
let nextItem = 0

const acquire = Effect.sync(() => ++nextItem)
const getAll = (pool: Pool.Pool<number>) =>
  Effect.all(
    Array.from({ length: poolSize }, () => Pool.get(pool)),
    { concurrency: "unbounded", discard: true }
  )

const makeFixed = Effect.scoped(
  Effect.flatMap(
    Pool.make({ acquire, size: poolSize }),
    getAll
  )
)

const makeWithTTL = Effect.scoped(
  Effect.flatMap(
    Pool.makeWithTTL({
      acquire,
      min: 0,
      max: poolSize,
      timeToLive: "1 minute"
    }),
    getAll
  )
)

const poolScope = await Effect.runPromise(Scope.make())
const fixedPool = await Effect.runPromise(
  Pool.make({ acquire, size: poolSize }).pipe(Scope.provide(poolScope))
)
const ttlPool = await Effect.runPromise(
  Pool.makeWithTTL({
    acquire,
    min: 0,
    max: poolSize,
    timeToLive: "1 minute"
  }).pipe(Scope.provide(poolScope))
)
const invalidationPool = await Effect.runPromise(
  Pool.make({ acquire, size: 1 }).pipe(Scope.provide(poolScope))
)

await Effect.runPromise(Effect.scoped(Effect.all([getAll(fixedPool), getAll(ttlPool)], { discard: true })))

let invalidationItem = await Effect.runPromise(Effect.scoped(Pool.get(invalidationPool)))
const invalidateAndReplace = Effect.scoped(
  Effect.gen(function*() {
    yield* Pool.invalidate(invalidationPool, invalidationItem)
    invalidationItem = yield* Pool.get(invalidationPool)
  })
)

const bench = new Bench()

const useItem = (item: number) => Effect.succeed(item)

bench
  .add("make fixed pool (10 items)", () => Effect.runPromise(makeFixed))
  .add("make TTL pool (10 items)", () => Effect.runPromise(makeWithTTL))
  .add("get and release (fixed pool)", () => Effect.runPromise(Effect.scoped(Pool.get(fixedPool))))
  .add("get and release (TTL pool)", () => Effect.runPromise(Effect.scoped(Pool.get(ttlPool))))
  .add("use (fixed pool)", () => Effect.runPromise(Pool.use(fixedPool, useItem)))
  .add("use (TTL pool)", () => Effect.runPromise(Pool.use(ttlPool, useItem)))
  .add("get and release (10 concurrent)", () => Effect.runPromise(Effect.scoped(getAll(fixedPool))))
  .add("invalidate and replace", () => Effect.runPromise(invalidateAndReplace))

await bench.run()
await Effect.runPromise(Scope.close(poolScope, Exit.void))

console.table(bench.table())
