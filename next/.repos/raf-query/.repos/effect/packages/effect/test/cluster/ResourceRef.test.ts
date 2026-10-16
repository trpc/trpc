import { assert, it } from "@effect/vitest"
import { Deferred, Effect, Exit, Fiber, Scope } from "effect"
import { EntityAddress, EntityId, EntityType, ShardId } from "effect/cluster"
import { isActive } from "effect/cluster/internal/interruptors"
import { ResourceRef } from "effect/cluster/internal/resourceRef"

// A gate signals `reached` and then waits for `open`.
const makeGate = Effect.fnUntraced(function*() {
  const gate = { reached: yield* Deferred.make<void>(), open: yield* Deferred.make<void>() }
  return gate
})
type Gate = Effect.Success<ReturnType<typeof makeGate>>
const pass = (gate: Gate) => Effect.andThen(Deferred.succeed(gate.reached, void 0), Deferred.await(gate.open))

// Acquires 1, 2, 3, ... An acquisition listed in `gated` waits at its gate
// before completing; the release of one listed in `gatedRelease` waits at its
// gate too.
const makeAcquire = Effect.fnUntraced(function*(options?: {
  readonly gated?: ReadonlyArray<number>
  readonly gatedRelease?: ReadonlyArray<number>
}) {
  let acquisitions = 0
  let completed = 0
  let releases = 0
  const gates = new Map<number, Gate>()
  const releaseGates = new Map<number, Gate>()
  for (const acquisition of options?.gated ?? []) gates.set(acquisition, yield* makeGate())
  for (const acquisition of options?.gatedRelease ?? []) releaseGates.set(acquisition, yield* makeGate())
  const acquire = (scope: Scope.Scope) =>
    Effect.gen(function*() {
      const acquisition = ++acquisitions
      const releaseGate = releaseGates.get(acquisition)
      yield* Scope.addFinalizer(
        scope,
        Effect.andThen(releaseGate ? pass(releaseGate) : Effect.void, Effect.sync(() => releases++))
      )
      const gate = gates.get(acquisition)
      if (gate) yield* pass(gate)
      completed++
      return acquisition
    })
  return {
    acquire,
    gate: (acquisition: number) => gates.get(acquisition)!,
    releaseGate: (acquisition: number) => releaseGates.get(acquisition)!,
    acquisitions: () => acquisitions,
    /** Acquisitions that made it past their gate. */
    completed: () => completed,
    releases: () => releases
  } as const
})

// Lets forked fibers run until they block.
const settle = Effect.gen(function*() {
  for (let i = 0; i < 10; i++) yield* Effect.yieldNow
})

it.effect("rebuilds only the current generation", () =>
  Effect.gen(function*() {
    const parentScope = yield* Scope.make()
    const { acquire } = yield* makeAcquire()
    const ref = yield* ResourceRef.from(parentScope, acquire)
    assert.strictEqual(ref.getUnsafe(), 1)

    yield* ref.rebuildUnsafe({ from: 1 })!
    assert.strictEqual(ref.getUnsafe(), 2)
    // A replaced value can never replace its successor.
    assert.isUndefined(ref.rebuildUnsafe({ from: 1 }))

    // Without `from`, an idle ref is rebuilt.
    yield* ref.rebuildUnsafe()!
    assert.strictEqual(ref.getUnsafe(), 3)
    assert.isUndefined(ref.rebuildUnsafe({ from: 2 }))

    yield* Scope.close(parentScope, Exit.void)
    assert.isUndefined(ref.getUnsafe())
    assert.isUndefined(ref.rebuildUnsafe({ from: 3 }))
    assert.isUndefined(ref.rebuildUnsafe())
    assert.isTrue(Exit.hasInterrupts(yield* Effect.exit(ref.await)))
  }))

it.effect("refuses a second rebuild of a generation without disturbing the accepted one", () =>
  Effect.scoped(Effect.gen(function*() {
    const parentScope = yield* Effect.scope
    const { acquire, gate } = yield* makeAcquire({ gated: [2] })
    const ref = yield* ResourceRef.from(parentScope, acquire)

    const accepted = ref.rebuildUnsafe({ from: 1 })
    assert.isDefined(accepted)
    // Admission closes as soon as the rebuild is accepted, before it runs.
    assert.isUndefined(ref.getUnsafe())
    assert.isUndefined(ref.rebuildUnsafe({ from: 1 }))
    assert.isUndefined(ref.rebuildUnsafe())

    const rebuild = yield* Effect.forkChild(accepted!)
    yield* Deferred.await(gate(2).reached)
    assert.isUndefined(ref.rebuildUnsafe({ from: 1 }))
    assert.isUndefined(ref.rebuildUnsafe())

    yield* Deferred.succeed(gate(2).open, void 0)
    assert.deepStrictEqual(yield* Fiber.await(rebuild), Exit.void)
    assert.strictEqual(ref.getUnsafe(), 2)
    assert.strictEqual(yield* ref.await, 2)
  })))

it.effect("interrupts prepare when its generation is replaced", () =>
  Effect.scoped(Effect.gen(function*() {
    const parentScope = yield* Effect.scope
    const { acquire } = yield* makeAcquire()
    const ref = yield* ResourceRef.from(parentScope, acquire)
    let newer: Effect.Effect<void> | undefined
    let finishedPreparing = false

    const superseded = yield* Effect.forkChild(
      ref.rebuildUnsafe({
        from: 1,
        // Replaces the value being prepared, as a replayed request that defects does.
        prepare: (value) =>
          Effect.gen(function*() {
            newer = ref.rebuildUnsafe({ from: value })
            yield* Effect.yieldNow
            finishedPreparing = true
          })
      })!
    )
    assert.isTrue(Exit.hasInterrupts(yield* Fiber.await(superseded)))
    assert.isFalse(finishedPreparing, "prepare must be interrupted")
    assert.isDefined(newer)

    // The superseded value is never admitted.
    const waiter = yield* Effect.forkChild(ref.await)
    yield* Effect.yieldNow
    assert.isUndefined(ref.getUnsafe())
    assert.isUndefined(waiter.pollUnsafe())

    yield* newer!
    assert.strictEqual(yield* Fiber.join(waiter), 3)
    assert.strictEqual(ref.getUnsafe(), 3)
  })))

it.effect("closes a replaced generation whose rebuild never ran when the ref closes", () =>
  Effect.gen(function*() {
    const parentScope = yield* Scope.make()
    const { acquire, acquisitions, releases } = yield* makeAcquire()
    const ref = yield* ResourceRef.from(parentScope, acquire)

    const rebuild = ref.rebuildUnsafe({ from: 1 })
    assert.isDefined(rebuild)
    const waiter = yield* Effect.forkChild(ref.await)
    yield* Effect.yieldNow

    yield* Scope.close(parentScope, Exit.void)
    assert.strictEqual(releases(), 1, "the replaced generation must be closed")
    assert.isTrue(Exit.hasInterrupts(yield* Fiber.await(waiter)))

    // Running the abandoned rebuild afterwards acquires nothing.
    assert.isTrue(Exit.hasInterrupts(yield* Effect.exit(rebuild!)))
    assert.strictEqual(acquisitions(), 1)
  }))

it.effect("does not leak teardown membership when a rebuild is discarded", () =>
  Effect.gen(function*() {
    const parentScope = yield* Scope.make()
    const address = EntityAddress.make({
      shardId: ShardId.make("resource-ref-discard", 1),
      entityType: EntityType.make("ResourceRefDiscard"),
      entityId: EntityId.make("1")
    })
    const { acquire } = yield* makeAcquire()
    const ref = yield* ResourceRef.from(parentScope, acquire, address)
    assert.isDefined(ref.rebuildUnsafe({ from: 1 }))
    assert.isFalse(isActive(address))
    yield* Scope.close(parentScope, Exit.void)
    assert.isFalse(isActive(address))
  }))

it.effect("does not leak teardown membership when a rebuild is interrupted", () =>
  Effect.scoped(Effect.gen(function*() {
    const parentScope = yield* Effect.scope
    const address = EntityAddress.make({
      shardId: ShardId.make("resource-ref-interrupt", 1),
      entityType: EntityType.make("ResourceRefInterrupt"),
      entityId: EntityId.make("1")
    })
    const { acquire, releaseGate } = yield* makeAcquire({ gatedRelease: [1] })
    const ref = yield* ResourceRef.from(parentScope, acquire, address)
    const fiber = yield* Effect.forkChild(ref.rebuildUnsafe({ from: 1 })!)
    yield* Fiber.interrupt(fiber)
    yield* Deferred.succeed(releaseGate(1).open, void 0)
    assert.isFalse(isActive(address))
  })))

it.effect("stays rebuildable when a failed replacement cannot be released", () =>
  Effect.scoped(Effect.gen(function*() {
    const parentScope = yield* Effect.scope
    // Acquisition 2 holds something whose release hangs, then never completes.
    const { acquire, gate, releaseGate } = yield* makeAcquire({ gated: [2], gatedRelease: [2] })
    const ref = yield* ResourceRef.from(parentScope, acquire)

    yield* Effect.gen(function*() {
      const rebuild = yield* Effect.forkChild(ref.rebuildUnsafe({ from: 1 })!)
      yield* Deferred.await(gate(2).reached)
      // A deadline abandons the rebuild, whose replacement then cannot be released.
      rebuild.interruptUnsafe()
      yield* settle
      assert.isDefined(ref.rebuildUnsafe(), "a hung release must not block the next rebuild")
    }).pipe(Effect.ensuring(Deferred.succeed(releaseGate(2).open, void 0)))
  })))

it.effect("interrupts a rebuild that is acquiring when the ref closes", () =>
  Effect.gen(function*() {
    const parentScope = yield* Scope.make()
    const { acquire, completed, gate } = yield* makeAcquire({ gated: [2] })
    const ref = yield* ResourceRef.from(parentScope, acquire)

    const rebuild = yield* Effect.forkChild(ref.rebuildUnsafe({ from: 1 })!)
    yield* Deferred.await(gate(2).reached)
    const waiter = yield* Effect.forkChild(ref.await)
    yield* Scope.close(parentScope, Exit.void)
    yield* settle
    const exit = rebuild.pollUnsafe()
    assert.isDefined(exit, "closing the ref must interrupt acquisition")
    assert.isTrue(Exit.hasInterrupts(exit))
    assert.isTrue(Exit.hasInterrupts(yield* Fiber.await(waiter)))

    yield* Deferred.succeed(gate(2).open, void 0)
    yield* settle
    assert.strictEqual(completed(), 1, "acquisition must not continue after the close")
  }))
