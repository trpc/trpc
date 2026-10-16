import type { Effect } from "effect"
import { HttpClient, type HttpClientError, type HttpClientResponse } from "effect/http"
import type { RateLimiter } from "effect/persistence"
import { describe, expect, it } from "tstyche"

declare const client: HttpClient.HttpClient
declare const limiter: RateLimiter.RateLimiter
declare const failingClient: HttpClient.HttpClient.With<"error">
declare const recoverNumber: (error: "error") => Effect.Effect<number>
declare const recoverResponse: (error: "error") => Effect.Effect<HttpClientResponse.HttpClientResponse>

describe("HttpClient", () => {
  describe("urlParams", () => {
    it("should accept coercible records", () => {
      interface Params {
        readonly string: string
        readonly number: number
        readonly bigint: bigint
        readonly boolean: boolean
        readonly nullable: null
        readonly undefinable: undefined
        readonly array: ReadonlyArray<string | number | bigint | boolean | null | undefined>
        readonly nested: {
          readonly x: string
          readonly y: number
        }
      }

      const params: Params = {
        string: "hello",
        number: 1,
        bigint: 2n,
        boolean: true,
        nullable: null,
        undefinable: undefined,
        array: ["a", 1, 2n, true, null, undefined],
        nested: {
          x: "a",
          y: 1
        }
      }
      const request = HttpClient.get("", { urlParams: params })

      expect(request).type.toBe<
        Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError, HttpClient.HttpClient>
      >()
    })

    it("should accept interfaces", () => {
      interface Params {
        readonly q: string
      }

      const params: Params = { q: "hello" }
      const request = HttpClient.get("", { urlParams: params })

      expect(request).type.toBe<
        Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError, HttpClient.HttpClient>
      >()
    })

    it("should accept iterable tuples", () => {
      const request = HttpClient.get("", {
        urlParams: [
          ["q", "hello"],
          ["page", 1],
          ["enabled", true],
          ["version", 1n],
          ["nullable", null],
          ["optional", undefined]
        ]
      })

      expect(request).type.toBe<
        Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError, HttpClient.HttpClient>
      >()
    })

    it("should accept URLSearchParams", () => {
      const request = HttpClient.get("", {
        urlParams: new URLSearchParams([["q", "hello"]])
      })

      expect(request).type.toBe<
        Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError, HttpClient.HttpClient>
      >()
    })

    it("should reject non-urlParams input", () => {
      expect(HttpClient.get).type.not.toBeCallableWith("", { urlParams: 1 })
    })

    it("should reject non-coercible tuple values", () => {
      expect(HttpClient.get).type.not.toBeCallableWith("", {
        urlParams: [["q", { nested: "value" }]]
      })
    })
  })

  describe("retryTransient", () => {
    it("should accept retryOn values", () => {
      client.pipe(HttpClient.retryTransient({ retryOn: "errors-only" }))
      client.pipe(HttpClient.retryTransient({ retryOn: "response-only" }))
      client.pipe(HttpClient.retryTransient({ retryOn: "errors-and-responses" }))
    })

    it("should reject mode option", () => {
      client.pipe(
        // @ts-expect-error 'mode' does not exist in type '{ readonly retryOn?: ...; readonly while?: ...; readonly schedule?: ...; }'
        HttpClient.retryTransient({ mode: "errors-only" })
      )
    })

    it("should reject both retry value", () => {
      client.pipe(
        // @ts-expect-error Type '"both"' is not assignable to type '"errors-only" | "response-only" | "errors-and-responses" | undefined'
        HttpClient.retryTransient({ retryOn: "both" })
      )
    })
  })

  describe("withRateLimiter", () => {
    it("should support data-last and data-first usage", () => {
      const options = {
        limiter,
        key: "test",
        limit: 1,
        window: "1 minute",
        times: 2,
        responseHeaders: {
          limit: "x-vendor-limit",
          retryAfter: "x-vendor-retry-after"
        }
      } as const

      const dataLast = client.pipe(HttpClient.withRateLimiter(options))
      expect(dataLast).type.toBe<
        HttpClient.HttpClient.With<
          HttpClientError.HttpClientError | RateLimiter.RateLimiterError
        >
      >()

      const dataFirst = HttpClient.withRateLimiter(client, options)
      expect(dataFirst).type.toBe<
        HttpClient.HttpClient.With<
          HttpClientError.HttpClientError | RateLimiter.RateLimiterError
        >
      >()
    })
  })

  describe("catch", () => {
    it("should reject non-response data-first recoveries", () => {
      expect(HttpClient.catch).type.not.toBeCallableWith(failingClient, recoverNumber)
    })

    it("should accept response data-first recoveries", () => {
      expect(HttpClient.catch).type.toBeCallableWith(failingClient, recoverResponse)
    })
  })
})
