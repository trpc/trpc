import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http"

describe("FetchHttpClient", () => {
  it.effect("sends bodies from Web requests", () =>
    Effect.gen(function*() {
      const request = HttpClientRequest.fromWeb(
        new Request("https://example.test/?existing=1#fragment", { method: "POST", body: "hello" })
      ).pipe(HttpClientRequest.setUrlParam("value", "a#b"))
      const client = yield* HttpClient.HttpClient
      const response = yield* client.execute(request)
      assert.strictEqual(response.url, "https://example.test/?existing=1&value=a%23b")
      assert.strictEqual(yield* response.text, "hello")
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(
        FetchHttpClient.Fetch,
        Object.assign(
          async (...args: Parameters<typeof globalThis.fetch>) => new Response(await new Request(...args).text()),
          { preconnect: () => {} }
        )
      )
    ))
})
