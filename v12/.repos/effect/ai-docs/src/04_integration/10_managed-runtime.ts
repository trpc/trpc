/**
 * @title Using ManagedRuntime with Hono
 *
 * Use `ManagedRuntime` to run Effect programs from external frameworks while keeping your domain logic in services and Layers.
 */
import { Context, Effect, Layer, ManagedRuntime, Ref, Schema } from "effect"
import { Hono } from "hono"

class Todo extends Schema.Class<Todo>("Todo")({
  id: Schema.Int,
  title: Schema.String,
  completed: Schema.Boolean
}) {}

class CreateTodoPayload extends Schema.Class<CreateTodoPayload>("CreateTodoPayload")({
  title: Schema.String
}) {}

class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", {
  id: Schema.Int
}) {}

export class TodoRepo extends Context.Service<TodoRepo, {
  readonly getAll: Effect.Effect<ReadonlyArray<Todo>>
  getById(id: number): Effect.Effect<Todo, TodoNotFound>
  create(payload: CreateTodoPayload): Effect.Effect<Todo>
}>()("app/TodoRepo") {
  static readonly layer = Layer.effect(
    TodoRepo,
    Effect.gen(function*() {
      const store = new Map<number, Todo>()
      const nextId = yield* Ref.make(1)

      const getAll = Effect.gen(function*() {
        return Array.from(store.values())
      }).pipe(
        Effect.withSpan("TodoRepo.getAll")
      )

      const getById = Effect.fn("TodoRepo.getById")(function*(id: number) {
        const todo = store.get(id)
        if (todo === undefined) {
          return yield* new TodoNotFound({ id })
        }
        return todo
      })

      const create = Effect.fn("TodoRepo.create")(function*(payload: CreateTodoPayload) {
        const id = yield* Ref.getAndUpdate(nextId, (current) => current + 1)
        const todo = new Todo({ id, title: payload.title, completed: false })
        store.set(id, todo)
        return todo
      })

      return TodoRepo.of({ getAll, getById, create })
    })
  )
}

// Create a global memo map that can be shared across the app. This is necessary
// for memoization to work correctly across ManagedRuntime instances.
export const appMemoMap = Layer.makeMemoMapUnsafe()

// Create a ManagedRuntime for the TodoRepo layer. This runtime can be shared
// across all handlers in the app, and it will manage the lifecycle of the
// TodoRepo service and any resources it uses.
export const runtime = ManagedRuntime.make(TodoRepo.layer, {
  memoMap: appMemoMap
})

export const app = new Hono()

app.get("/todos", async (context) => {
  const todos = await runtime.runPromise(
    TodoRepo.use((repo) => repo.getAll)
  )
  return context.json(todos)
})

app.get("/todos/:id", async (context) => {
  const id = Number(context.req.param("id"))
  if (!Number.isFinite(id)) {
    return context.json({ message: "Todo id must be a number" }, 400)
  }

  const todo = await runtime.runPromise(
    TodoRepo.use((repo) => repo.getById(id)).pipe(
      Effect.catchTag("TodoNotFound", () => Effect.succeed(null))
    )
  )

  if (todo === null) {
    return context.json({ message: "Todo not found" }, 404)
  }

  return context.json(todo)
})

const decodeCreateTodoPayload = Schema.decodeUnknownSync(CreateTodoPayload)

app.post("/todos", async (context) => {
  const body = await context.req.json()

  let payload: CreateTodoPayload
  try {
    payload = decodeCreateTodoPayload(body)
  } catch {
    return context.json({ message: "Invalid request body" }, 400)
  }

  const todo = await runtime.runPromise(
    TodoRepo.use((repo) => repo.create(payload))
  )

  return context.json(todo, 201)
})

// The same bridge pattern works for Express, Fastify, Koa, and other frameworks.
// Use `runtime.runSync` for synchronous edges or `runtime.runCallback` for
// callback-only APIs.

// When the process receives a shutdown signal, dispose the runtime to clean up
// any resources used by the TodoRepo service and its dependencies.
const shutdown = () => {
  void runtime.dispose()
}

process.once("SIGINT", shutdown)
process.once("SIGTERM", shutdown)
