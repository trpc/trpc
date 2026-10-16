import { describe, it, test } from "@effect/vitest"
import { deepStrictEqual, strictEqual } from "@effect/vitest/utils"
import { Cause, Context, Effect, Exit, Option, References, Scope, Stream, Tracer } from "effect"
import { identity } from "effect/Function"
import { HttpEffect, HttpServerRequest, HttpServerResponse } from "effect/http"
import { appendPreResponseHandlerUnsafe, requestPreResponseHandlers } from "effect/http/internal/preResponseHandler"
import * as Layer from "effect/Layer"

const TestValue = Context.Reference<number>("test/TestValue", { defaultValue: () => 0 })

describe("HttpEffect", () => {
  it.effect("restores the request Scope context identity", () => {
    const request = HttpServerRequest.fromWeb(new Request("http://localhost:3000/"))
    return Effect.gen(function*() {
      const before = yield* Effect.withFiber((fiber) => Effect.succeed(fiber.context))
      let during: Context.Context<never> | undefined

      yield* HttpEffect.toHandled(
        Effect.withFiber((fiber) => {
          during = fiber.context
          strictEqual(Context.getOrUndefined(fiber.context, Scope.Scope) !== undefined, true)
          return Effect.succeed(HttpServerResponse.empty())
        }),
        () => Effect.void
      )

      const after = yield* Effect.withFiber((fiber) => Effect.succeed(fiber.context))
      strictEqual(during === before, false)
      strictEqual(after, before)
    }).pipe(
      Effect.provideService(HttpServerRequest.HttpServerRequest, request),
      Effect.provideService(References.TracerEnabled, false)
    )
  })

  it.effect("propagates a handler failure through middleware to request and forked scopes", () => {
    const request = HttpServerRequest.fromWeb(new Request("http://localhost:3000/"))
    const error = new Error("handler failed")
    let requestExit: Exit.Exit<unknown, unknown> | undefined
    let childExit: Exit.Exit<unknown, unknown> | undefined
    return Effect.gen(function*() {
      yield* HttpEffect.toHandled(
        Effect.gen(function*() {
          const scope = yield* Effect.scope
          const child = yield* Scope.fork(scope)
          yield* Scope.addFinalizerExit(child, (exit) =>
            Effect.sync(() => {
              childExit = exit
            }))
          yield* Scope.addFinalizerExit(scope, (exit) =>
            Effect.sync(() => {
              requestExit = exit
            }))
          return yield* Effect.fail(error)
        }),
        () => Effect.void,
        identity
      )
      for (const exit of [requestExit, childExit]) {
        strictEqual(exit !== undefined && Exit.isFailure(exit), true)
        if (exit && Exit.isFailure(exit)) {
          strictEqual(exit.cause.reasons.length, 1)
          strictEqual(Cause.squash(exit.cause), error)
        }
      }
    }).pipe(
      Effect.provideService(HttpServerRequest.HttpServerRequest, request),
      Effect.provideService(References.TracerEnabled, false)
    )
  })

  describe("toWebHandler", () => {
    test("skips the server span with the default tracer", async () => {
      let hasParentSpan = false
      const handler = HttpEffect.toWebHandler(Effect.gen(function*() {
        hasParentSpan = Option.isSome(yield* Effect.serviceOption(Tracer.ParentSpan))
        return HttpServerResponse.empty()
      }))

      await handler(new Request("http://localhost:3000/"))

      strictEqual(hasParentSpan, false)
    })

    test("provides a parent span with a configured tracer", async () => {
      let hasParentSpan = false
      const tracer = Tracer.make({
        span: (options) => new Tracer.NativeSpan(options)
      })
      const handler = HttpEffect.toWebHandler(Effect.gen(function*() {
        hasParentSpan = Option.isSome(yield* Effect.serviceOption(Tracer.ParentSpan))
        return HttpServerResponse.empty()
      }))

      await handler(new Request("http://localhost:3000/"), Context.make(Tracer.Tracer, tracer))

      strictEqual(hasParentSpan, true)
    })

    test("json", async () => {
      const handler = HttpEffect.toWebHandler(HttpServerResponse.json({ foo: "bar" }))
      const response = await handler(new Request("http://localhost:3000/"))
      deepStrictEqual(await response.json(), {
        foo: "bar"
      })
    })

    test("cookies", async () => {
      const handler = HttpEffect.toWebHandler(Effect.succeed(
        HttpServerResponse.jsonUnsafe({ foo: "bar" }).pipe(
          HttpServerResponse.setCookieUnsafe("foo", "bar"),
          HttpServerResponse.setCookieUnsafe("test", "123", { secure: true, httpOnly: true, sameSite: "strict" })
        )
      ))
      const response = await handler(new Request("http://localhost:3000/"))
      deepStrictEqual(response.headers.getSetCookie(), [
        "foo=bar",
        "test=123; HttpOnly; Secure; SameSite=Strict"
      ])
      deepStrictEqual(await response.json(), {
        foo: "bar"
      })
    })

    test("expireCookie", async () => {
      const handler = HttpEffect.toWebHandler(
        HttpServerResponse.empty().pipe(
          HttpServerResponse.expireCookie("foo", { path: "/" }),
          Effect.map(HttpServerResponse.expireCookieUnsafe("bar"))
        )
      )
      const response = await handler(new Request("http://localhost:3000/"))
      deepStrictEqual(response.headers.getSetCookie(), [
        "foo=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
        "bar=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
      ])
    })

    test("stream", async () => {
      const handler = HttpEffect.toWebHandler(
        Effect.succeed(HttpServerResponse.stream(Stream.make("foo", "bar").pipe(Stream.encodeText)))
      )
      const response = await handler(new Request("http://localhost:3000/"))
      strictEqual(await response.text(), "foobar")
    })

    test("preserves explicit stream headers", async () => {
      const handler = HttpEffect.toWebHandler(Effect.succeed(
        HttpServerResponse.stream(Stream.empty).pipe(
          HttpServerResponse.setHeaders({
            "Content-Type": "text/javascript",
            "Content-Length": "9007199254740993"
          })
        )
      ))
      const response = await handler(new Request("http://localhost/script.js"))
      await response.arrayBuffer()

      strictEqual(response.headers.get("content-type"), "text/javascript")
      strictEqual(response.headers.get("content-length"), "9007199254740993")
    })

    test("stream scope", async () => {
      let order = 0
      let streamFinalized = 0
      let handlerFinalized = 0
      const handler = HttpEffect.toWebHandler(Effect.gen(function*() {
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            handlerFinalized = order
            order += 1
          })
        )
        const stream = Stream.make("foo", "bar").pipe(
          Stream.encodeText,
          Stream.ensuring(Effect.sync(() => {
            streamFinalized = order
            order += 1
          }))
        )
        return HttpServerResponse.stream(stream)
      }))
      const response = await handler(new Request("http://localhost:3000/"))
      strictEqual(await response.text(), "foobar")
      strictEqual(streamFinalized < handlerFinalized, true)
    })

    test("streaming HEAD closes the request scope", async () => {
      let finalized = false
      const handler = HttpEffect.toWebHandler(Effect.gen(function*() {
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            finalized = true
          })
        )
        return HttpServerResponse.stream(Stream.make("body").pipe(Stream.encodeText))
      }))

      await handler(new Request("http://localhost:3000/", { method: "HEAD" }))

      strictEqual(finalized, true)
    })

    test.each([204, 205, 304])("status %i closes the request scope without starting the stream", async (status) => {
      let finalized = false
      let streamStarted = false
      const handler = HttpEffect.toWebHandler(Effect.gen(function*() {
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            finalized = true
          })
        )
        return HttpServerResponse.stream(
          Stream.fromEffect(Effect.sync(() => {
            streamStarted = true
            return new Uint8Array([1])
          })),
          { status }
        )
      }))

      const response = await handler(new Request("http://localhost:3000/"))

      strictEqual(response.status, status)
      strictEqual(response.body, null)
      strictEqual(streamStarted, false)
      strictEqual(finalized, true)
    })

    test("stream runtime", async () => {
      const handler = Effect.succeed(HttpServerResponse.stream(
        Stream.fromEffect(TestValue).pipe(Stream.map(String), Stream.encodeText)
      )).pipe(
        HttpEffect.toWebHandlerWith(TestValue.context(420))
      )
      const response = await handler(new Request("http://localhost:3000/"))
      strictEqual(await response.text(), "420")
    })

    test("stream layer", async () => {
      const { handler } = HttpEffect.toWebHandlerLayer(
        Effect.succeed(HttpServerResponse.stream(
          TestValue.pipe(
            Stream.fromEffect,
            Stream.map(String),
            Stream.encodeText
          )
        )),
        Layer.succeed(TestValue, 420)
      )
      const response = await handler(new Request("http://localhost:3000/"))
      strictEqual(await response.text(), "420")
    })

    test("pre-response handlers are keyed by request source", () => {
      const request = HttpServerRequest.fromWeb(new Request("http://localhost:3000/"))
      const modified = request.modify({ url: "/updated" })
      const handler = (
        _request: HttpServerRequest.HttpServerRequest,
        response: HttpServerResponse.HttpServerResponse
      ) => Effect.succeed(response)

      appendPreResponseHandlerUnsafe(request, handler)

      strictEqual(requestPreResponseHandlers.get(modified.source), handler)
    })
  })

  test("custom context", async () => {
    const Env = Context.Reference<{ foo: string }>("Env", {
      defaultValue: () => ({ foo: "bar" })
    })
    const handler = HttpEffect.toWebHandler(Effect.gen(function*() {
      const env = yield* Env
      return yield* HttpServerResponse.json(env)
    }))
    const response = await handler(new Request("http://localhost:3000/"), Env.context({ foo: "baz" }))
    deepStrictEqual(await response.json(), {
      foo: "baz"
    })
  })

  describe("toWebHandlerLayer", () => {
    test("builds the layer when the handler is created", async () => {
      let builds = 0
      const { dispose, handler } = HttpEffect.toWebHandlerLayer(
        Effect.map(TestValue, (value) => HttpServerResponse.text(String(value))),
        Layer.effect(
          TestValue,
          Effect.sync(() => {
            builds++
            return 420
          })
        )
      )
      strictEqual(builds, 1)
      const response = await handler(new Request("http://localhost:3000/"))
      strictEqual(await response.text(), "420")
      strictEqual(builds, 1)
      await dispose()
    })

    test("a failing layer rejects every request without an unhandled rejection", async () => {
      const unhandled: Array<unknown> = []
      const onUnhandled = (reason: unknown) => {
        unhandled.push(reason)
      }
      process.on("unhandledRejection", onUnhandled)
      try {
        const error = new Error("boom")
        const { handler } = HttpEffect.toWebHandlerLayer(
          Effect.succeed(HttpServerResponse.empty()),
          Layer.effectDiscard(Effect.fail(error))
        )
        await new Promise((resolve) => setTimeout(resolve, 0))
        for (let i = 0; i < 2; i++) {
          const rejected = await handler(new Request("http://localhost:3000/")).then(
            () => undefined,
            (cause) => cause
          )
          strictEqual(rejected, error)
        }
        await new Promise((resolve) => setTimeout(resolve, 0))
        deepStrictEqual(unhandled, [])
      } finally {
        process.off("unhandledRejection", onUnhandled)
      }
    })
  })

  describe("fromWebHandler", () => {
    test("basic GET request", async () => {
      const webHandler = async (request: Request) => {
        return new Response(`Hello from ${request.url}`, {
          status: 200,
          headers: { "Content-Type": "text/plain" }
        })
      }
      const app = HttpEffect.fromWebHandler(webHandler)
      const handler = HttpEffect.toWebHandler(app)
      const response = await handler(new Request("http://localhost:3000/hello"))
      strictEqual(response.status, 200)
      strictEqual(await response.text(), "Hello from http://localhost:3000/hello")
    })

    test("POST with JSON body", async () => {
      const webHandler = async (request: Request) => {
        const body = await request.json()
        return Response.json({ received: body })
      }
      const app = HttpEffect.fromWebHandler(webHandler)
      const handler = HttpEffect.toWebHandler(app)
      const response = await handler(
        new Request("http://localhost:3000/", {
          method: "POST",
          body: JSON.stringify({ message: "hello" }),
          headers: { "Content-Type": "application/json" }
        })
      )
      deepStrictEqual(await response.json(), {
        received: { message: "hello" }
      })
    })

    test("preserves request headers", async () => {
      const webHandler = async (request: Request) => {
        return Response.json({
          authorization: request.headers.get("Authorization"),
          custom: request.headers.get("X-Custom-Header")
        })
      }
      const app = HttpEffect.fromWebHandler(webHandler)
      const handler = HttpEffect.toWebHandler(app)
      const response = await handler(
        new Request("http://localhost:3000/", {
          headers: {
            "Authorization": "Bearer token123",
            "X-Custom-Header": "custom-value"
          }
        })
      )
      deepStrictEqual(await response.json(), {
        authorization: "Bearer token123",
        custom: "custom-value"
      })
    })

    test("preserves response status and headers", async () => {
      const webHandler = async (_request: Request) => {
        return new Response("Not Found", {
          status: 404,
          statusText: "Not Found",
          headers: {
            "X-Error-Code": "RESOURCE_NOT_FOUND",
            "Content-Type": "text/plain"
          }
        })
      }
      const app = HttpEffect.fromWebHandler(webHandler)
      const handler = HttpEffect.toWebHandler(app)
      const response = await handler(new Request("http://localhost:3000/missing"))
      strictEqual(response.status, 404)
      strictEqual(response.headers.get("X-Error-Code"), "RESOURCE_NOT_FOUND")
      strictEqual(await response.text(), "Not Found")
    })

    test("round-trip with toWebHandler", async () => {
      // Create an Effect app, convert to web handler, then back to Effect app
      const originalApp = HttpServerResponse.json({ source: "effect" })
      const webHandler = HttpEffect.toWebHandler(originalApp)
      const wrappedApp = HttpEffect.fromWebHandler(webHandler)
      const finalHandler = HttpEffect.toWebHandler(wrappedApp)

      const response = await finalHandler(new Request("http://localhost:3000/"))
      deepStrictEqual(await response.json(), { source: "effect" })
    })

    test("json preserves content-type", async () => {
      const handler = HttpEffect.toWebHandler(HttpServerResponse.json({ foo: "bar" }))
      const response = await handler(new Request("http://localhost:3000/"))
      strictEqual(response.headers.get("Content-Type"), "application/json")
    })

    test("preserves response content-type header", async () => {
      const webHandler = async (_request: Request) => {
        return Response.json({ message: "hello" })
      }
      const app = HttpEffect.fromWebHandler(webHandler)
      const handler = HttpEffect.toWebHandler(app)
      const response = await handler(new Request("http://localhost:3000/"))
      strictEqual(response.headers.get("Content-Type"), "application/json")
      deepStrictEqual(await response.json(), { message: "hello" })
    })

    test("preserves custom content-type header", async () => {
      const webHandler = async (_request: Request) => {
        return new Response("<html></html>", {
          headers: { "Content-Type": "text/html; charset=utf-8" }
        })
      }
      const app = HttpEffect.fromWebHandler(webHandler)
      const handler = HttpEffect.toWebHandler(app)
      const response = await handler(new Request("http://localhost:3000/"))
      strictEqual(response.headers.get("Content-Type"), "text/html; charset=utf-8")
    })
  })
})
