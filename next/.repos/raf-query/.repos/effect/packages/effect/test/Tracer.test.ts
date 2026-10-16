import { assert, describe, it } from "@effect/vitest"
import { assertNone, deepStrictEqual, strictEqual } from "@effect/vitest/utils"
import { Cause, Context, Duration, Effect, Exit, Fiber, Layer, Scheduler, Tracer } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { OtlpSerialization, OtlpTracer } from "effect/observability"
import { TestClock } from "effect/testing"
import type { Span } from "effect/Tracer"

const getParent = (span: Tracer.Span): Tracer.AnySpan => {
  if (span.parent._tag === "None") {
    throw new Error("Expected parent span")
  }
  return span.parent.value
}

const otlpTracerLayer = OtlpTracer.layer({
  url: "http://localhost:4318/v1/traces",
  resource: {
    serviceName: "test-service"
  }
}).pipe(
  Layer.provide(OtlpSerialization.layerJson),
  Layer.provide(Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) => Effect.succeed(HttpClientResponse.fromWeb(request, new Response())))
  ))
)

const makeRootAndChildSpans = Effect.gen(function*() {
  const root = yield* Effect.withSpan(Effect.currentSpan, "root")
  const child = yield* Effect.withSpan(Effect.currentSpan, "child", { parent: root })
  return [root, child] as const
})

const assertSpanIdentifiers = (root: Tracer.Span, child: Tracer.Span) => {
  assert.match(root.traceId, /^[0-9a-f]{32}$/)
  assert.match(root.spanId, /^[0-9a-f]{16}$/)
  strictEqual(child.traceId, root.traceId)
  assert.match(child.spanId, /^[0-9a-f]{16}$/)
}

describe("Tracer", () => {
  describe("span identifiers", () => {
    it.effect("generates native span identifiers", () =>
      Effect.gen(function*() {
        const [root, child] = yield* makeRootAndChildSpans
        assertSpanIdentifiers(root, child)
      }))

    it.effect("generates OTLP span identifiers", () =>
      Effect.gen(function*() {
        const [root, child] = yield* makeRootAndChildSpans
        assert.notInstanceOf(root, Tracer.NativeSpan)
        assert.notInstanceOf(child, Tracer.NativeSpan)
        assertSpanIdentifiers(root, child)
      }).pipe(Effect.provide(otlpTracerLayer)))
  })

  describe("Effect.withSpan", () => {
    it.effect("should capture the stack trace", () =>
      Effect.gen(function*() {
        const error = new Error("boom")
        const errorSite = error.stack?.split("\n")[1]?.trim()
        assert.isDefined(errorSite)
        const cause = yield* Effect.die(error).pipe(
          Effect.withSpan("C", {
            annotations: Tracer.DisablePropagation.context(true)
          }),
          Effect.sandbox,
          Effect.flip
        )

        assert.include(Cause.pretty(cause), errorSite)
      }))

    it.effect("should set the parent span", () =>
      Effect.gen(function*() {
        const span = yield* Effect.currentSpan.pipe(
          Effect.withSpan("A"),
          Effect.withSpan("B")
        )

        strictEqual(span.name, "A")
        strictEqual((getParent(span) as Span).name, "B")
      }))

    it.effect("should override the parent span when root is set to true", () =>
      Effect.gen(function*() {
        const span = yield* Effect.currentSpan.pipe(
          Effect.withSpan("A", { root: true }),
          Effect.withSpan("B")
        )

        strictEqual(span.name, "A")
        assertNone(span.parent)
      }))

    it.effect("should set an external parent span", () =>
      Effect.gen(function*() {
        const span = yield* Effect.currentSpan.pipe(
          Effect.withSpan("A", {
            parent: {
              _tag: "ExternalSpan",
              spanId: "000",
              traceId: "111",
              sampled: true,
              annotations: Context.empty()
            }
          })
        )

        strictEqual(span.name, "A")
        strictEqual(getParent(span).spanId, "000")
      }))

    it.effect("should still apply minimum trace level with sampled parent spans", () =>
      Effect.gen(function*() {
        const span = yield* Effect.currentSpan.pipe(
          Effect.withSpan("A", {
            parent: Tracer.externalSpan({
              spanId: "000",
              traceId: "111",
              sampled: true
            }),
            level: "Info"
          }),
          Effect.provideService(Tracer.MinimumTraceLevel, "Error")
        )

        strictEqual(span.sampled, false)
      }))

    it.effect("should not set the parent span when none exists", () =>
      Effect.gen(function*() {
        const span = yield* Effect.withSpan(Effect.currentSpan, "A")

        strictEqual(span.name, "A")
        assertNone(span.parent)
        strictEqual(span.attributes.get("code.stacktrace"), undefined)
      }))

    it.effect("should preserve nested span context with OtlpTracer", () =>
      Effect.gen(function*() {
        const innerEffect = Effect.succeed(42).pipe(
          Effect.withSpan("child-span", {
            attributes: {
              "test": "child"
            }
          })
        )

        const result = yield* innerEffect.pipe(
          Effect.withSpan("parent-span", {
            attributes: {
              "test": "parent"
            }
          })
        )

        strictEqual(result, 42)
      }).pipe(
        Effect.provide(otlpTracerLayer)
      ))

    it.effect("should set the correct start and end time", () =>
      Effect.gen(function*() {
        const spanFiber = yield* Effect.currentSpan.pipe(
          Effect.delay("1 second"),
          Effect.withSpan("A"),
          Effect.forkChild
        )

        yield* TestClock.adjust("2 seconds")

        const span = yield* Fiber.join(spanFiber)

        strictEqual(span.name, "A")
        strictEqual(span.status.startTime, 0n)
        strictEqual((span.status as any)["endTime"], 1000000000n)
        strictEqual(span.status._tag, "Ended")
      }))

    it.effect("should capture logs as span events", () =>
      Effect.gen(function*() {
        yield* TestClock.adjust(Duration.millis(0.01))

        const [span, fiberId] = yield* Effect.log("event").pipe(
          Effect.andThen(Effect.all([Effect.currentSpan, Effect.fiberId])),
          Effect.withSpan("A")
        )

        strictEqual(span.name, "A")
        assertNone(span.parent)
        deepStrictEqual((span as Tracer.NativeSpan).events, [
          ["event", 10_000n, {
            "effect.fiberId": fiberId,
            "effect.logLevel": "INFO"
          }]
        ])
      }))

    it.effect("should attach attributes and kind to the current span", () =>
      Effect.gen(function*() {
        const result = yield* Effect.succeed(42).pipe(
          Effect.withSpan("test-span", {
            attributes: {
              "code.filepath": "test.ts",
              "code.lineno": 1
            }
          })
        )

        strictEqual(result, 42)
      }))
  })

  describe("Effect.annotateSpans", () => {
    it.effect("should allow adding span attributes as key/value pairs", () =>
      Effect.gen(function*() {
        const span = yield* Effect.currentSpan.pipe(
          Effect.withSpan("A"),
          Effect.annotateSpans("key", "value")
        )

        strictEqual(span.name, "A")
        assertNone(span.parent)
        strictEqual(span.attributes.get("key"), "value")
      }))

    it.effect("should allow adding span attributes as a record", () =>
      Effect.gen(function*() {
        const span = yield* Effect.currentSpan.pipe(
          Effect.withSpan("A"),
          Effect.annotateSpans({
            key: "value",
            key2: "value2"
          })
        )

        strictEqual(span.attributes.get("key"), "value")
        strictEqual(span.attributes.get("key2"), "value2")
      }))
  })

  describe("Effect.useSpan", () => {
    it.effect("ends the span when the callback throws", () =>
      Effect.gen(function*() {
        const defect = new Error("boom")
        const spans: Array<Tracer.Span> = []
        const tracer = Tracer.make({
          span: (options) => {
            const span = new Tracer.NativeSpan(options)
            spans.push(span)
            return span
          }
        })

        const exit = yield* Effect.useSpan("A", (): Effect.Effect<never> => {
          throw defect
        }).pipe(Effect.withTracer(tracer), Effect.exit)

        deepStrictEqual(exit, Exit.die(defect))
        strictEqual(spans.length, 1)
        const span = spans[0]!
        strictEqual(span.status._tag, "Ended")
        if (span.status._tag === "Ended") {
          deepStrictEqual(span.status.exit, Exit.die(defect))
        }
      }))
  })

  describe("interruption as a traced region starts", () => {
    const interruptAtEveryStep = (
      make: () => Effect.Effect<unknown>,
      check: (spans: ReadonlyArray<Tracer.NativeSpan>, label: string) => void
    ) =>
      Effect.gen(function*() {
        let started = 0
        for (let ops = 3; ops <= 6; ops++) {
          for (let prefix = 0; prefix < 4; prefix++) {
            for (let yields = 0; yields < 6; yields++) {
              const spans: Array<Tracer.NativeSpan> = []
              const tracer = Tracer.make({
                span(options) {
                  const span = new Tracer.NativeSpan(options)
                  spans.push(span)
                  return span
                }
              })
              let effect = make()
              for (let i = 0; i < prefix; i++) effect = Effect.andThen(Effect.void, effect)
              yield* Effect.gen(function*() {
                const fiber = yield* Effect.forkChild(effect)
                for (let i = 0; i < yields; i++) yield* Effect.yieldNow
                yield* Fiber.interrupt(fiber)
              }).pipe(Effect.withTracer(tracer), Effect.provideService(Scheduler.MaxOpsBeforeYield, ops))
              started += spans.length
              check(spans, `ops ${ops}, prefix ${prefix}, yields ${yields}`)
            }
          }
        }
        assert.isAbove(started, 0, "the child never started a span")
      })

    it.effect("ends interrupted spans and restores the parent for outer finalizers", () => {
      let seen: string | undefined
      let checked = 0
      return interruptAtEveryStep(() => {
        seen = undefined
        const finalizer = Effect.flatMap(Effect.orDie(Effect.currentParentSpan), (span) =>
          Effect.sync(() => {
            seen = span._tag === "Span" ? span.name : span.spanId
          }))
        return Effect.withSpan(Effect.ensuring(Effect.withSpan(Effect.never, "inner"), finalizer), "outer")
      }, (spans, label) => {
        for (const span of spans) {
          strictEqual(span.status._tag, "Ended", span.name + ": " + label)
        }
        if (seen !== undefined) {
          checked++
          strictEqual(seen, "outer", label)
        }
      }).pipe(Effect.tap(() => Effect.sync(() => assert.isAbove(checked, 0, "the outer finalizer never ran"))))
    })
  })

  describe("Effect.useSpanScoped", () => {
    it.effect("should control span lifetimes with a scope", () =>
      Effect.gen(function*() {
        const span = yield* Effect.scoped(Effect.makeSpanScoped("A"))
        strictEqual(span.status._tag, "Ended")
        strictEqual(span.attributes.get("code.stacktrace"), undefined)
      }))
  })

  describe("Effect.annotateCurrentSpan", () => {
    it.effect("should allow adding attributes to the current span", () =>
      Effect.gen(function*() {
        yield* Effect.annotateCurrentSpan("key", "value")
        const span = yield* Effect.currentSpan
        strictEqual(span.attributes.get("key"), "value")
      }).pipe(Effect.withSpan("A")))
  })

  describe("Effect.withParentSpan", () => {
    it("runs continuations after the region under the restored span", () => {
      let active: string | undefined
      const tracer = Tracer.make({
        span: (options) => new Tracer.NativeSpan(options),
        context(primitive, fiber) {
          const previous = active
          active = fiber.cache.span?.spanId
          try {
            return primitive["~effect/Effect/evaluate"](fiber)
          } finally {
            active = previous
          }
        }
      })
      const seen: Array<string | undefined> = []
      const record = Effect.map(() => {
        seen.push(active)
      })
      Effect.runSync(
        Effect.sync(() => undefined).pipe(
          record,
          Effect.withParentSpan(Tracer.externalSpan({ spanId: "child", traceId: "trace" })),
          record,
          Effect.withParentSpan(Tracer.externalSpan({ spanId: "parent", traceId: "trace" })),
          Effect.withTracer(tracer)
        )
      )
      deepStrictEqual(seen, ["child", "parent"])
    })

    it.effect("should allow setting the parent span for the current span", () =>
      Effect.gen(function*() {
        const span = yield* Effect.currentSpan
        strictEqual(getParent(span).spanId, "456")
      }).pipe(
        Effect.withSpan("A"),
        Effect.withParentSpan({
          _tag: "ExternalSpan",
          traceId: "123",
          spanId: "456",
          sampled: true,
          annotations: Context.empty()
        })
      ))
  })

  describe("Effect.withTracerEnabled", () => {
    it.effect("should allow enabling/disabling the tracer", () =>
      Effect.gen(function*() {
        const span = yield* Effect.currentSpan.pipe(
          Effect.withSpan("A"),
          Effect.withTracerEnabled(false)
        )
        const spanB = yield* Effect.currentSpan.pipe(
          Effect.withSpan("B"),
          Effect.withTracerEnabled(true)
        )

        strictEqual(span.name, "A")
        strictEqual(span.spanId, "noop")
        strictEqual(spanB.name, "B")
      }))
  })

  describe("Effect.withTracerTiming", () => {
    it.effect("should include timing information in spans when true", () =>
      Effect.gen(function*() {
        yield* TestClock.adjust("1 millis")

        const span = yield* Effect.currentSpan.pipe(
          Effect.withSpan("A"),
          Effect.withTracerTiming(true) // default
        )

        strictEqual(span.status.startTime, 1_000_000n)
      }))

    it.effect("should not include timing information in spans when false", () =>
      Effect.gen(function*() {
        yield* TestClock.adjust("1 millis")

        const span = yield* Effect.currentSpan.pipe(
          Effect.withSpan("A"),
          Effect.withTracerTiming(false)
        )

        strictEqual(span.status.startTime, 0n)
      }))

    it.effect("should set start and end times to zero when timing is disabled", () =>
      Effect.gen(function*() {
        yield* TestClock.adjust("1 millis")

        const useSpan = yield* Effect.useSpan("useSpan", (span) => Effect.succeed(span))
        const withSpan = yield* Effect.currentSpan.pipe(Effect.withSpan("withSpan"))

        deepStrictEqual(
          [useSpan.status, withSpan.status].map((status) => {
            strictEqual(status._tag, "Ended")
            return status._tag === "Ended" ? [status.startTime, status.endTime] : undefined
          }),
          [[0n, 0n], [0n, 0n]],
          "disabled span timing"
        )
      }).pipe(Effect.withTracerTiming(false)))
  })

  describe("Effect.linkSpans", () => {
    it.effect("should link two spans together", () =>
      Effect.gen(function*() {
        const childA = yield* Effect.makeSpan("childA")
        const childB = yield* Effect.makeSpan("childB")
        const currentSpan = yield* Effect.currentSpan.pipe(
          Effect.withSpan("A", {
            links: [{ span: childB, attributes: {} }]
          }),
          Effect.linkSpans(childA)
        )
        deepStrictEqual(
          currentSpan.links.map((_) => _.span),
          [childA, childB]
        )
      }))
  })

  describe("Layer.parentSpan", () => {
    it.effect("should set the parent trace span for the layer constructor", () =>
      Effect.gen(function*() {
        const span = yield* Effect.makeSpan("child")
        const parent = getParent(span) as Tracer.Span
        strictEqual(parent.name, "parent")
        strictEqual(span.attributes.get("code.stacktrace"), undefined)
        strictEqual(parent.attributes.get("code.stacktrace"), undefined)
      }).pipe(Effect.provide(Layer.unwrap(
        Effect.map(
          Effect.makeSpanScoped("parent"),
          (span) => Layer.parentSpan(span)
        )
      ))))
  })

  describe("Layer.span", () => {
    it.effect("should create a new parent trace span for the layer constructor", () =>
      Effect.gen(function*() {
        const span = yield* Effect.makeSpan("child")
        const parent = getParent(span) as Tracer.Span
        strictEqual(parent.name, "parent")
        strictEqual(parent.attributes.get("code.stacktrace"), undefined)
      }).pipe(Effect.provide(Layer.span("parent"))))

    it.effect("should call onEnd when the span is ending", () =>
      Effect.gen(function*() {
        let onEndCalled = false
        const span = yield* Effect.currentSpan.pipe(
          Effect.provide(Layer.span("span", {
            onEnd: (span, _exit) =>
              Effect.sync(() => {
                strictEqual(span.name, "span")
                onEndCalled = true
              })
          }))
        )
        strictEqual(span.name, "span")
        strictEqual(onEndCalled, true)
      }))
  })

  describe("Layer.withSpan", () => {
    it.effect("sets the trace span for the layer constructor", () =>
      Effect.gen(function*() {
        let onEndCalled = false
        const layer = Layer.effectDiscard(Effect.gen(function*() {
          const span = yield* Effect.currentSpan
          strictEqual(span.name, "span")
          strictEqual(span.attributes.get("code.stacktrace"), undefined)
        })).pipe(Layer.withSpan("span", {
          onEnd: (span, _exit) =>
            Effect.sync(() => {
              strictEqual(span.name, "span")
              onEndCalled = true
            })
        }))

        const span = yield* Effect.currentSpan.pipe(
          Effect.provide(layer),
          Effect.option
        )

        assertNone(span)
        strictEqual(onEndCalled, true)
      }))
  })

  describe("Tracer.DisablePropagation", () => {
    it.effect("should allow disabling span propagation via noop spans", () =>
      Effect.gen(function*() {
        const span = yield* Effect.currentSpan.pipe(
          Effect.withSpan("A", {
            annotations: Tracer.DisablePropagation.context(true)
          })
        )
        const spanB = yield* Effect.currentSpan.pipe(
          Effect.withSpan("B")
        )

        strictEqual(span.name, "A")
        strictEqual(span.spanId, "noop")
        strictEqual(spanB.name, "B")
      }))

    it.effect("should prevent a span from being used as a parent span", () =>
      Effect.gen(function*() {
        const span = yield* Effect.currentSpan.pipe(
          Effect.withSpan("child"),
          Effect.withSpan("disabled", {
            annotations: Tracer.DisablePropagation.context(true)
          }),
          Effect.withSpan("parent")
        )
        strictEqual(span.name, "child")
        const parent = getParent(span)
        strictEqual(parent._tag, "Span")
        strictEqual((parent as Span).name, "parent")
      }))
  })
})
