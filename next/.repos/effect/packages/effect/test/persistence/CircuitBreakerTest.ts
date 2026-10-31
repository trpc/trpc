import { assert, it } from "@effect/vitest"
import { Cause, Deferred, Duration, Effect, Exit, Fiber, type Layer, Result, Schedule, Stream } from "effect"
import { CircuitBreaker } from "effect/persistence"

/**
 * Moves the store's notion of "now" forward. Memory stores pass
 * `TestClock.adjust`, stores that read wall time pass a live sleep.
 */
export type Advance = (duration: Duration.Input) => Effect.Effect<void>

export const rejection = Effect.fnUntraced(function*<A, E, R>(
  effect: Effect.Effect<A, E | CircuitBreaker.CircuitBreakerError, R>
) {
  const error = yield* Effect.flip(effect).pipe(
    Effect.catch(() => Effect.sync(() => assert.fail("Expected a rejection, but the call was admitted")))
  )
  return error instanceof CircuitBreaker.CircuitBreakerError
    ? error.reason
    : assert.fail("Expected CircuitBreakerError")
})

/**
 * Starts a call that is admitted and then waits for `gate` before
 * completing with `result`.
 */
export const held = Effect.fnUntraced(function*<E>(
  breaker: CircuitBreaker.CircuitBreaker,
  key: string,
  result: Effect.Effect<void, E>,
  options?: { readonly classify?: (exit: Exit.Exit<void, E>) => CircuitBreaker.Outcome }
) {
  const started = yield* Deferred.make<void>()
  const gate = yield* Deferred.make<void>()
  const fiber = yield* Deferred.succeed(started, undefined).pipe(
    Effect.andThen(Deferred.await(gate)),
    Effect.andThen(result),
    breaker.execute({ key, classify: options?.classify }),
    Effect.forkChild
  )
  yield* Deferred.await(started)
  return {
    fiber,
    release: Deferred.succeed(gate, undefined).pipe(Effect.andThen(Fiber.await(fiber)))
  } as const
})

export const fail = (breaker: CircuitBreaker.CircuitBreaker, key: string) =>
  Effect.fail("boom").pipe(breaker.execute({ key }), Effect.ignore)

/**
 * Collects the `retryAfter` millis and `consecutiveOpenings` of the next
 * `take` openings.
 */
const openings = (breaker: CircuitBreaker.CircuitBreaker, take: number) =>
  breaker.transitions.pipe(
    Stream.filterMap((transition) =>
      transition.to === "Open"
        ? Result.succeed([Duration.toMillis(transition.retryAfter), transition.consecutiveOpenings] as const)
        : Result.failVoid
    ),
    Stream.take(take),
    Stream.runCollect,
    Effect.forkChild({ startImmediately: true })
  )

export const suite = (
  name: string,
  layer: (options?: {
    readonly idleTimeToLive?: Duration.Input | undefined
  }) => Layer.Layer<CircuitBreaker.CircuitBreakerStore, unknown>,
  advance: Advance
) => {
  // Sequential, because the tests share one TestClock under the memory store.
  it.layer(layer(), { timeout: "30 seconds", concurrent: false })(`CircuitBreaker (${name})`, (it) => {
    it.effect("consecutive: only a Success resets the streak, and the n-th failure opens without running the call", () =>
      Effect.scoped(Effect.gen(function*() {
        const key = "consecutive"
        const breaker = yield* CircuitBreaker.make({
          tripPolicy: CircuitBreaker.consecutive(3),
          openDuration: "1 minute"
        })
        yield* fail(breaker, key)
        yield* fail(breaker, key)
        yield* Effect.void.pipe(breaker.execute({ key }))
        yield* fail(breaker, key)
        yield* fail(breaker, key)
        yield* Effect.fail("boom").pipe(
          breaker.execute({ key, classify: () => CircuitBreaker.ignored }),
          Effect.ignore
        )
        assert.strictEqual((yield* breaker.state(key))._tag, "Closed")

        yield* fail(breaker, key)
        let ran = false
        const reason = yield* rejection(
          Effect.sync(() => {
            ran = true
          }).pipe(breaker.execute({ key }))
        )

        assert.isFalse(ran)
        assert.strictEqual(reason._tag === "CircuitOpen" && reason.key, key)
      })))

    it.effect("rate: Ignored outcomes never count, and a Success can trip once minimumCalls are recorded", () =>
      Effect.scoped(Effect.gen(function*() {
        const key = "rate"
        const breaker = yield* CircuitBreaker.make({
          tripPolicy: CircuitBreaker.rate({ threshold: 0.5, size: 3, minimumCalls: 3 }),
          openDuration: "1 minute"
        })
        yield* fail(breaker, key)
        yield* Effect.fail("boom").pipe(breaker.execute({ key, classify: () => CircuitBreaker.ignored }), Effect.ignore)
        yield* fail(breaker, key)
        assert.strictEqual((yield* breaker.state(key))._tag, "Closed")

        // 2 failures in 3 calls. The opening lasts openDuration, so the next
        // call is rejected rather than admitted as a probe.
        yield* Effect.void.pipe(breaker.execute({ key }))
        assert.strictEqual((yield* rejection(Effect.void.pipe(breaker.execute({ key }))))._tag, "CircuitOpen")
      })))

    it.effect("half-open admits one probe, rejects the rest, and a success closes", () =>
      Effect.scoped(Effect.gen(function*() {
        const key = "half-open"
        const breaker = yield* CircuitBreaker.make({
          tripPolicy: CircuitBreaker.consecutive(1),
          openDuration: "200 millis"
        })
        const transitions = yield* breaker.transitions.pipe(
          Stream.take(3),
          Stream.runCollect,
          Effect.forkChild({ startImmediately: true })
        )
        yield* fail(breaker, key)
        yield* advance("300 millis")
        const lazy = yield* breaker.state(key)
        assert.strictEqual(lazy._tag, "Open")
        assert.deepStrictEqual(lazy._tag === "Open" && lazy.retryAfter, Duration.zero)

        const probe = yield* held(breaker, key, Effect.void)
        assert.strictEqual((yield* rejection(Effect.void.pipe(breaker.execute({ key }))))._tag, "CircuitHalfOpen")
        assert.deepStrictEqual(yield* breaker.state(key), {
          _tag: "HalfOpen",
          key,
          probing: true,
          consecutiveOpenings: 1
        })

        assert.isTrue(Exit.isSuccess(yield* probe.release))
        assert.deepStrictEqual(yield* breaker.state(key), { _tag: "Closed", key })
        const [opened, ...rest] = yield* Fiber.join(transitions)
        assert.strictEqual(opened.from, "Closed")
        assert.strictEqual(opened.to, "Open")
        assert.strictEqual(opened.to === "Open" && opened.consecutiveOpenings, 1)
        assert.deepStrictEqual(rest, [
          { key, from: "Open", to: "HalfOpen" },
          { key, from: "HalfOpen", to: "Closed" }
        ])
      })))

    it.effect(
      "a Schedule openDuration replays across openings, carries over a close shorter than the last opening, and resets once the circuit has stayed closed that long",
      () =>
        Effect.scoped(Effect.gen(function*() {
          const key = "schedule"
          const breaker = yield* CircuitBreaker.make({
            tripPolicy: CircuitBreaker.consecutive(2),
            openDuration: Schedule.exponential("200 millis")
          })
          const collected = yield* openings(breaker, 4)
          yield* fail(breaker, key)
          yield* fail(breaker, key)
          yield* advance("300 millis")
          // A failed probe reopens without consulting the trip policy.
          yield* fail(breaker, key)
          const reopened = yield* breaker.state(key)
          assert.strictEqual(reopened._tag === "Open" && reopened.consecutiveOpenings, 2)

          yield* advance("300 millis")
          assert.strictEqual((yield* rejection(Effect.void.pipe(breaker.execute({ key }))))._tag, "CircuitOpen")
          yield* advance("200 millis")
          yield* Effect.void.pipe(breaker.execute({ key }))
          assert.strictEqual((yield* breaker.state(key))._tag, "Closed")

          // Closed for less than the last 400 millis opening.
          yield* fail(breaker, key)
          yield* fail(breaker, key)
          yield* advance("900 millis")
          yield* Effect.void.pipe(breaker.execute({ key }))
          // Closed for the whole of the last 800 millis opening.
          yield* advance("800 millis")
          yield* fail(breaker, key)
          yield* fail(breaker, key)

          assert.deepStrictEqual(yield* Fiber.join(collected), [[200, 1], [400, 2], [800, 3], [200, 1]])
        }))
    )

    it.effect("a call admitted before the reset deadline opens with its older count after a later admit resets it", () =>
      Effect.scoped(Effect.gen(function*() {
        const key = "reset-race"
        const breaker = yield* CircuitBreaker.make({
          tripPolicy: CircuitBreaker.consecutive(1),
          openDuration: Schedule.exponential("200 millis")
        })
        const collected = yield* openings(breaker, 2)
        yield* fail(breaker, key)
        yield* advance("300 millis")
        yield* Effect.void.pipe(breaker.execute({ key }))
        const stale = yield* held(breaker, key, Effect.fail("boom"))
        yield* advance("300 millis")
        yield* Effect.void.pipe(breaker.execute({ key }))
        yield* stale.release

        // The stale call computed its openFor from a count of 2, while the
        // store restarted its count at 1.
        assert.deepStrictEqual((yield* Fiber.join(collected))[1], [400, 1])
      })))

    it.effect("a Schedule openDuration replays from the recording time and repeats its last delay once it ends", () =>
      Effect.scoped(Effect.gen(function*() {
        const key = "schedule-elapsed"
        const breaker = yield* CircuitBreaker.make({
          tripPolicy: CircuitBreaker.consecutive(1),
          openDuration: Schedule.exponential("100 millis").pipe(Schedule.upTo({ duration: "250 millis" }))
        })
        const collected = yield* openings(breaker, 4)
        yield* fail(breaker, key)
        // Each gap exceeds the 250 millis cap, so a replay that saw wall time
        // would end the schedule at step 2 and repeat 100 millis.
        for (let i = 0; i < 3; i++) {
          yield* advance("400 millis")
          yield* fail(breaker, key)
        }

        assert.deepStrictEqual((yield* Fiber.join(collected)).map(([millis]) => millis), [100, 200, 200, 200])
      })))

    it.effect("a Retry-After hint lengthens only the opening it causes and its reset window, capped at maxOpenDuration", () =>
      Effect.scoped(Effect.gen(function*() {
        const key = "hint"
        const breaker = yield* CircuitBreaker.make({
          tripPolicy: CircuitBreaker.consecutive(1),
          openDuration: "200 millis",
          maxOpenDuration: "600 millis"
        })
        yield* Effect.fail("boom").pipe(
          breaker.execute({ key, classify: () => CircuitBreaker.failure({ retryAfter: "1 hour" }) }),
          Effect.ignore
        )
        yield* advance("300 millis")
        assert.strictEqual((yield* rejection(Effect.void.pipe(breaker.execute({ key }))))._tag, "CircuitOpen")
        yield* advance("400 millis")
        yield* Effect.void.pipe(breaker.execute({ key }))

        // Closed past openDuration, but not for the 600 millis the hinted
        // opening lasted, so the count carries over.
        yield* advance("300 millis")
        yield* fail(breaker, key)
        const reopened = yield* breaker.state(key)
        assert.strictEqual(reopened._tag === "Open" && reopened.consecutiveOpenings, 2)

        // Without a hint, the opening lasts openDuration.
        yield* advance("300 millis")
        yield* Effect.void.pipe(breaker.execute({ key }))
        assert.strictEqual((yield* breaker.state(key))._tag, "Closed")
      })))

    it.effect("an interrupt-only exit records Ignored and an interrupted probe frees its slot", () =>
      Effect.scoped(Effect.gen(function*() {
        const key = "interrupt"
        const breaker = yield* CircuitBreaker.make({
          tripPolicy: CircuitBreaker.consecutive(1),
          openDuration: "200 millis"
        })
        const classify = () => CircuitBreaker.failure()
        yield* Effect.failCause(Cause.interrupt()).pipe(breaker.execute({ key, classify }), Effect.exit)
        assert.strictEqual((yield* breaker.state(key))._tag, "Closed")

        yield* fail(breaker, key)
        yield* advance("300 millis")
        const probe = yield* held(breaker, key, Effect.void, { classify })
        yield* Fiber.interrupt(probe.fiber)
        assert.deepStrictEqual(yield* breaker.state(key), {
          _tag: "HalfOpen",
          key,
          probing: false,
          consecutiveOpenings: 1
        })

        // Interrupting the probe while it classifies also frees the slot.
        const classifying = yield* Deferred.make<void>()
        const classifyingProbe = yield* Effect.void.pipe(
          breaker.execute({
            key,
            classify: () => Deferred.succeed(classifying, undefined).pipe(Effect.andThen(Effect.never))
          }),
          Effect.forkChild
        )
        yield* Deferred.await(classifying)
        yield* Fiber.interrupt(classifyingProbe)
        const released = yield* breaker.state(key)
        assert.strictEqual(released._tag === "HalfOpen" && released.probing, false)

        yield* Effect.void.pipe(breaker.execute({ key }))
        assert.strictEqual((yield* breaker.state(key))._tag, "Closed")
      })))

    it.effect("a stale outcome changes nothing, while another key's current permit still counts", () =>
      Effect.scoped(Effect.gen(function*() {
        const a = "stale-a"
        const b = "stale-b"
        const breaker = yield* CircuitBreaker.make({
          tripPolicy: CircuitBreaker.consecutive(1),
          openDuration: "200 millis"
        })
        const staleA = yield* held(breaker, a, Effect.void)
        const currentB = yield* held(breaker, b, Effect.fail("boom"))

        yield* fail(breaker, a)
        yield* advance("300 millis")
        const probe = yield* held(breaker, a, Effect.fail("boom"))

        assert.isTrue(Exit.isSuccess(yield* staleA.release))
        assert.isTrue(Exit.isFailure(yield* currentB.release))
        const halfOpen = yield* breaker.state(a)
        assert.strictEqual(halfOpen._tag === "HalfOpen" && halfOpen.probing, true)
        assert.strictEqual((yield* breaker.state(b))._tag, "Open")

        yield* probe.release
        const reopened = yield* breaker.state(a)
        assert.strictEqual(reopened._tag === "Open" && reopened.consecutiveOpenings, 2)
      })))

    it.effect("onRejection allow runs a refused call unrecorded, while an admitted call records and can take the probe", () =>
      Effect.scoped(Effect.gen(function*() {
        const key = "allow"
        const breaker = yield* CircuitBreaker.make({
          tripPolicy: CircuitBreaker.consecutive(1),
          openDuration: "200 millis"
        })
        assert.strictEqual(
          yield* Effect.flip(Effect.fail("boom").pipe(breaker.execute({ key, onRejection: "allow" }))),
          "boom"
        )
        assert.strictEqual((yield* breaker.state(key))._tag, "Open")

        assert.strictEqual((yield* rejection(Effect.void.pipe(breaker.execute({ key }))))._tag, "CircuitOpen")
        let ran = false
        const value = yield* Effect.sync(() => {
          ran = true
          return 1
        }).pipe(breaker.execute({ key, onRejection: "allow" }))
        assert.isTrue(ran)
        assert.strictEqual(value, 1)

        // Another call owns the probe, so the allowed failure cannot reopen.
        yield* advance("300 millis")
        const probe = yield* held(breaker, key, Effect.void)
        assert.strictEqual(
          yield* Effect.flip(Effect.fail("boom").pipe(breaker.execute({ key, onRejection: "allow" }))),
          "boom"
        )
        assert.deepStrictEqual(yield* breaker.state(key), {
          _tag: "HalfOpen",
          key,
          probing: true,
          consecutiveOpenings: 1
        })
        assert.isTrue(Exit.isSuccess(yield* probe.release))
        assert.deepStrictEqual(yield* breaker.state(key), { _tag: "Closed", key })

        // With the probe slot free, the allowed call is the probe.
        yield* fail(breaker, key)
        yield* advance("300 millis")
        yield* Effect.void.pipe(breaker.execute({ key, onRejection: "allow" }))
        assert.deepStrictEqual(yield* breaker.state(key), { _tag: "Closed", key })
      })))

    // Short enough for live-time stores to run.
    it.layer(layer({ idleTimeToLive: "400 millis" }))((it) => {
      it.effect("idle expiry drops a key before a longer reset window ends and its next admit starts at count 0", () =>
        Effect.scoped(Effect.gen(function*() {
          const key = "idle-reset"
          const breaker = yield* CircuitBreaker.make({
            tripPolicy: CircuitBreaker.consecutive(1),
            openDuration: "200 millis"
          })
          yield* Effect.fail("boom").pipe(
            breaker.execute({ key, classify: () => CircuitBreaker.failure({ retryAfter: "1 second" }) }),
            Effect.ignore
          )
          yield* advance("1100 millis")
          yield* Effect.void.pipe(breaker.execute({ key }))
          yield* advance("500 millis")
          yield* fail(breaker, key)

          const state = yield* breaker.state(key)
          assert.strictEqual(state._tag === "Open" && state.consecutiveOpenings, 1)
        })))

      it.effect("an Open key outlives idleTimeToLive until its open time ends, so the backoff count survives", () =>
        Effect.scoped(Effect.gen(function*() {
          const key = "idle-open"
          const breaker = yield* CircuitBreaker.make({
            tripPolicy: CircuitBreaker.consecutive(1),
            openDuration: "800 millis"
          })
          yield* fail(breaker, key)
          yield* advance("600 millis")
          const open = yield* breaker.state(key)
          assert.strictEqual(open._tag === "Open" && open.consecutiveOpenings, 1)

          // Past the open time, so the failed probe is the second opening.
          yield* advance("300 millis")
          yield* fail(breaker, key)
          const reopened = yield* breaker.state(key)
          assert.strictEqual(reopened._tag === "Open" && reopened.consecutiveOpenings, 2)
        })))
    })
  })
}
