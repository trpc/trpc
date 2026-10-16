import { assert, describe, it } from "@effect/vitest"
import { Context, Effect, Stream } from "effect"
import { Cookies, HttpBody, HttpClientRequest, HttpClientResponse, HttpServerResponse } from "effect/http"

const TestValue = Context.Reference<number>("test/TestValue", { defaultValue: () => 0 })

describe("HttpServerResponse", () => {
  describe("toWeb", () => {
    it.each([
      { status: 204, withoutBody: false },
      { status: 205, withoutBody: false },
      { status: 304, withoutBody: true }
    ])(
      "prefers outer status $status and merges raw Response headers with withoutBody=$withoutBody",
      ({ status, withoutBody }) => {
        const nativeCookies = ["sid=abc; Path=/; HttpOnly", "theme=dark; Path=/"]
        const native = new Response("cached body", {
          status: 200,
          statusText: "Native status",
          headers: [
            ["etag", "\"version-1\""],
            ["x-shared", "native"],
            ...nativeCookies.map((cookie): [string, string] => ["set-cookie", cookie])
          ]
        })
        const web = HttpServerResponse.toWeb(
          HttpServerResponse.raw(native, {
            status,
            statusText: "Outer status",
            headers: { "x-outer": "outer", "x-shared": "outer" },
            cookies: Cookies.setAllUnsafe(Cookies.empty, [["a", "1", {}], ["b", "2", {}]])
          }),
          { withoutBody }
        )

        assert.strictEqual(web.status, status)
        assert.strictEqual(web.statusText, "Outer status")
        assert.strictEqual(web.body, null)
        assert.strictEqual(web.headers.get("etag"), "\"version-1\"")
        assert.strictEqual(web.headers.get("x-outer"), "outer")
        assert.strictEqual(web.headers.get("x-shared"), "outer")
        assert.deepStrictEqual(web.headers.getSetCookie(), [...nativeCookies, "a=1", "b=2"])
      }
    )

    it("preserves raw Response metadata for HEAD", () => {
      const native = new Response("body", {
        status: 202,
        statusText: "Accepted by upstream",
        headers: { "x-probe": "native", "set-cookie": "sid=abc" }
      })
      const web = HttpServerResponse.toWeb(
        HttpServerResponse.raw(native, { status: 200, statusText: "Outer status" }),
        { withoutBody: true }
      )

      assert.strictEqual(web.body, null)
      assert.strictEqual(web.status, 202)
      assert.strictEqual(web.statusText, "Accepted by upstream")
      assert.strictEqual(web.headers.get("x-probe"), "native")
      assert.deepStrictEqual(web.headers.getSetCookie(), ["sid=abc"])
    })

    it("returns the raw Response with merged headers for GET", async () => {
      const native = new Response("body", {
        status: 202,
        statusText: "Accepted by upstream",
        headers: { "x-probe": "native", "x-shared": "native", "set-cookie": "sid=abc; Path=/; HttpOnly" }
      })
      const web = HttpServerResponse.toWeb(
        HttpServerResponse.raw(native, {
          headers: { "x-outer": "outer", "x-shared": "outer" },
          cookies: Cookies.setAllUnsafe(Cookies.empty, [["a", "1", {}], ["b", "2", {}]])
        })
      )

      assert.strictEqual(web, native)
      assert.strictEqual(web.status, 202)
      assert.strictEqual(web.statusText, "Accepted by upstream")
      assert.strictEqual(web.headers.get("x-probe"), "native")
      assert.strictEqual(web.headers.get("x-outer"), "outer")
      assert.strictEqual(web.headers.get("x-shared"), "outer")
      assert.deepStrictEqual(web.headers.getSetCookie(), ["sid=abc; Path=/; HttpOnly", "a=1", "b=2"])
      assert.strictEqual(await web.text(), "body")
    })

    it.each([
      { status: 200, withoutBody: true },
      { status: 304, withoutBody: false }
    ])(
      "preserves representation headers for status $status with withoutBody=$withoutBody",
      ({ status, withoutBody }) => {
        const web = HttpServerResponse.toWeb(HttpServerResponse.text("body", { status }), { withoutBody })

        assert.strictEqual(web.body, null)
        assert.strictEqual(web.headers.get("content-length"), "4")
        assert.strictEqual(web.headers.get("content-type"), "text/plain")
      }
    )

    it.each([
      { status: 200, withoutBody: true },
      { status: 204, withoutBody: false },
      { status: 205, withoutBody: false },
      { status: 304, withoutBody: false }
    ])("cancels raw streams for status $status with withoutBody=$withoutBody", async ({ status, withoutBody }) => {
      let cancelled = false
      const body = new ReadableStream({
        cancel() {
          cancelled = true
        }
      })
      try {
        const web = HttpServerResponse.toWeb(HttpServerResponse.raw(body, { status }), { withoutBody })

        assert.strictEqual(web.status, status)
        assert.strictEqual(web.body, null)
        assert.strictEqual(await web.text(), "")
        assert.strictEqual(cancelled, true)
      } finally {
        await body.cancel()
      }
    })

    for (const status of [204, 205, 304]) {
      it.each([
        { name: "text", response: HttpServerResponse.text("body", { status }) },
        { name: "uint8Array", response: HttpServerResponse.uint8Array(new Uint8Array([1]), { status }) },
        { name: "raw", response: HttpServerResponse.raw("body", { status }) },
        { name: "formData", response: HttpServerResponse.formData(new FormData(), { status }) },
        { name: "stream", response: HttpServerResponse.stream(Stream.succeed(new Uint8Array([1])), { status }) }
      ])(`omits $name bodies for status ${status}`, ({ response }) => {
        const web = HttpServerResponse.toWeb(response)

        assert.strictEqual(web.status, status)
        assert.strictEqual(web.body, null)
      })
    }
  })

  it("setHeader overrides body-derived content headers", () => {
    const response = HttpServerResponse.text("body").pipe(
      HttpServerResponse.setHeader("content-type", "text/custom"),
      HttpServerResponse.setHeader("content-length", "1")
    )

    assert.strictEqual(response.headers["content-type"], "text/custom")
    assert.strictEqual(response.headers["content-length"], "1")
  })

  it.effect("fromWeb preserves content-length through a Web round trip", () =>
    Effect.gen(function*() {
      const response = HttpServerResponse.fromWeb(
        new Response("hello", { headers: { "content-length": "5" } })
      )
      const roundTrip = HttpServerResponse.toWeb(response)

      assert.strictEqual(yield* Effect.promise(() => roundTrip.text()), "hello")
      assert.strictEqual(roundTrip.headers.get("content-length"), "5")
    }))

  describe("toClientResponse", () => {
    it.effect("supports repeated reads of raw Web Response bodies", () =>
      Effect.gen(function*() {
        const clientResponse = HttpServerResponse.toClientResponse(
          HttpServerResponse.raw(new Response("hello"))
        )

        assert.strictEqual(yield* clientResponse.text, "hello")
        assert.strictEqual(yield* clientResponse.text, "hello")
        assert.deepStrictEqual(new Uint8Array(yield* clientResponse.arrayBuffer), new TextEncoder().encode("hello"))
      }))

    it.effect("leaves the raw Web Response servable after a client-body read", () =>
      Effect.gen(function*() {
        const response = HttpServerResponse.raw(new Response("hello"))

        assert.strictEqual(yield* HttpServerResponse.toClientResponse(response).text, "hello")
        assert.strictEqual(yield* Effect.promise(() => HttpServerResponse.toWeb(response).text()), "hello")
      }))
  })

  it.effect("fromClientResponse preserves status, headers, cookies, and json", () =>
    Effect.gen(function*() {
      const request = HttpClientRequest.get("http://localhost:3000/todos/1?existing=1", {
        urlParams: { value: "a#b" },
        hash: "fragment"
      })
      const clientResponse = HttpServerResponse.toClientResponse(
        HttpServerResponse.jsonUnsafe({ foo: "bar" }, { status: 201 }).pipe(
          HttpServerResponse.setHeader("x-test", "ok"),
          HttpServerResponse.setCookieUnsafe("session", "123")
        ),
        { request }
      )

      const response = HttpServerResponse.fromClientResponse(clientResponse)
      const roundTrip = HttpServerResponse.toClientResponse(response, { request })

      assert.strictEqual(clientResponse.url, "http://localhost:3000/todos/1?existing=1&value=a%23b")
      assert.strictEqual(roundTrip.url, clientResponse.url)
      assert.strictEqual(response.status, 201)
      assert.strictEqual(response.headers["content-type"], "application/json")
      assert.strictEqual(response.headers["x-test"], "ok")
      assert.strictEqual(response.headers["set-cookie"], undefined)
      assert.strictEqual(response.cookies.cookies.session?.value, "123")
      assert.deepStrictEqual(yield* roundTrip.json, { foo: "bar" })
    }))

  it.effect("fromClientResponse preserves stream requirements", () =>
    Effect.gen(function*() {
      const clientResponse = HttpServerResponse.toClientResponse(
        HttpServerResponse.stream(
          Stream.fromEffect(TestValue).pipe(
            Stream.map(String),
            Stream.encodeText
          )
        )
      )

      const response = HttpServerResponse.fromClientResponse(clientResponse)
      const roundTrip = HttpServerResponse.toClientResponse(response)
      assert.strictEqual(roundTrip.url, "")
      const text = yield* roundTrip.text.pipe(
        Effect.provideService(TestValue, 420)
      )

      assert.strictEqual(text, "420")
    }))

  it.effect("fromClientResponse preserves formData bodies", () =>
    Effect.gen(function*() {
      const formData = new FormData()
      formData.set("foo", "bar")

      const response = HttpServerResponse.fromClientResponse(
        HttpServerResponse.toClientResponse(HttpServerResponse.formData(formData))
      )
      const roundTrip = HttpServerResponse.toClientResponse(response)
      const parsed = yield* roundTrip.formData

      assert.strictEqual(
        response.headers["content-type"]?.startsWith("multipart/form-data; boundary="),
        true
      )
      assert.strictEqual(parsed.get("foo"), "bar")
    }))

  it.effect("fromClientResponse turns empty client bodies into empty server streams", () =>
    Effect.gen(function*() {
      const request = HttpClientRequest.get("http://localhost:3000/empty")
      const clientResponse = HttpClientResponse.fromWeb(request, new Response(null, { status: 200 }))
      const response = HttpServerResponse.fromClientResponse(clientResponse)
      const roundTrip = HttpServerResponse.toClientResponse(response, { request })

      assert.strictEqual(response.status, 200)
      assert.strictEqual(yield* roundTrip.text, "")
    }))

  it("fromClientResponse ignores malformed or unsafe content lengths", () => {
    const request = HttpClientRequest.get("http://localhost:3000")
    for (const contentLength of ["2junk", "1.5", "1e3", "9007199254740992"]) {
      const clientResponse = HttpClientResponse.fromWeb(
        request,
        new Response("hello", { headers: { "content-length": contentLength } })
      )
      const response = HttpServerResponse.fromClientResponse(clientResponse)

      assert.strictEqual(response.body._tag, "Stream")
      if (response.body._tag === "Stream") {
        assert.strictEqual(response.body.contentLength, undefined)
      }
    }
  })

  it("synchronizes body metadata headers for empty and replaced bodies", () => {
    const emptyBytes = HttpServerResponse.uint8Array(new Uint8Array())
    assert.strictEqual(emptyBytes.headers["content-length"], "0")

    const replaced = HttpServerResponse.setBody(HttpServerResponse.text("abc"), HttpBody.empty)
    assert.notProperty(replaced.headers, "content-type")
    assert.notProperty(replaced.headers, "content-length")

    const streamed = HttpServerResponse.setBody(
      HttpServerResponse.text("abc"),
      HttpBody.stream(Stream.empty, "application/octet-stream")
    )
    assert.strictEqual(streamed.headers["content-type"], "application/octet-stream")
    assert.notProperty(streamed.headers, "content-length")
  })
})
