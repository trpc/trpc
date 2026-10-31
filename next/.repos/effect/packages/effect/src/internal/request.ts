import type { NonEmptyArray } from "../Array.ts"
import * as Context from "../Context.ts"
import type { Effect } from "../Effect.ts"
import type { Exit } from "../Exit.ts"
import type { Fiber } from "../Fiber.ts"
import { dual } from "../Function.ts"
import * as MutableHashMap from "../MutableHashMap.ts"
import * as Option from "../Option.ts"
import type * as Request from "../Request.ts"
import { makeEntry } from "../Request.ts"
import type { RequestResolver } from "../RequestResolver.ts"
import { Scheduler } from "../Scheduler.ts"
import { exitDie, isEffect, withFiber } from "./core.ts"
import * as effect from "./effect.ts"

/** @internal */
export const request: {
  <A extends Request.Any, EX = never, RX = never>(
    resolver: RequestResolver<A> | Effect<RequestResolver<A>, EX, RX>
  ): (self: A) => Effect<
    Request.Success<A>,
    Request.Error<A> | EX,
    Request.Services<A> | RX
  >
  <A extends Request.Any, EX = never, RX = never>(
    self: A,
    resolver: RequestResolver<A> | Effect<RequestResolver<A>, EX, RX>
  ): Effect<
    Request.Success<A>,
    Request.Error<A> | EX,
    Request.Services<A> | RX
  >
} = dual(
  2,
  <A extends Request.Any, EX = never, RX = never>(
    self: A,
    resolver: RequestResolver<A> | Effect<RequestResolver<A>, EX, RX>
  ): Effect<
    Request.Success<A>,
    Request.Error<A> | EX,
    Request.Services<A> | RX
  > => {
    const withResolver = (resolver: RequestResolver<A>) =>
      effect.callback<
        Request.Success<A>,
        Request.Error<A>,
        Request.Services<A>
      >((resume) => {
        const entry = addEntry(resolver, self, resume, effect.getCurrentFiber()!)
        return maybeRemoveEntry(resolver, entry)
      })
    return isEffect(resolver) ? effect.flatMap(resolver, withResolver) : withResolver(resolver)
  }
)

/** @internal */
export const requestUnsafe = <A extends Request.Any>(
  self: A,
  options: {
    readonly resolver: RequestResolver<A>
    readonly onExit: (exit: Exit<Request.Success<A>, Request.Error<A>>) => void
    readonly context: Context.Context<never>
  }
): () => void => {
  const entry = addEntry(options.resolver, self, options.onExit, {
    context: options.context,
    cache: { scheduler: Context.get(options.context, Scheduler) }
  })
  return () => removeEntryUnsafe(options.resolver, entry)
}

/**
 * Pending batches of resolvers whose `batchKey` is in this set match keys with
 * `Equal` instead of by reference.
 *
 * @internal
 */
export const equalBatchKeys = new WeakSet<Function>()

interface BatchMap {
  get(key: unknown): Batch | undefined
  has(key: unknown): boolean
  set(key: unknown, batch: Batch): void
  delete(key: unknown): void
}

const makeBatchMap = (resolver: RequestResolver<any>): BatchMap => {
  if (!equalBatchKeys.has(resolver.batchKey)) return new Map()
  const map = MutableHashMap.empty<unknown, Batch>()
  return {
    get: (key) => Option.getOrUndefined(MutableHashMap.get(map, key)),
    has: (key) => MutableHashMap.has(map, key),
    set: (key, batch) => MutableHashMap.set(map, key, batch),
    delete: (key) => MutableHashMap.remove(map, key)
  }
}

interface Batch {
  readonly key: unknown
  readonly context: Context.Context<never>
  readonly resolver: RequestResolver<any>
  readonly map: BatchMap
  readonly entrySet: Set<Request.Entry<any>>
  readonly entries: Set<Request.Entry<any>>
  readonly delayEffect: Effect<void>
  readonly run: Effect<void, unknown>
  fiber?: Fiber<unknown, unknown> | undefined
}

const pendingBatches = new WeakMap<RequestResolver<any>, BatchMap>()

// Batches are built outside `addEntry` so their callbacks do not share a closure
// context with per-request entries, which would keep completed requests alive.
const makeBatch = (
  key: unknown,
  context: Context.Context<never>,
  resolver: RequestResolver<any>,
  map: BatchMap
): Batch => {
  const batch: Batch = {
    key,
    context,
    resolver,
    map,
    entrySet: new Set(),
    entries: new Set(),
    delayEffect: effect.flatMap(
      withFiber((delayFiber) => {
        // Reentrant delay callbacks may fill the batch and interrupt this fiber.
        batch.fiber = delayFiber
        return batch.resolver.delay
      }),
      (_) => runBatch(batch)
    ) as Effect<void>,
    run: effect.onExit(
      effect.suspend(() =>
        batch.resolver.runAll(Array.from(batch.entries) as NonEmptyArray<Request.Entry<any>>, batch.key)
      ),
      (exit) => {
        for (const entry of batch.entrySet) {
          entry.completeUnsafe(
            exit._tag === "Success"
              ? exitDie(
                new Error("Effect.request: RequestResolver did not complete request", { cause: entry.request })
              )
              : exit
          )
        }
        batch.entries.clear()
        return effect.void
      }
    )
  }
  return batch
}

const addEntry = <A extends Request.Any>(
  resolver: RequestResolver<A>,
  request: A,
  resume: (exit: Exit<any, any>) => void,
  fiber: {
    readonly context: Context.Context<never>
    readonly cache: { readonly scheduler: Scheduler }
    readonly id?: number
  }
) => {
  let batchMap = pendingBatches.get(resolver)
  if (!batchMap) {
    batchMap = makeBatchMap(resolver)
    pendingBatches.set(resolver, batchMap)
  }
  let batch: Batch | undefined
  let completed = false
  const entry = makeEntry({
    request,
    context: fiber.context as any,
    uninterruptible: false,
    completeUnsafe(effect) {
      if (completed) return
      completed = true
      // Removed entries still notify resolver hooks, but not their cancelled callers.
      if (batch && !batch.entrySet.delete(entry)) return
      resume(effect)
    }
  })
  if (resolver.preCheck !== undefined && !resolver.preCheck(entry)) {
    return entry
  }
  const key = resolver.batchKey(entry)
  batch = batchMap.get(key)
  const isNewBatch = batch === undefined
  if (!batch) {
    batch = makeBatch(key, fiber.context, resolver, batchMap)
    batchMap.set(key, batch)
  }

  batch.entrySet.add(entry)
  batch.entries.add(entry)
  if (isNewBatch) {
    const delayFiber = effect.runForkWith(fiber.context)(batch.delayEffect, { scheduler: fiber.cache.scheduler })
    // A synchronous delay may have already run this batch.
    if (completed || batchMap.get(key) !== batch) return entry
    batch.fiber = delayFiber
  }

  if (batch.resolver.collectWhile(batch.entries)) return entry

  batch.fiber!.interruptUnsafe(fiber.id)
  effect.runForkWith(batch.context)(runBatch(batch), { scheduler: Context.get(batch.context, Scheduler) })
  return entry
}

const removeEntryUnsafe = <A extends Request.Any>(
  resolver: RequestResolver<A>,
  entry: Request.Entry<A>
) => {
  if (entry.uninterruptible) return
  const batchMap = pendingBatches.get(resolver)
  if (!batchMap) return
  const key = resolver.batchKey(entry)
  const batch = batchMap.get(key)
  if (!batch) return

  if (!batch.entries.delete(entry)) return
  batch.entrySet.delete(entry)

  let fiber: Fiber<unknown, unknown> | undefined
  if (batch.entries.size === 0) {
    batchMap.delete(key)
    fiber = batch.fiber
  }
  // Delay finalizers may enqueue new requests, so complete the removed entry first.
  entry.completeUnsafe(effect.exitInterrupt())
  fiber?.interruptUnsafe()
}

const maybeRemoveEntry = <A extends Request.Any>(
  resolver: RequestResolver<A>,
  entry: Request.Entry<A>
) => effect.sync(() => removeEntryUnsafe(resolver, entry))

function runBatch(batch: Batch) {
  if (!batch.map.has(batch.key)) return effect.void
  batch.map.delete(batch.key)
  return batch.run
}
