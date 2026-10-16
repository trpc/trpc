import * as Effect from "effect/Effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"

Effect.gen(function*() {
  const client = yield* HttpClient.HttpClient
  const res = yield* client.get("https://jsonplaceholder.typicode.com/posts/1")
  yield* res.json
}).pipe(
  Effect.provide(FetchHttpClient.layer),
  Effect.runPromise
)
