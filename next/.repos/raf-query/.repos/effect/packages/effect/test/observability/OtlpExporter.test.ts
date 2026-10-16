import { assert, describe, it } from "@effect/vitest"
import { Clock, ConfigProvider, Deferred, type Duration, Effect, Exit, Fiber, Layer, Metric, Ref, Scope } from "effect"
import { HttpBody, HttpClient, HttpClientResponse } from "effect/http"
import type { HttpClientError } from "effect/http"
import { OtlpExporter, OtlpLogger, OtlpMetrics, OtlpSerialization, OtlpTracer } from "effect/observability"
import { TestClock } from "effect/testing"

const makeHttpClient = Effect.fnUntraced(function*(retryAfter: string | undefined) {
  const attempts = yield* Ref.make(0)

  const httpClient = HttpClient.makeWith(
    Effect.fnUntraced(function*(requestEffect) {
      const request = yield* requestEffect
      const attempt = yield* Ref.updateAndGet(attempts, (attempts) => attempts + 1)
      if (attempt === 1) {
        return HttpClientResponse.fromWeb(
          request,
          retryAfter === undefined
            ? new Response(null, { status: 429 })
            : new Response(null, { status: 429, headers: { "retry-after": retryAfter } })
        )
      }
      return HttpClientResponse.fromWeb(request, new Response())
    }),
    Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>
  )

  return { attempts, httpClient } as const
})

const makeExporter = (
  httpClient: HttpClient.HttpClient,
  options?: {
    readonly exportInterval?: Duration.Input
    readonly maxBatchSize?: number | "disabled"
    readonly shutdownTimeout?: Duration.Input
    readonly body?: (data: Array<any>) => HttpBody.HttpBody
  }
) =>
  OtlpExporter.make({
    label: "OtlpExporterTest",
    url: "http://localhost:4318/v1/logs",
    headers: undefined,
    exportInterval: options?.exportInterval ?? "1 hour",
    maxBatchSize: options?.maxBatchSize ?? 1,
    body: (data) => [options?.body?.(data) ?? HttpBody.empty, Effect.void],
    shutdownTimeout: options?.shutdownTimeout ?? "1 second"
  }).pipe(
    Effect.provideService(HttpClient.HttpClient, httpClient),
    Effect.provide(OtlpExporter.layerFlusher)
  )

const makeExporterRaw = (
  maxBatchSize: number | "disabled" = 1,
  body: (data: Array<any>) => HttpBody.HttpBody = () => HttpBody.empty
) =>
  OtlpExporter.make({
    label: "OtlpExporterTest",
    url: "http://localhost:4318/v1/logs",
    headers: undefined,
    exportInterval: "1 hour",
    maxBatchSize,
    body: (data) => [body(data), Effect.void],
    shutdownTimeout: "1 second"
  })

const makeStatusHttpClient = Effect.fnUntraced(function*(status: number) {
  const attempts = yield* Ref.make(0)
  const urls = yield* Ref.make<ReadonlyArray<string>>([])

  const httpClient = HttpClient.makeWith(
    Effect.fnUntraced(function*(requestEffect) {
      const request = yield* requestEffect
      yield* Ref.update(attempts, (attempts) => attempts + 1)
      yield* Ref.update(urls, (urls) => [...urls, request.url])
      return HttpClientResponse.fromWeb(request, new Response(null, { status }))
    }),
    Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>
  )

  return { attempts, httpClient, urls } as const
})

const yieldNowN = (times: number) =>
  Effect.forEach(Array.from({ length: times }), () => Effect.yieldNow, { discard: true })

const makeControlledHttpClient = Effect.fnUntraced(function*(requestCount: number) {
  const started = yield* Effect.forEach(Array.from({ length: requestCount }), () => Deferred.make<void>())
  const releases = yield* Effect.forEach(Array.from({ length: requestCount }), () => Deferred.make<void>())
  const interrupted = yield* Ref.make(0)
  let requestIndex = 0

  const httpClient = HttpClient.makeWith(
    Effect.fnUntraced(function*(requestEffect) {
      const request = yield* requestEffect
      const index = requestIndex++
      yield* Deferred.succeed(started[index], undefined)
      yield* Deferred.await(releases[index]).pipe(
        Effect.onInterrupt(() => Ref.update(interrupted, (count) => count + 1))
      )
      return HttpClientResponse.fromWeb(request, new Response())
    }),
    Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>
  )

  return { httpClient, interrupted, releases, started } as const
})

describe("OtlpExporter", () => {
  it.effect("allows an in-flight timer export to finish during shutdown", () =>
    Effect.gen(function*() {
      const scope = yield* Scope.make()
      const { httpClient, releases, started } = yield* makeControlledHttpClient(1)
      const exporter = yield* makeExporter(httpClient, {
        exportInterval: "1 second",
        maxBatchSize: 10
      }).pipe(Scope.provide(scope))

      exporter.push({ value: 1 })
      yield* TestClock.adjust("1 second")
      yield* Deferred.await(started[0])

      const closeFiber = yield* Effect.forkChild(Scope.close(scope, Exit.void))
      yield* Effect.yieldNow
      assert.isUndefined(closeFiber.pollUnsafe())

      yield* Deferred.succeed(releases[0], undefined)
      yield* Fiber.join(closeFiber)
    }))

  it.effect("waits for each periodic export before starting the next interval", () =>
    Effect.gen(function*() {
      const scope = yield* Scope.make()
      const { httpClient, releases, started } = yield* makeControlledHttpClient(3)
      const exporter = yield* makeExporter(httpClient, {
        exportInterval: "1 second",
        maxBatchSize: "disabled"
      }).pipe(Scope.provide(scope))

      exporter.push({ value: 1 })
      yield* TestClock.adjust("1 second")
      yield* Deferred.await(started[0])

      yield* TestClock.adjust("1 second")
      assert.isFalse(yield* Deferred.isDone(started[1]))

      yield* Deferred.succeed(releases[0], undefined)
      exporter.push({ value: 2 })
      yield* TestClock.adjust("1 second")
      yield* Deferred.await(started[1])

      exporter.push({ value: 3 })
      const closeFiber = yield* Effect.forkChild(Scope.close(scope, Exit.void))
      yield* Deferred.succeed(releases[1], undefined)
      yield* Deferred.await(started[2])
      yield* Deferred.succeed(releases[2], undefined)
      yield* Fiber.join(closeFiber)
    }))

  it.effect("allows an in-flight batch export to finish during shutdown", () =>
    Effect.gen(function*() {
      const scope = yield* Scope.make()
      const { httpClient, releases, started } = yield* makeControlledHttpClient(1)
      const exporter = yield* makeExporter(httpClient).pipe(Scope.provide(scope))

      exporter.push({ value: 1 })
      yield* Deferred.await(started[0])

      const closeFiber = yield* Effect.forkChild(Scope.close(scope, Exit.void))
      yield* Effect.yieldNow
      assert.isUndefined(closeFiber.pollUnsafe())

      yield* Deferred.succeed(releases[0], undefined)
      yield* Fiber.join(closeFiber)
    }))

  it.effect("exports remaining telemetry concurrently and waits for all requests", () =>
    Effect.gen(function*() {
      const scope = yield* Scope.make()
      const { httpClient, releases, started } = yield* makeControlledHttpClient(2)
      const batches: Array<Array<number>> = []
      const exporter = yield* makeExporter(httpClient, {
        maxBatchSize: 2,
        body(data) {
          batches.push(data.map((item) => item.value))
          return HttpBody.empty
        }
      }).pipe(Scope.provide(scope))

      exporter.push({ value: 1 })
      exporter.push({ value: 2 })
      yield* Deferred.await(started[0])
      exporter.push({ value: 3 })

      const closeFiber = yield* Effect.forkChild(Scope.close(scope, Exit.void))
      yield* Deferred.await(started[1])
      assert.deepStrictEqual(batches, [[1, 2], [3]])

      yield* Deferred.succeed(releases[0], undefined)
      yield* Effect.yieldNow
      assert.isUndefined(closeFiber.pollUnsafe())
      yield* Deferred.succeed(releases[1], undefined)
      yield* Fiber.join(closeFiber)
    }))

  it.effect("bounds shutdown waiting and interrupts remaining requests", () =>
    Effect.gen(function*() {
      const scope = yield* Scope.make()
      const { httpClient, interrupted, started } = yield* makeControlledHttpClient(1)
      const exporter = yield* makeExporter(httpClient).pipe(Scope.provide(scope))

      exporter.push({ value: 1 })
      yield* Deferred.await(started[0])

      const closeFiber = yield* Effect.forkChild(Scope.close(scope, Exit.void))
      yield* TestClock.adjust("1 second")
      yield* Fiber.join(closeFiber)
      assert.strictEqual(yield* Ref.get(interrupted), 1)
    }))

  it.effect("does not initiate or wait for delivery when disabled", () =>
    Effect.gen(function*() {
      const scope = yield* Scope.make()
      const blocked = yield* Deferred.make<void>()
      const blockedInterrupted = yield* Deferred.make<void>()
      const failed = yield* Deferred.make<void>()
      const attempts = yield* Ref.make(0)
      const httpClient = HttpClient.makeWith(
        Effect.fnUntraced(function*(requestEffect) {
          const request = yield* requestEffect
          const attempt = yield* Ref.updateAndGet(attempts, (count) => count + 1)
          if (attempt === 1) {
            yield* Deferred.succeed(blocked, undefined)
            return yield* Effect.never.pipe(
              Effect.onInterrupt(() => Deferred.succeed(blockedInterrupted, undefined))
            )
          }
          yield* Deferred.succeed(failed, undefined)
          return HttpClientResponse.fromWeb(request, new Response(null, { status: 400 }))
        }),
        Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>
      )
      const exporter = yield* makeExporter(httpClient).pipe(Scope.provide(scope))

      exporter.push({ value: 1 })
      yield* Deferred.await(blocked)
      exporter.push({ value: 2 })
      yield* Deferred.await(failed)
      yield* yieldNowN(3)
      exporter.push({ value: 3 })

      yield* Scope.close(scope, Exit.void)
      yield* Deferred.await(blockedInterrupted)
      assert.strictEqual(yield* Ref.get(attempts), 2)
    }))

  it.effect("retries status 429 with numeric retry-after delay", () =>
    Effect.gen(function*() {
      const { attempts, httpClient } = yield* makeHttpClient("2")
      const exporter = yield* makeExporter(httpClient)

      exporter.push({ value: 1 })
      yield* yieldNowN(3)

      assert.strictEqual(yield* Ref.get(attempts), 1)

      yield* TestClock.adjust("1 second")
      yield* yieldNowN(2)
      assert.strictEqual(yield* Ref.get(attempts), 1)

      yield* TestClock.adjust("1 second")
      yield* yieldNowN(2)
      assert.strictEqual(yield* Ref.get(attempts), 2)
    }))

  it.effect("retries status 429 with HTTP-date retry-after delay", () =>
    Effect.gen(function*() {
      const { attempts, httpClient } = yield* makeHttpClient("Thu, 01 Jan 1970 00:01:00 GMT")
      const exporter = yield* makeExporter(httpClient)

      exporter.push({ value: 1 })
      yield* yieldNowN(3)

      assert.strictEqual(yield* Ref.get(attempts), 1)

      yield* TestClock.adjust("5 seconds")
      yield* yieldNowN(2)
      assert.strictEqual(yield* Ref.get(attempts), 1)

      yield* TestClock.adjust("55 seconds")
      yield* yieldNowN(2)
      assert.strictEqual(yield* Ref.get(attempts), 2)
    }))

  it.effect("uses fallback retry-after delay when header is non-numeric", () =>
    Effect.gen(function*() {
      const { attempts, httpClient } = yield* makeHttpClient("soon")
      const exporter = yield* makeExporter(httpClient)

      exporter.push({ value: 1 })
      yield* yieldNowN(3)

      assert.strictEqual(yield* Ref.get(attempts), 1)

      yield* TestClock.adjust("4 seconds")
      yield* yieldNowN(2)
      assert.strictEqual(yield* Ref.get(attempts), 1)

      yield* TestClock.adjust("1 second")
      yield* yieldNowN(2)
      assert.strictEqual(yield* Ref.get(attempts), 2)
    }))

  it.effect("uses fallback retry-after delay when header is missing", () =>
    Effect.gen(function*() {
      const { attempts, httpClient } = yield* makeHttpClient(undefined)
      const exporter = yield* makeExporter(httpClient)

      exporter.push({ value: 1 })
      yield* yieldNowN(3)

      assert.strictEqual(yield* Ref.get(attempts), 1)

      yield* TestClock.adjust("4 seconds")
      yield* yieldNowN(2)
      assert.strictEqual(yield* Ref.get(attempts), 1)

      yield* TestClock.adjust("1 second")
      yield* yieldNowN(2)
      assert.strictEqual(yield* Ref.get(attempts), 2)
    }))

  describe("flush", () => {
    it.effect("exports buffered items without advancing to the export interval", () =>
      Effect.gen(function*() {
        const { attempts, httpClient } = yield* makeStatusHttpClient(200)
        yield* Effect.scoped(
          Effect.gen(function*() {
            const exporter = yield* makeExporterRaw(10)
            const flusher = yield* OtlpExporter.Flusher
            const before = yield* Clock.currentTimeMillis

            exporter.push({ value: 1 })
            yield* flusher.flush

            assert.strictEqual(yield* Clock.currentTimeMillis, before)
            assert.strictEqual(yield* Ref.get(attempts), 1)
          }).pipe(
            Effect.provideService(HttpClient.HttpClient, httpClient),
            Effect.provide(OtlpExporter.layerFlusher)
          )
        )
      }))

    for (const filterStatus of [false, true]) {
      it.effect(`drains a 429 response before retrying${filterStatus ? " from a status-filtered client" : ""}`, () =>
        Effect.gen(function*() {
          const responses: Array<Response> = []
          const rawClient = HttpClient.make((request) => {
            const response = new Response("body", {
              status: responses.length === 0 ? 429 : 200,
              headers: { "retry-after": "1" }
            })
            responses.push(response)
            return Effect.succeed(HttpClientResponse.fromWeb(request, response))
          })
          const httpClient = filterStatus ? HttpClient.filterStatusOk(rawClient) : rawClient
          yield* Effect.scoped(
            Effect.gen(function*() {
              const exporter = yield* makeExporterRaw(10)
              const flusher = yield* OtlpExporter.Flusher

              exporter.push({ value: 1 })
              const flush = yield* Effect.forkChild(flusher.flush)
              yield* yieldNowN(3)
              assert.strictEqual(responses.length, 1)
              assert.isTrue(responses[0].bodyUsed)

              yield* TestClock.adjust("1 second")
              yield* Fiber.join(flush)
              assert.strictEqual(responses.length, 2)
              assert.isTrue(responses[1].bodyUsed)
            }).pipe(
              Effect.provideService(HttpClient.HttpClient, httpClient),
              Effect.provide(OtlpExporter.layerFlusher)
            )
          )
        }))
    }

    it.effect("keeps exporting when reading a successful response body fails", () =>
      Effect.gen(function*() {
        let attempts = 0
        const httpClient = HttpClient.make((request) => {
          attempts++
          const response = new Response(
            new ReadableStream({
              start(controller) {
                controller.error(new Error("body read failed"))
              }
            })
          )
          return Effect.succeed(HttpClientResponse.fromWeb(request, response))
        })
        yield* Effect.scoped(
          Effect.gen(function*() {
            const exporter = yield* makeExporterRaw(10)
            const flusher = yield* OtlpExporter.Flusher

            exporter.push({ value: 1 })
            yield* flusher.flush
            exporter.push({ value: 2 })
            yield* flusher.flush
            assert.strictEqual(attempts, 2)
          }).pipe(
            Effect.provideService(HttpClient.HttpClient, httpClient),
            Effect.provide(OtlpExporter.layerFlusher)
          )
        )
      }))

    it.effect("does not export empty payloads when batching is disabled", () =>
      Effect.gen(function*() {
        const { httpClient } = yield* makeStatusHttpClient(200)
        const payloads: Array<ReadonlyArray<unknown>> = []

        yield* Effect.scoped(
          Effect.gen(function*() {
            yield* makeExporterRaw("disabled", (items) => {
              payloads.push(items)
              return HttpBody.empty
            })
            const flusher = yield* OtlpExporter.Flusher
            yield* flusher.flush
          }).pipe(
            Effect.provideService(HttpClient.HttpClient, httpClient),
            Effect.provide(OtlpExporter.layerFlusher)
          )
        )

        assert.deepStrictEqual(payloads, [])
      }))

    it.effect("exports buffered items once when batching is disabled", () =>
      Effect.gen(function*() {
        const { httpClient } = yield* makeStatusHttpClient(200)
        const payloads: Array<ReadonlyArray<unknown>> = []

        yield* Effect.scoped(
          Effect.gen(function*() {
            const exporter = yield* makeExporterRaw("disabled", (items) => {
              payloads.push(items)
              return HttpBody.empty
            })
            const flusher = yield* OtlpExporter.Flusher

            exporter.push({ value: 1 })
            yield* flusher.flush
            yield* flusher.flush
          }).pipe(
            Effect.provideService(HttpClient.HttpClient, httpClient),
            Effect.provide(OtlpExporter.layerFlusher)
          )
        )

        assert.deepStrictEqual(payloads, [[{ value: 1 }]])
      }))

    it.effect("shares one registry across traces, logs and metrics", () =>
      Effect.gen(function*() {
        const { httpClient, urls } = yield* makeStatusHttpClient(200)
        const signals = Layer.mergeAll(
          OtlpTracer.layer({
            url: "http://localhost:4318/v1/traces",
            resource: { serviceName: "test" },
            exportInterval: "1 hour",
            maxBatchSize: 100
          }),
          OtlpLogger.layer({
            url: "http://localhost:4318/v1/logs",
            resource: { serviceName: "test" },
            exportInterval: "1 hour",
            maxBatchSize: 100,
            mergeWithExisting: false
          }),
          OtlpMetrics.layer({
            url: "http://localhost:4318/v1/metrics",
            resource: { serviceName: "test" },
            exportInterval: "1 hour"
          })
        ).pipe(
          Layer.provide(OtlpSerialization.layerJson),
          Layer.provideMerge(Layer.succeed(HttpClient.HttpClient, httpClient))
        )

        yield* Effect.gen(function*() {
          yield* Effect.log("flush test")
          yield* Metric.update(Metric.counter("otlp_flush_test"), 1)
          yield* Effect.void.pipe(Effect.withSpan("flush test"))

          const flusher = yield* OtlpExporter.Flusher
          yield* flusher.flush

          assert.deepStrictEqual(
            [...yield* Ref.get(urls)].sort(),
            [
              "http://localhost:4318/v1/logs",
              "http://localhost:4318/v1/metrics",
              "http://localhost:4318/v1/traces"
            ]
          )
        }).pipe(Effect.provide(signals))
      }))

    it.effect("is a no-op while the exporter is disabled", () =>
      Effect.gen(function*() {
        const { attempts, httpClient } = yield* makeStatusHttpClient(400)
        yield* Effect.scoped(
          Effect.gen(function*() {
            const exporter = yield* makeExporterRaw(10)
            const flusher = yield* OtlpExporter.Flusher

            exporter.push({ value: 1 })
            yield* flusher.flush
            assert.strictEqual(yield* Ref.get(attempts), 1)

            exporter.push({ value: 2 })
            yield* flusher.flush
            assert.strictEqual(yield* Ref.get(attempts), 1)
          }).pipe(
            Effect.provideService(HttpClient.HttpClient, httpClient),
            Effect.provide(OtlpExporter.layerFlusher)
          )
        )
      }))

    it.effect("deregisters an exporter when its scope closes", () =>
      Effect.gen(function*() {
        const { attempts, httpClient } = yield* makeStatusHttpClient(200)
        const flusher = yield* OtlpExporter.Flusher
        const scope = yield* Scope.make()

        const exporter = yield* makeExporterRaw("disabled").pipe(
          Effect.provideService(HttpClient.HttpClient, httpClient),
          Effect.provideService(Scope.Scope, scope)
        )
        exporter.push({ value: 1 })

        yield* Scope.close(scope, Exit.void)
        assert.strictEqual(yield* Ref.get(attempts), 1)

        yield* flusher.flush
        assert.strictEqual(yield* Ref.get(attempts), 1)
      }).pipe(Effect.provide(OtlpExporter.layerFlusher)))

    it.effect("succeeds with no registered exporters", () =>
      Effect.gen(function*() {
        const flusher = yield* OtlpExporter.Flusher
        yield* flusher.flush
      }).pipe(Effect.provide(OtlpExporter.layerFlusher)))

    it.effect("is available when the SDK is disabled", () =>
      Effect.gen(function*() {
        const { attempts, httpClient } = yield* makeStatusHttpClient(200)
        const layer = OtlpTracer.layerFromConfig().pipe(
          Layer.provide(OtlpSerialization.layerJson),
          Layer.provideMerge(Layer.succeed(HttpClient.HttpClient, httpClient)),
          Layer.provideMerge(ConfigProvider.layer(ConfigProvider.fromEnv({
            env: { OTEL_SDK_DISABLED: "true" }
          })))
        )

        yield* Effect.gen(function*() {
          const flusher = yield* OtlpExporter.Flusher
          yield* flusher.flush
        }).pipe(Effect.provide(layer))

        assert.strictEqual(yield* Ref.get(attempts), 0)
      }))

    it.effect("does not fail when the collector returns 500", () =>
      Effect.gen(function*() {
        const { attempts, httpClient } = yield* makeStatusHttpClient(500)
        yield* Effect.scoped(
          Effect.gen(function*() {
            const exporter = yield* makeExporterRaw(10)
            const flusher = yield* OtlpExporter.Flusher

            exporter.push({ value: 1 })
            const fiber = yield* Effect.forkChild(flusher.flush)
            yield* yieldNowN(3)
            yield* TestClock.adjust("3 seconds")
            yield* Fiber.join(fiber)
            assert.strictEqual(yield* Ref.get(attempts), 4)

            yield* flusher.flush
            assert.strictEqual(yield* Ref.get(attempts), 4)
          }).pipe(
            Effect.provideService(HttpClient.HttpClient, httpClient),
            Effect.provide(OtlpExporter.layerFlusher)
          )
        )
      }))
  })
})
