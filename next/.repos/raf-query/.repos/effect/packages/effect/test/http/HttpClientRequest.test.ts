import { describe, it } from "@effect/vitest"
import { assertNone, assertSome, assertTrue, deepStrictEqual, strictEqual } from "@effect/vitest/utils"
import { ByteSize, Effect, FileSystem, Stream } from "effect"
import { Headers, HttpBody, HttpClientRequest } from "effect/http"
import * as Option from "effect/Option"

describe("HttpClientRequest", () => {
  describe("bodyFile", () => {
    const oversized = 9007199254740993n
    const fileSystem = (size: bigint) =>
      FileSystem.makeNoop({
        stat: () => Effect.succeed({ size: ByteSize.bytes(size) } as FileSystem.File.Info),
        stream: () => Stream.empty
      })

    it.each([
      { name: "unsafe bigint offset", size: oversized + 3n, options: { offset: oversized }, expected: 3 },
      { name: "range past EOF", size: 6n, options: { offset: 7 }, expected: 0 }
    ])("sets the exact outgoing Content-Length for $name", async ({ expected, options, size }) => {
      const request = await Effect.runPromise(
        HttpClientRequest.post("https://example.com").pipe(
          HttpClientRequest.bodyText("stale"),
          HttpClientRequest.bodyFile("x", { ...options, contentType: "application/octet-stream" }),
          Effect.provideService(FileSystem.FileSystem, fileSystem(size))
        )
      )
      strictEqual(request.body._tag, "Stream")
      if (request.body._tag === "Stream") {
        strictEqual(request.body.contentLength, expected)
      }
      strictEqual(request.headers["content-length"], String(expected))
      strictEqual(request.headers["content-type"], "application/octet-stream")
      const web = await Effect.runPromise(HttpClientRequest.toWeb(request))
      strictEqual(web.headers.get("content-length"), String(expected))
    })

    it("propagates typed BadArgument from file range validation", async () => {
      const request = HttpClientRequest.bodyFile(HttpClientRequest.post("https://example.com"), "x", {
        // @ts-expect-error Exercise runtime validation of malformed input.
        bytesToRead: "garbage"
      })
      const error = await Effect.runPromise(request.pipe(
        Effect.flip,
        Effect.provideService(FileSystem.FileSystem, fileSystem(6n))
      ))
      strictEqual(error._tag, "PlatformError")
      strictEqual(error.reason._tag, "BadArgument")
    })
  })

  describe("appendUrl", () => {
    it("joins segments without slashes", () => {
      const request = HttpClientRequest.get("base").pipe(
        HttpClientRequest.appendUrl("users")
      )

      strictEqual(request.url, "base/users")
    })

    it("avoids double slashes", () => {
      const request = HttpClientRequest.get("base/").pipe(
        HttpClientRequest.appendUrl("/users")
      )

      strictEqual(request.url, "base/users")
    })

    it("preserves existing slash", () => {
      const request = HttpClientRequest.get("base/").pipe(
        HttpClientRequest.appendUrl("users")
      )

      strictEqual(request.url, "base/users")
    })

    it("preserves leading slash", () => {
      const request = HttpClientRequest.get("base").pipe(
        HttpClientRequest.appendUrl("/users")
      )

      strictEqual(request.url, "base/users")
    })

    it("no-ops on empty path", () => {
      const request = HttpClientRequest.get("base").pipe(
        HttpClientRequest.appendUrl("")
      )

      strictEqual(request.url, "base")
    })
  })

  describe("bodyFormDataRecord", () => {
    it("creates a form data body from a record", () => {
      const request = HttpClientRequest.post("/").pipe(
        HttpClientRequest.bodyFormDataRecord({
          a: "a",
          b: 1,
          c: true,
          d: null,
          e: undefined,
          f: ["x", 2, false, null, undefined]
        })
      )

      strictEqual(request.body._tag, "FormData")
      if (request.body._tag === "FormData") {
        strictEqual(request.body.formData.get("a"), "a")
        strictEqual(request.body.formData.get("b"), "1")
        strictEqual(request.body.formData.get("c"), "true")
        strictEqual(request.body.formData.has("d"), false)
        strictEqual(request.body.formData.has("e"), false)
        strictEqual(request.body.formData.getAll("f").join(","), "x,2,false")
      }
    })

    it("removes content headers when switching to form data", () => {
      const request = HttpClientRequest.post("/").pipe(
        HttpClientRequest.bodyText("hello"),
        HttpClientRequest.bodyFormDataRecord({ a: "a" })
      )

      strictEqual(request.headers["content-type"], undefined)
      strictEqual(request.headers["content-length"], undefined)
    })
  })

  describe("setBody", () => {
    it("removes stale content length when the replacement body has no known length", () => {
      const request = HttpClientRequest.bodyText(HttpClientRequest.post("https://example.com"), "abc").pipe(
        HttpClientRequest.setBody(HttpBody.stream(Stream.empty))
      )

      strictEqual(request.headers["content-length"], undefined)
    })
  })

  describe("removeHeader", () => {
    it("removes an existing header", () => {
      const request = HttpClientRequest.get("/").pipe(
        HttpClientRequest.setHeader("X-Test", "ok"),
        HttpClientRequest.removeHeader("X-Test")
      )

      strictEqual(request.headers["x-test"], undefined)
    })

    it("no-ops on a missing header", () => {
      const request = HttpClientRequest.get("/").pipe(
        HttpClientRequest.setHeader("X-Test", "ok")
      )
      const removed = HttpClientRequest.removeHeader(request, "X-Missing")

      deepStrictEqual(removed.headers, request.headers)
    })

    it("preserves the request prototype", () => {
      const request = HttpClientRequest.get("/").pipe(
        HttpClientRequest.removeHeader("X-Test")
      )

      assertTrue(HttpClientRequest.isHttpClientRequest(request))
    })
  })

  describe("updateHeaders", () => {
    it("transforms the header collection", () => {
      const request = HttpClientRequest.get("/").pipe(
        HttpClientRequest.setHeaders({ "X-A": "a", "X-B": "b" }),
        HttpClientRequest.updateHeaders((headers) => Headers.set(Headers.remove(headers, "X-A"), "X-C", "c"))
      )

      deepStrictEqual(request.headers, Headers.fromInput({ "x-b": "b", "x-c": "c" }))
    })

    it("preserves the request prototype", () => {
      const request = HttpClientRequest.get("/").pipe(
        HttpClientRequest.updateHeaders(Headers.set("X-Test", "ok"))
      )

      assertTrue(HttpClientRequest.isHttpClientRequest(request))
      strictEqual(request.headers["x-test"], "ok")
    })

    it("supports the data-first overload", () => {
      const request = HttpClientRequest.get("/")
      const updated = HttpClientRequest.updateHeaders(request, Headers.set("X-Test", "ok"))

      strictEqual(updated.headers["x-test"], "ok")
    })
  })

  describe("hash", () => {
    it("stores hash as Option", () => {
      const request = HttpClientRequest.get(new URL("http://example.com/path?x=1#section"))
      assertSome(request.hash, "section")
      const url = HttpClientRequest.toUrl(request)
      if (Option.isNone(url)) {
        throw new Error("Expected toUrl to return Some")
      }
      strictEqual(url.value.toString(), "http://example.com/path?x=1#section")
    })

    it("removes hash", () => {
      const request = HttpClientRequest.get("http://example.com").pipe(
        HttpClientRequest.setHash("section"),
        HttpClientRequest.removeHash
      )
      assertNone(request.hash)
    })

    it("returns none for invalid url", () => {
      const request = HttpClientRequest.get("http://example.com").pipe(
        HttpClientRequest.setUrl("http://[::1")
      )
      assertNone(HttpClientRequest.toUrl(request))
    })
  })

  describe("web conversions", () => {
    it.effect("fromWeb", () =>
      Effect.gen(function*() {
        const webRequest = new Request("http://localhost:3000/todos/1?a=1&a=2#top", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": "13",
            "x-test": "ok"
          },
          body: "{\"foo\":\"bar\"}"
        })
        const request = HttpClientRequest.fromWeb(webRequest)

        strictEqual(request.method, "POST")
        strictEqual(request.url, "http://localhost:3000/todos/1")
        assertSome(request.hash, "top")
        strictEqual(request.headers["content-type"], "application/json")
        strictEqual(request.headers["content-length"], "13")
        strictEqual(request.headers["x-test"], "ok")
        deepStrictEqual([...request.urlParams], [["a", "1"], ["a", "2"]])
        strictEqual(request.body._tag, "Raw")

        const webRequest2 = yield* HttpClientRequest.toWeb(request)
        strictEqual(yield* Effect.promise(() => webRequest2.text()), "{\"foo\":\"bar\"}")
      }))

    it("fromWeb ignores malformed or unsafe content lengths", () => {
      for (const contentLength of ["2junk", "1.5", "1e3", "9007199254740992"]) {
        const request = HttpClientRequest.fromWeb(
          new Request("http://localhost:3000", {
            method: "POST",
            headers: { "content-length": contentLength },
            body: "hello"
          })
        )

        strictEqual(request.headers["content-length"], undefined)
        strictEqual(request.body._tag, "Raw")
        if (request.body._tag === "Raw") {
          strictEqual(request.body.contentLength, undefined)
        }
      }
    })

    it.effect("toWeb stream body", () =>
      Effect.gen(function*() {
        const body = new Uint8Array([104, 101, 108, 108, 111])
        const request = HttpClientRequest.post("http://localhost:3000/stream").pipe(
          HttpClientRequest.bodyStream(Stream.succeed(body), {
            contentType: "text/plain",
            contentLength: body.length
          })
        )
        const webRequest = yield* HttpClientRequest.toWeb(request)

        strictEqual(webRequest.method, "POST")
        strictEqual(webRequest.url, "http://localhost:3000/stream")
        strictEqual(yield* Effect.promise(() => webRequest.text()), "hello")
      }))

    it("toWebResult returns failure for invalid url", () => {
      const request = HttpClientRequest.get("http://localhost").pipe(
        HttpClientRequest.setUrl("http://[::1")
      )
      const result = HttpClientRequest.toWebResult(request)

      strictEqual(result._tag, "Failure")
    })
  })
})
