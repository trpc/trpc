import { Effect, Schema, Stream } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { HttpApi, HttpApiClient, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { Bench } from "tinybench"

const Event = Schema.Struct({
  event: Schema.Literal("tick"),
  data: Schema.String
})

const Api = HttpApi.make("Api").add(
  HttpApiGroup.make("test").add(
    HttpApiEndpoint.get("events", "/events", {
      success: HttpApiSchema.StreamSse({
        events: Event,
        error: Schema.String
      })
    })
  )
)

const httpClient = HttpClient.make((request) =>
  Effect.sync(() =>
    HttpClientResponse.fromWeb(
      request,
      new Response("event: tick\ndata: payload\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      })
    )
  )
)

const client = await Effect.runPromise(HttpApiClient.makeWith(Api, {
  baseUrl: "http://localhost",
  httpClient
}))
const consumeResponse = Effect.flatMap(client.test.events({}), Stream.runDrain)
const responsesPerIteration = 25
const responses = Array.from({ length: responsesPerIteration })
const runIteration = Effect.forEach(responses, () => consumeResponse, {
  concurrency: 1,
  discard: true
})

const bench = new Bench({ time: 3000 })

bench.add(`${responsesPerIteration} sequential SSE responses through one client`, () => Effect.runPromise(runIteration))

await bench.run()

console.table(bench.table())
