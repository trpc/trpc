import { afterAll, assert, beforeAll, beforeEach, describe, it, vi } from "@effect/vitest"
import { Effect, Layer } from "effect"

const pendingReleases: Array<Promise<void>> = []

// Drain the real timers even when a broken adapter abandons a finalizer.
afterAll(() => Promise.all(pendingReleases))

// The release takes real time: the TestClock is not advanced once a test has timed out.
const resource = (events: Array<string>, name: string) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      events.push(`${name}:acquired`)
    }),
    () =>
      Effect.promise(() => {
        events.push(`${name}:release:start`)
        const pending = new Promise<void>((resolve) =>
          setTimeout(() => {
            events.push(`${name}:release:end`)
            resolve()
          }, 250)
        )
        pendingReleases.push(pending)
        return pending
      })
  )

for (const mode of ["effect", "live"] as const) {
  describe(`it.${mode} timeout finalizers`, { concurrent: false }, () => {
    const events: Array<string> = []
    let signal: AbortSignal | undefined

    it[mode].fails("times out while holding a resource", (ctx) =>
      Effect.gen(function*() {
        signal = ctx.signal
        yield* resource(events, "test")
        return yield* Effect.never
      }), { timeout: 75 })

    it("awaits the finalizer before starting the next test", () => {
      events.push("next:start")
      assert.isTrue(signal?.aborted)
      assert.deepStrictEqual(events, ["test:acquired", "test:release:start", "test:release:end", "next:start"])
    })
  })
}

describe("it.effect timeout finalizer defects", { concurrent: false }, () => {
  const logged: Array<string> = []
  const collect = (...args: Array<unknown>) => {
    logged.push(args.map(String).join(" "))
  }
  // The default logger writes to console.log, or console.error when logging to stderr.
  beforeAll(() => {
    vi.spyOn(console, "log").mockImplementation(collect)
    vi.spyOn(console, "error").mockImplementation(collect)
  })
  afterAll(() => vi.restoreAllMocks())

  it.effect.fails("times out while a finalizer dies", () =>
    Effect.gen(function*() {
      yield* Effect.addFinalizer(() => Effect.die(new Error("finalizer failed")))
      return yield* Effect.never
    }), { timeout: 75 })

  it("reports the finalizer defect", () => {
    assert.isTrue(logged.some((line) => line.includes("finalizer failed")))
  })
})

describe("beforeEach timeout finalizers", { concurrent: false }, () => {
  const events: Array<string> = []

  describe("hook", () => {
    beforeEach(() =>
      Effect.gen(function*() {
        yield* resource(events, "hook")
        return yield* Effect.never
      }), 75)

    it.fails("times out while holding a resource", () => {})
  })

  it("awaits the finalizer before starting the next test", () => {
    events.push("next:start")
    assert.deepStrictEqual(events, ["hook:acquired", "hook:release:start", "hook:release:end", "next:start"])
  })
})

describe("beforeEach teardown timeout finalizers", { concurrent: false }, () => {
  const events: Array<string> = []

  describe("hook", () => {
    beforeEach(() => resource(events, "hook"), 75)

    it.fails("times out while releasing the resource", () => {})
  })

  it("awaits the finalizer before starting the next test", () => {
    events.push("next:start")
    assert.deepStrictEqual(events, ["hook:acquired", "hook:release:start", "hook:release:end", "next:start"])
  })
})

// Vitest fails a suite whose beforeAll fails, so accept the expected error.
// The suite is the second argument; Vitest requires the first to be destructured.
const expectBeforeAllFailure = (message: string) =>
  // oxlint-disable-next-line no-empty-pattern
  afterAll(({}, suite) => {
    assert.include(suite.result?.errors?.map((error) => error.message).join("\n"), message)
    suite.result!.state = "pass"
    suite.result!.errors = []
  })

describe("beforeAll failure finalizers", { concurrent: false }, () => {
  const events: Array<string> = []

  describe("failing hook", () => {
    beforeAll(() => resource(events, "failed").pipe(Effect.andThen(Effect.fail(new Error("boom")))))
    expectBeforeAllFailure("boom")

    it("is skipped", () => {})
  })

  // The hook's timeout also bounds the disposal, so it must fit the release.
  describe("hook succeeding after its timeout", () => {
    beforeAll(() => resource(events, "late").pipe(Effect.andThen(Effect.sleep(500))), 400)
    expectBeforeAllFailure("timed out")

    it("is skipped", () => {})
  })

  describe("hook succeeding after its timeout, before the cleanups", () => {
    // Delays the cleanups until the setup has succeeded and Vitest has dropped its cleanup.
    afterAll(() => new Promise((resolve) => setTimeout(resolve, 150)))
    beforeAll(() => resource(events, "dropped").pipe(Effect.andThen(Effect.sleep(500))), 400)
    expectBeforeAllFailure("timed out")

    it("is skipped", () => {})
  })

  it("awaits the finalizers before starting the next test", () => {
    events.push("next:start")
    assert.deepStrictEqual(events, [
      "failed:acquired",
      "failed:release:start",
      "failed:release:end",
      "late:acquired",
      "late:release:start",
      "late:release:end",
      "dropped:acquired",
      "dropped:release:start",
      "dropped:release:end",
      "next:start"
    ])
  })
})

// Registers hooks while the default hook timeout is shorter than the release.
const withShortDefaultHookTimeout = (register: () => void) => {
  vi.setConfig({ hookTimeout: 100 })
  register()
  vi.resetConfig()
}

for (const hooks of ["stack", "list", "parallel"] as const) {
  describe(`beforeAll teardown with ${hooks} hooks`, { concurrent: false }, () => {
    const events: Array<string> = []

    // Vitest reads the hook order when it runs hooks and cleanups.
    beforeAll(() => vi.setConfig({ sequence: { hooks } }))
    afterAll(() => vi.resetConfig())

    describe("hook followed by an earlier afterAll", () => {
      afterAll(() => {
        events.push("afterAll")
      })
      beforeAll(() => resource(events, "ordered").pipe(Effect.as(() => events.push("ordered:cleanup"))))

      it("uses the resource", () => {})
    })

    describe("hook with a timeout longer than the default", () => {
      withShortDefaultHookTimeout(() => beforeAll(() => resource(events, "explicit"), 1000))

      it("uses the resource", () => {})
    })

    describe("hook whose nested tests skip at runtime", () => {
      withShortDefaultHookTimeout(() => beforeAll(() => resource(events, "skipped"), 1000))

      describe("nested", () => {
        it("skips at runtime", (ctx) => ctx.skip())
      })
    })

    describe("hook followed by a failing beforeAll", () => {
      withShortDefaultHookTimeout(() => beforeAll(() => resource(events, "kept"), 1000))
      beforeAll(() => {
        throw new Error("later setup failed")
      })
      expectBeforeAllFailure("later setup failed")

      it("is skipped", () => {})
    })

    it("releases after the suite's afterAll hooks, within the hook's timeout", () => {
      events.push("next:start")
      assert.deepStrictEqual(events, [
        "ordered:acquired",
        "afterAll",
        "ordered:cleanup",
        "ordered:release:start",
        "ordered:release:end",
        "explicit:acquired",
        "explicit:release:start",
        "explicit:release:end",
        "skipped:acquired",
        "skipped:release:start",
        "skipped:release:end",
        "kept:acquired",
        "kept:release:start",
        "kept:release:end",
        "next:start"
      ])
    })
  })
}

describe("it.effect timeout retry finalizers", { concurrent: false }, () => {
  const events: Array<string> = []
  const abortedAtStart: Array<boolean> = []
  let attempts = 0

  it.effect("retries after timing out while holding a resource", (ctx) => {
    const attempt = ++attempts
    abortedAtStart.push(ctx.signal.aborted)
    if (attempt === 2) {
      // The retry inherits an aborted signal. Keep its assertion uninterruptible.
      return Effect.sync(() => {
        events.push("retry:start")
        assert.deepStrictEqual(events, [
          "attempt1:acquired",
          "attempt1:release:start",
          "attempt1:release:end",
          "retry:start"
        ])
      }).pipe(Effect.uninterruptible)
    }
    return Effect.gen(function*() {
      yield* resource(events, "attempt1")
      return yield* Effect.never
    })
  }, { timeout: 75, retry: 1 })

  it("completes a genuine retry before starting the next test", () => {
    events.push("next:start")
    assert.strictEqual(attempts, 2)
    // Vitest reuses the signal aborted by the first attempt's timeout.
    assert.deepStrictEqual(abortedAtStart, [false, true])
    assert.deepStrictEqual(events, [
      "attempt1:acquired",
      "attempt1:release:start",
      "attempt1:release:end",
      "retry:start",
      "next:start"
    ])
  })
})

describe("it.layer timeout finalizers", { concurrent: false, retry: 0, repeats: 0 }, () => {
  const events: Array<string> = []
  let signal: AbortSignal | undefined

  it.layer(Layer.effectDiscard(resource(events, "layer")))((it) => {
    it.effect.fails("times out in the last test using the layer", (ctx) =>
      Effect.gen(function*() {
        signal = ctx.signal
        yield* resource(events, "test")
        return yield* Effect.never
      }), { timeout: 75 })
  })

  it("awaits both test and layer finalizers before starting the next test", () => {
    events.push("next:start")
    assert.isTrue(signal?.aborted)
    assert.deepStrictEqual(events, [
      "layer:acquired",
      "test:acquired",
      "test:release:start",
      "test:release:end",
      "layer:release:start",
      "layer:release:end",
      "next:start"
    ])
  })
})
