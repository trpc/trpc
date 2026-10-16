import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit, Fiber, Scope, TxReentrantLock } from "effect"

describe("TxReentrantLock", () => {
  describe("constructors", () => {
    it.effect("make creates an unlocked lock", () =>
      Effect.tx(Effect.gen(function*() {
        const lock = yield* TxReentrantLock.make()
        assert.strictEqual(yield* TxReentrantLock.locked(lock), false)
        assert.strictEqual(yield* TxReentrantLock.readLocked(lock), false)
        assert.strictEqual(yield* TxReentrantLock.writeLocked(lock), false)
        assert.strictEqual(yield* TxReentrantLock.readLocks(lock), 0)
        assert.strictEqual(yield* TxReentrantLock.writeLocks(lock), 0)
      })))
  })

  describe("read lock", () => {
    it.effect("acquireRead and releaseRead work correctly", () =>
      Effect.tx(Effect.gen(function*() {
        const lock = yield* TxReentrantLock.make()
        const count = yield* TxReentrantLock.acquireRead(lock)
        assert.strictEqual(count, 1)
        assert.strictEqual(yield* TxReentrantLock.readLocked(lock), true)
        assert.strictEqual(yield* TxReentrantLock.readLocks(lock), 1)

        const remaining = yield* TxReentrantLock.releaseRead(lock)
        assert.strictEqual(remaining, 0)
        assert.strictEqual(yield* TxReentrantLock.readLocked(lock), false)
      })))

    it.effect("multiple read acquires from same fiber are reentrant", () =>
      Effect.tx(Effect.gen(function*() {
        const lock = yield* TxReentrantLock.make()
        const c1 = yield* TxReentrantLock.acquireRead(lock)
        assert.strictEqual(c1, 1)
        const c2 = yield* TxReentrantLock.acquireRead(lock)
        assert.strictEqual(c2, 2)
        assert.strictEqual(yield* TxReentrantLock.readLocks(lock), 2)

        yield* TxReentrantLock.releaseRead(lock)
        assert.strictEqual(yield* TxReentrantLock.readLocks(lock), 1)
        yield* TxReentrantLock.releaseRead(lock)
        assert.strictEqual(yield* TxReentrantLock.readLocks(lock), 0)
      })))
  })

  describe("write lock", () => {
    it.effect("acquireWrite and releaseWrite work correctly", () =>
      Effect.tx(Effect.gen(function*() {
        const lock = yield* TxReentrantLock.make()
        const count = yield* TxReentrantLock.acquireWrite(lock)
        assert.strictEqual(count, 1)
        assert.strictEqual(yield* TxReentrantLock.writeLocked(lock), true)
        assert.strictEqual(yield* TxReentrantLock.writeLocks(lock), 1)

        const remaining = yield* TxReentrantLock.releaseWrite(lock)
        assert.strictEqual(remaining, 0)
        assert.strictEqual(yield* TxReentrantLock.writeLocked(lock), false)
      })))

    it.effect("multiple write acquires from same fiber are reentrant", () =>
      Effect.tx(Effect.gen(function*() {
        const lock = yield* TxReentrantLock.make()
        const c1 = yield* TxReentrantLock.acquireWrite(lock)
        assert.strictEqual(c1, 1)
        const c2 = yield* TxReentrantLock.acquireWrite(lock)
        assert.strictEqual(c2, 2)
        assert.strictEqual(yield* TxReentrantLock.writeLocks(lock), 2)

        yield* TxReentrantLock.releaseWrite(lock)
        assert.strictEqual(yield* TxReentrantLock.writeLocks(lock), 1)
        yield* TxReentrantLock.releaseWrite(lock)
        assert.strictEqual(yield* TxReentrantLock.writeLocks(lock), 0)
      })))

    it.effect("write lock holder can acquire read lock (reentrancy)", () =>
      Effect.tx(Effect.gen(function*() {
        const lock = yield* TxReentrantLock.make()
        yield* TxReentrantLock.acquireWrite(lock)
        const readCount = yield* TxReentrantLock.acquireRead(lock)
        assert.strictEqual(readCount, 1)
        assert.strictEqual(yield* TxReentrantLock.locked(lock), true)

        yield* TxReentrantLock.releaseRead(lock)
        yield* TxReentrantLock.releaseWrite(lock)
        assert.strictEqual(yield* TxReentrantLock.locked(lock), false)
      })))
  })

  describe("scoped operations", () => {
    it.effect("readLock scoped acquires and releases", () =>
      Effect.gen(function*() {
        const lock = yield* Effect.tx(TxReentrantLock.make())

        yield* Effect.scoped(
          Effect.gen(function*() {
            yield* TxReentrantLock.readLock(lock)
            assert.strictEqual(yield* Effect.tx(TxReentrantLock.readLocked(lock)), true)
          })
        )

        assert.strictEqual(yield* Effect.tx(TxReentrantLock.readLocked(lock)), false)
      }))

    it.effect("writeLock scoped acquires and releases", () =>
      Effect.gen(function*() {
        const lock = yield* Effect.tx(TxReentrantLock.make())

        yield* Effect.scoped(
          Effect.gen(function*() {
            yield* TxReentrantLock.writeLock(lock)
            assert.strictEqual(yield* Effect.tx(TxReentrantLock.writeLocked(lock)), true)
          })
        )

        assert.strictEqual(yield* Effect.tx(TxReentrantLock.writeLocked(lock)), false)
      }))

    it.effect("writeLock can be acquired reentrantly in the same scope", () =>
      Effect.gen(function*() {
        const lock = yield* Effect.tx(TxReentrantLock.make())

        yield* Effect.scoped(
          Effect.gen(function*() {
            yield* TxReentrantLock.writeLock(lock)
            assert.strictEqual(yield* Effect.tx(TxReentrantLock.writeLocked(lock)), true)
          })
        )

        assert.strictEqual(yield* Effect.tx(TxReentrantLock.writeLocked(lock)), false)
      }))
  })

  describe("withLock operations", () => {
    it.effect("withReadLock runs effect and releases", () =>
      Effect.gen(function*() {
        const lock = yield* Effect.tx(TxReentrantLock.make())

        const result = yield* TxReentrantLock.withReadLock(
          lock,
          Effect.gen(function*() {
            assert.strictEqual(yield* Effect.tx(TxReentrantLock.readLocked(lock)), true)
            return "read-result"
          })
        )

        assert.strictEqual(result, "read-result")
        assert.strictEqual(yield* Effect.tx(TxReentrantLock.readLocked(lock)), false)
      }))

    it.effect("withWriteLock runs effect and releases", () =>
      Effect.gen(function*() {
        const lock = yield* Effect.tx(TxReentrantLock.make())

        const result = yield* TxReentrantLock.withWriteLock(
          lock,
          Effect.gen(function*() {
            assert.strictEqual(yield* Effect.tx(TxReentrantLock.writeLocked(lock)), true)
            return "write-result"
          })
        )

        assert.strictEqual(result, "write-result")
        assert.strictEqual(yield* Effect.tx(TxReentrantLock.writeLocked(lock)), false)
      }))

    it.effect("withLock is alias for withWriteLock", () =>
      Effect.gen(function*() {
        const lock = yield* Effect.tx(TxReentrantLock.make())

        const result = yield* TxReentrantLock.withLock(
          lock,
          Effect.gen(function*() {
            assert.strictEqual(yield* Effect.tx(TxReentrantLock.writeLocked(lock)), true)
            return "exclusive"
          })
        )

        assert.strictEqual(result, "exclusive")
        assert.strictEqual(yield* Effect.tx(TxReentrantLock.locked(lock)), false)
      }))

    it.effect("withReadLock releases on failure", () =>
      Effect.gen(function*() {
        const lock = yield* Effect.tx(TxReentrantLock.make())

        const result = yield* Effect.exit(
          TxReentrantLock.withReadLock(
            lock,
            Effect.fail("boom")
          )
        )

        assert.isTrue(Exit.isFailure(result))
        assert.strictEqual(yield* Effect.tx(TxReentrantLock.readLocked(lock)), false)
      }))

    it.effect("withWriteLock releases on failure", () =>
      Effect.gen(function*() {
        const lock = yield* Effect.tx(TxReentrantLock.make())

        const result = yield* Effect.exit(
          TxReentrantLock.withWriteLock(
            lock,
            Effect.fail("boom")
          )
        )

        assert.isTrue(Exit.isFailure(result))
        assert.strictEqual(yield* Effect.tx(TxReentrantLock.writeLocked(lock)), false)
      }))

    it.effect("withReadLock data-last (pipe) style", () =>
      Effect.gen(function*() {
        const lock = yield* Effect.tx(TxReentrantLock.make())

        const result = yield* lock.pipe(
          TxReentrantLock.withReadLock(Effect.succeed("piped"))
        )

        assert.strictEqual(result, "piped")
        assert.strictEqual(yield* Effect.tx(TxReentrantLock.readLocked(lock)), false)
      }))

    it.effect("withWriteLock data-last (pipe) style", () =>
      Effect.gen(function*() {
        const lock = yield* Effect.tx(TxReentrantLock.make())

        const result = yield* lock.pipe(
          TxReentrantLock.withWriteLock(Effect.succeed("piped-write"))
        )

        assert.strictEqual(result, "piped-write")
        assert.strictEqual(yield* Effect.tx(TxReentrantLock.writeLocked(lock)), false)
      }))
  })

  describe("concurrency", () => {
    it.effect("multiple readers can proceed concurrently", () =>
      Effect.gen(function*() {
        const lock = yield* Effect.tx(TxReentrantLock.make())

        const fiber1 = yield* Effect.forkChild(
          TxReentrantLock.withReadLock(lock, Effect.succeed(1))
        )
        const fiber2 = yield* Effect.forkChild(
          TxReentrantLock.withReadLock(lock, Effect.succeed(2))
        )
        const fiber3 = yield* Effect.forkChild(
          TxReentrantLock.withReadLock(lock, Effect.succeed(3))
        )

        const [r1, r2, r3] = yield* Effect.all([
          Fiber.join(fiber1),
          Fiber.join(fiber2),
          Fiber.join(fiber3)
        ])

        assert.strictEqual(r1, 1)
        assert.strictEqual(r2, 2)
        assert.strictEqual(r3, 3)
        assert.strictEqual(yield* Effect.tx(TxReentrantLock.locked(lock)), false)
      }))

    it.effect("writer blocks other writers", () =>
      Effect.gen(function*() {
        const lock = yield* Effect.tx(TxReentrantLock.make())
        const order: Array<string> = []

        yield* Effect.tx(TxReentrantLock.acquireWrite(lock))

        const fiber = yield* Effect.forkChild(
          TxReentrantLock.withWriteLock(
            lock,
            Effect.sync(() => {
              order.push("child-wrote")
            })
          )
        )

        // Child should be blocked because we hold the write lock
        order.push("parent-releasing")
        yield* Effect.tx(TxReentrantLock.releaseWrite(lock))

        yield* Fiber.join(fiber)
        assert.deepStrictEqual(order, ["parent-releasing", "child-wrote"])
        assert.strictEqual(yield* Effect.tx(TxReentrantLock.locked(lock)), false)
      }))

    it.effect("writer blocks readers from other fibers", () =>
      Effect.gen(function*() {
        const lock = yield* Effect.tx(TxReentrantLock.make())
        const order: Array<string> = []

        yield* Effect.tx(TxReentrantLock.acquireWrite(lock))

        const fiber = yield* Effect.forkChild(
          TxReentrantLock.withReadLock(
            lock,
            Effect.sync(() => {
              order.push("child-read")
            })
          )
        )

        order.push("parent-releasing")
        yield* Effect.tx(TxReentrantLock.releaseWrite(lock))

        yield* Fiber.join(fiber)
        assert.deepStrictEqual(order, ["parent-releasing", "child-read"])
        assert.strictEqual(yield* Effect.tx(TxReentrantLock.locked(lock)), false)
      }))

    it.effect("reader blocks writer from another fiber", () =>
      Effect.gen(function*() {
        const lock = yield* Effect.tx(TxReentrantLock.make())
        const order: Array<string> = []

        yield* Effect.tx(TxReentrantLock.acquireRead(lock))

        const fiber = yield* Effect.forkChild(
          TxReentrantLock.withWriteLock(
            lock,
            Effect.sync(() => {
              order.push("child-wrote")
            })
          )
        )

        order.push("parent-releasing")
        yield* Effect.tx(TxReentrantLock.releaseRead(lock))

        yield* Fiber.join(fiber)
        assert.deepStrictEqual(order, ["parent-releasing", "child-wrote"])
        assert.strictEqual(yield* Effect.tx(TxReentrantLock.locked(lock)), false)
      }))
  })

  describe("getters", () => {
    it.effect("readLocks counts total read locks", () =>
      Effect.tx(Effect.gen(function*() {
        const lock = yield* TxReentrantLock.make()
        yield* TxReentrantLock.acquireRead(lock)
        yield* TxReentrantLock.acquireRead(lock)
        assert.strictEqual(yield* TxReentrantLock.readLocks(lock), 2)

        yield* TxReentrantLock.releaseRead(lock)
        assert.strictEqual(yield* TxReentrantLock.readLocks(lock), 1)

        yield* TxReentrantLock.releaseRead(lock)
        assert.strictEqual(yield* TxReentrantLock.readLocks(lock), 0)
      })))

    it.effect("writeLocks counts write lock depth", () =>
      Effect.tx(Effect.gen(function*() {
        const lock = yield* TxReentrantLock.make()
        assert.strictEqual(yield* TxReentrantLock.writeLocks(lock), 0)

        yield* TxReentrantLock.acquireWrite(lock)
        assert.strictEqual(yield* TxReentrantLock.writeLocks(lock), 1)

        yield* TxReentrantLock.acquireWrite(lock)
        assert.strictEqual(yield* TxReentrantLock.writeLocks(lock), 2)

        yield* TxReentrantLock.releaseWrite(lock)
        yield* TxReentrantLock.releaseWrite(lock)
        assert.strictEqual(yield* TxReentrantLock.writeLocks(lock), 0)
      })))

    it.effect("locked returns true when any lock is held", () =>
      Effect.tx(Effect.gen(function*() {
        const lock = yield* TxReentrantLock.make()
        assert.strictEqual(yield* TxReentrantLock.locked(lock), false)

        yield* TxReentrantLock.acquireRead(lock)
        assert.strictEqual(yield* TxReentrantLock.locked(lock), true)
        yield* TxReentrantLock.releaseRead(lock)
        assert.strictEqual(yield* TxReentrantLock.locked(lock), false)

        yield* TxReentrantLock.acquireWrite(lock)
        assert.strictEqual(yield* TxReentrantLock.locked(lock), true)
        yield* TxReentrantLock.releaseWrite(lock)
        assert.strictEqual(yield* TxReentrantLock.locked(lock), false)
      })))
  })

  describe("type guards", () => {
    it.effect("isTxReentrantLock identifies TxReentrantLock instances", () =>
      Effect.tx(Effect.gen(function*() {
        const lock = yield* TxReentrantLock.make()
        assert.isTrue(TxReentrantLock.isTxReentrantLock(lock))
        assert.isFalse(TxReentrantLock.isTxReentrantLock({}))
        assert.isFalse(TxReentrantLock.isTxReentrantLock(null))
        assert.isFalse(TxReentrantLock.isTxReentrantLock(undefined))
      })))
  })

  describe("release without acquire", () => {
    it.effect("releaseRead without acquire returns 0", () =>
      Effect.tx(Effect.gen(function*() {
        const lock = yield* TxReentrantLock.make()
        const result = yield* TxReentrantLock.releaseRead(lock)
        assert.strictEqual(result, 0)
      })))

    it.effect("releaseWrite without acquire returns 0", () =>
      Effect.tx(Effect.gen(function*() {
        const lock = yield* TxReentrantLock.make()
        const result = yield* TxReentrantLock.releaseWrite(lock)
        assert.strictEqual(result, 0)
      })))
  })

  it.effect("releases a scoped read lock when another fiber closes the scope", () =>
    Effect.gen(function*() {
      const lock = yield* TxReentrantLock.make()
      const scope = yield* Scope.make()
      const fiber = yield* TxReentrantLock.readLock(lock).pipe(
        Effect.provideService(Scope.Scope, scope),
        Effect.forkChild
      )
      yield* Fiber.join(fiber)
      yield* Scope.close(scope, Exit.void)
      assert.isFalse(yield* TxReentrantLock.readLocked(lock))
    }))

  it.effect("releases a scoped write lock when another fiber closes the scope", () =>
    Effect.gen(function*() {
      const lock = yield* TxReentrantLock.make()
      const scope = yield* Scope.make()
      const fiber = yield* TxReentrantLock.writeLock(lock).pipe(
        Effect.provideService(Scope.Scope, scope),
        Effect.forkChild
      )
      yield* Fiber.join(fiber)
      yield* Scope.close(scope, Exit.void)
      assert.isFalse(yield* TxReentrantLock.writeLocked(lock))
    }))
})
