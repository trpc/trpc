/**
 * @title Getting started with HttpClient
 *
 * Define a service that uses the HttpClient module to fetch data from an external API
 */
import { Context, Effect, flow, Layer, Schedule, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"

class Todo extends Schema.Class<Todo>("Todo")({
  userId: Schema.Int,
  id: Schema.Int,
  title: Schema.String,
  completed: Schema.Boolean
}) {}

export class JsonPlaceholder extends Context.Service<JsonPlaceholder, {
  readonly allTodos: Effect.Effect<ReadonlyArray<Todo>, JsonPlaceholderError>
  getTodo(id: number): Effect.Effect<Todo, JsonPlaceholderError>
  createTodo(todo: Omit<Todo, "id">): Effect.Effect<Todo, JsonPlaceholderError>
}>()("app/JsonPlaceholder") {
  static readonly layer = Layer.effect(
    JsonPlaceholder,
    Effect.gen(function*() {
      // Access the HttpClient service, and apply some common middleware to all
      // requests:
      const client = (yield* HttpClient.HttpClient).pipe(
        // Add a base URL to all requests made with this client, and set the
        // Accept header to expect JSON responses
        HttpClient.mapRequest(flow(
          HttpClientRequest.prependUrl("https://jsonplaceholder.typicode.com"),
          HttpClientRequest.acceptJson
        )),
        // Fail if the response status is not 2xx
        HttpClient.filterStatusOk,
        // Retry transient errors (network issues, 5xx responses) with an
        // exponential backoff.
        //
        // See the schedule documentation for more complex retry strategies.
        HttpClient.retryTransient({
          schedule: Schedule.exponential(100),
          times: 3
        })
      )

      const allTodos = client.get("/todos").pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Array(Todo))),
        Effect.mapError((cause) => new JsonPlaceholderError({ cause })),
        Effect.withSpan("JsonPlaceholder.allTodos")
      )

      // Use the HttpClient to fetch a todo item by id, and decode the response
      // using the Todo schema.
      const getTodo = Effect.fn("JsonPlaceholder.getTodo")(function*(id: number) {
        // Annotate the current span with the id of the todo being fetched, so
        // that it shows up in telemetry for this request.
        yield* Effect.annotateCurrentSpan({ id })

        const todo = yield* client.get(`/todos/${id}`, {
          // You can pass additional options to individual requests.
          // There are options for query parameters, request body, headers, and
          // more.
          urlParams: { format: "json" }
        }).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(Todo)),
          Effect.mapError((cause) => new JsonPlaceholderError({ cause }))
        )

        return todo
      })

      // You can use the HttpClientRequest module to build up more complex
      // requests:
      const createTodo = Effect.fn("JsonPlaceholder.createTodo")(function*(todo: Omit<Todo, "id">) {
        yield* Effect.annotateCurrentSpan({ title: todo.title })

        const createdTodo = yield* HttpClientRequest.post("/todos").pipe(
          // The HttpClientRequest module has many helper functions for building requests.
          HttpClientRequest.setUrlParams({ format: "json" }),
          HttpClientRequest.bodyJsonUnsafe(todo),
          client.execute,
          Effect.flatMap(HttpClientResponse.schemaBodyJson(Todo)),
          Effect.mapError((cause) => new JsonPlaceholderError({ cause }))
        )

        return createdTodo
      })

      return JsonPlaceholder.of({
        allTodos,
        getTodo,
        createTodo
      })
    })
  ).pipe(
    // Provide the fetch-based HttpClient implementation
    Layer.provide(FetchHttpClient.layer)
  )
}

export class JsonPlaceholderError extends Schema.TaggedError<JsonPlaceholderError>()("JsonPlaceholderError", {
  cause: Schema.Defect()
}) {}
