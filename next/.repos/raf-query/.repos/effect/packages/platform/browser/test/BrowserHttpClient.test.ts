import * as BrowserHttpClient from "@effect/platform-browser/BrowserHttpClient"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Cookies from "effect/http/Cookies"
import * as HttpClient from "effect/http/HttpClient"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import * as MXHR from "mock-xmlhttprequest"

const layer = (routes: Parameters<typeof MXHR.newServer>[0], responseURL = "") =>
  Layer.unwrap(Effect.sync(() => {
    const server = MXHR.newServer(routes)
    return BrowserHttpClient.layerXMLHttpRequest.pipe(
      Layer.provide(Layer.succeed(BrowserHttpClient.XMLHttpRequest, () => {
        const xhr = server.xhrFactory()
        xhr.responseURL = responseURL
        return xhr
      }))
    )
  }))

describe("BrowserHttpClient", () => {
  it.effect("json", () =>
    Effect.gen(function*() {
      const response = yield* HttpClient.get("http://localhost:8080/my/url")
      assert.strictEqual(response.url, "http://localhost:8080/final?value=1")
      assert.deepStrictEqual(yield* response.json, { message: "Success!" })
    }).pipe(Effect.provide(layer({
      get: ["http://localhost:8080/my/url", {
        headers: { "Content-Type": "application/json" },
        body: "{ \"message\": \"Success!\" }"
      }]
    }, "http://localhost:8080/final?value=1#fragment"))))

  it.effect("stream", () =>
    Effect.gen(function*() {
      const response = yield* HttpClient.get("http://localhost:8080/my/url?existing=1", {
        urlParams: { value: "a#b" },
        hash: "fragment"
      })
      assert.strictEqual(response.url, "http://localhost:8080/my/url?existing=1&value=a%23b")
      const body = yield* response.stream.pipe(Stream.decodeText(), Stream.mkString)
      assert.deepStrictEqual(body, "{ \"message\": \"Success!\" }")
    }).pipe(Effect.provide(layer({
      get: ["http://localhost:8080/my/url?existing=1&value=a%23b#fragment", {
        headers: { "Content-Type": "application/json" },
        body: "{ \"message\": \"Success!\" }"
      }]
    }))))

  it.effect("cookies", () =>
    Effect.gen(function*() {
      const cookies = yield* HttpClient.get("http://localhost:8080/my/url").pipe(
        Effect.map((response) => response.cookies)
      )
      assert.deepStrictEqual(Cookies.toRecord(cookies), {
        foo: "bar"
      })
    }).pipe(Effect.provide(layer({
      get: ["http://localhost:8080/my/url", {
        headers: { "Content-Type": "application/json", "Set-Cookie": "foo=bar; HttpOnly; Secure" },
        body: "{ \"message\": \"Success!\" }"
      }]
    }))))

  it.effect("arrayBuffer", () =>
    Effect.gen(function*() {
      const body = yield* HttpClient.get("http://localhost:8080/my/url").pipe(
        Effect.flatMap((response) => response.arrayBuffer),
        BrowserHttpClient.withXHRArrayBuffer
      )
      assert.strictEqual(new TextDecoder().decode(body), "{ \"message\": \"Success!\" }")
    }).pipe(Effect.provide(layer({
      get: ["http://localhost:8080/my/url", {
        headers: { "Content-Type": "application/json" },
        body: "{ \"message\": \"Success!\" }"
      }]
    }))))

  it.effect("arrayBuffer without withXHRArrayBuffer", () =>
    Effect.gen(function*() {
      const body = yield* HttpClient.get("http://localhost:8080/my/url").pipe(
        Effect.flatMap((response) => response.arrayBuffer)
      )
      assert.strictEqual(new TextDecoder().decode(body), "{ \"message\": \"Success!\" }")
    }).pipe(Effect.provide(layer({
      get: ["http://localhost:8080/my/url", {
        headers: { "Content-Type": "application/json" },
        body: "{ \"message\": \"Success!\" }"
      }]
    }))))

  it.effect("readers in ArrayBuffer mode", () =>
    Effect.gen(function*() {
      const response = yield* HttpClient.get("http://localhost:8080/my/url").pipe(
        BrowserHttpClient.withXHRArrayBuffer
      )
      assert.strictEqual(yield* response.text, "{ \"message\": \"café\" }")
      assert.deepStrictEqual(yield* response.json, { message: "café" })
      assert.strictEqual(
        yield* response.stream.pipe(Stream.decodeText(), Stream.mkString),
        "{ \"message\": \"café\" }"
      )
    }).pipe(Effect.provide(layer({
      get: ["http://localhost:8080/my/url", {
        headers: { "Content-Type": "application/json" },
        body: "{ \"message\": \"café\" }"
      }]
    }))))

  it.effect("decodes an XHR response as FormData", () =>
    Effect.gen(function*() {
      const formData = yield* HttpClient.get("http://localhost/form").pipe(
        Effect.flatMap((response) => response.formData)
      )
      assert.strictEqual(formData.get("value"), "test")
    }).pipe(Effect.provide(layer({
      get: ["http://localhost/form", {
        headers: { "content-type": "multipart/form-data; boundary=x" },
        body: "--x\r\nContent-Disposition: form-data; name=\"value\"\r\n\r\ntest\r\n--x--\r\n"
      }]
    }))))
})
