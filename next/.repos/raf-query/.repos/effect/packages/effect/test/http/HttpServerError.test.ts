import { assert, describe, it } from "@effect/vitest"
import { assertNone } from "@effect/vitest/utils"
import { Cause, Effect } from "effect"
import {
  causeResponseStripped,
  HttpServerError,
  InternalError,
  isHttpServerError,
  RequestParseError,
  ResponseError,
  RouteNotFound,
  ServeError
} from "effect/http/HttpServerError"
import * as HttpServerRequest from "effect/http/HttpServerRequest"
import * as Respondable from "effect/http/HttpServerRespondable"
import * as HttpServerResponse from "effect/http/HttpServerResponse"

const makeRequest = (method: string, url: string) => HttpServerRequest.fromWeb(new Request(url, { method }))
const makeResponse = (status: number) => HttpServerResponse.empty({ status })

describe("HttpServerError", () => {
  describe("reason messages", () => {
    it("formats request reason messages", () => {
      const request = makeRequest("POST", "http://example.com/widgets")
      const parseError = new RequestParseError({
        request,
        description: "invalid body"
      })
      const routeNotFound = new RouteNotFound({ request })

      assert.strictEqual(parseError.message, "RequestParseError (POST /widgets): invalid body")
      assert.strictEqual(routeNotFound.message, "RouteNotFound (POST /widgets)")
    })

    it("formats response reason messages", () => {
      const request = makeRequest("GET", "http://example.com/tea")
      const response = makeResponse(418)
      const responseError = new ResponseError({
        request,
        response,
        description: "short and stout"
      })

      assert.strictEqual(responseError.message, "ResponseError (418 GET /tea): short and stout")
    })
  })

  describe("wrapper behavior", () => {
    it("delegates message and accessors", () => {
      const request = makeRequest("GET", "http://example.com/ok")
      const response = makeResponse(503)
      const reason = new ResponseError({ request, response })
      const error = new HttpServerError({ reason })

      assert.strictEqual(error.message, reason.message)
      assert.strictEqual(error.request, request)
      assert.strictEqual(error.response, response)
      assert.strictEqual(error.reason, reason)
    })

    it("forwards the reason cause", () => {
      const request = makeRequest("GET", "http://example.com/boom")
      const cause = new Error("boom")
      const reason = new InternalError({ request, cause })
      const error = new HttpServerError({ reason })

      assert.strictEqual(reason.cause, cause)
      assert.strictEqual(error.cause, cause)
    })
  })

  describe("respondable mapping", () => {
    it.effect("maps reasons to status codes", () =>
      Effect.gen(function*() {
        const request = makeRequest("GET", "http://example.com/status")
        const response = makeResponse(418)
        const cases: ReadonlyArray<readonly [Respondable.Respondable, number]> = [
          [new RequestParseError({ request }), 400],
          [new RouteNotFound({ request }), 404],
          [new InternalError({ request }), 500],
          [new ResponseError({ request, response }), 500],
          [new HttpServerError({ reason: new RequestParseError({ request }) }), 400]
        ]

        for (const [respondable, status] of cases) {
          const resolved = yield* Respondable.toResponse(respondable)
          assert.strictEqual(resolved.status, status)
        }
      }))
  })

  describe("isHttpServerError", () => {
    it("matches wrapper only", () => {
      const request = makeRequest("GET", "http://example.com/check")
      const wrapper = new HttpServerError({
        reason: new RouteNotFound({ request })
      })

      assert.isTrue(isHttpServerError(wrapper))
      assert.isFalse(isHttpServerError(new RouteNotFound({ request })))
      assert.isFalse(isHttpServerError(new ServeError({ cause: new Error("boom") })))
      assert.isFalse(isHttpServerError({ _tag: "HttpServerError" }))
    })
  })

  describe("causeResponseStripped", () => {
    it("returns none cause for response defects", () => {
      const response = makeResponse(418)
      const [out, cause] = causeResponseStripped(Cause.die(response))
      assert.strictEqual(out, response)
      assertNone(cause)
    })

    it("returns some cause for non-response failures", () => {
      const request = makeRequest("GET", "http://example.com/fail")
      const [out, cause] = causeResponseStripped(Cause.fail(new RouteNotFound({ request })))
      assert.strictEqual(out.status, 500)
      assert.strictEqual(cause._tag, "Some")
    })
  })
})
