/**
 * @title Testing services with shared layers
 *
 * How to test Effect services that depend on other services.
 */
import { assert, describe, it, layer } from "@effect/vitest"
import { Array, Context, Effect, Layer, Ref } from "effect"

export interface Todo {
  readonly id: number
  readonly title: string
}

// Create a test ref service that can be used to store and manipulate test data
// in layers.
export class TodoRepoTestRef extends Context.Service<TodoRepoTestRef, Ref.Ref<Array<Todo>>>()("app/TodoRepoTestRef") {
  static readonly layer = Layer.effect(TodoRepoTestRef, Ref.make(Array.empty()))
}

class TodoRepo extends Context.Service<TodoRepo, {
  create(title: string): Effect.Effect<Todo>
  readonly list: Effect.Effect<ReadonlyArray<Todo>>
}>()("app/TodoRepo") {
  static readonly layerTest = Layer.effect(
    TodoRepo,
    Effect.gen(function*() {
      const store = yield* TodoRepoTestRef

      const create = Effect.fn("TodoRepo.create")(function*(title: string) {
        const todos = yield* Ref.get(store)
        const todo = { id: todos.length + 1, title }
        yield* Ref.set(store, [...todos, todo])
        return todo
      })

      const list = Ref.get(store)

      return TodoRepo.of({
        create,
        list
      })
    })
  ).pipe(
    // Provide the test ref layer as a dependency for the test repo layer.
    // Use Layer.provideMerge so the tests can also access the test ref directly
    // if needed.
    Layer.provideMerge(TodoRepoTestRef.layer)
  )
}

class TodoService extends Context.Service<TodoService, {
  addAndCount(title: string): Effect.Effect<number>
  readonly titles: Effect.Effect<ReadonlyArray<string>>
}>()("app/TodoService") {
  static readonly layerNoDeps = Layer.effect(
    TodoService,
    Effect.gen(function*() {
      const repo = yield* TodoRepo

      const addAndCount = Effect.fn("TodoService.addAndCount")(function*(title: string) {
        yield* repo.create(title)
        const todos = yield* repo.list
        return todos.length
      })

      const titles = repo.list.pipe(
        Effect.map((todos) => todos.map((todo) => todo.title))
      )

      return TodoService.of({
        addAndCount,
        titles
      })
    })
  )

  // You would also add a live layer here that provides real dependencies for
  // production code.
  //
  // static readonly layer = Layer.effect(TodoService, ...).pipe(
  //   Layer.provide(TodoRepo.layer)
  // )

  static readonly layerTest = this.layerNoDeps.pipe(
    // Provide the test repo layer as a dependency for the test service layer.
    // Use `Layer.provideMerge` so the tests can also access the test repo
    // directly if needed, as well as the test ref through the repo layer.
    Layer.provideMerge(TodoRepo.layerTest)
  )
}

// `layer(...)` creates one shared layer for the block and tears it down in
// `afterAll`, so all tests inside can access the same service context.
layer(TodoRepo.layerTest)("TodoRepo", (it) => {
  it.effect("tests repository behavior", () =>
    Effect.gen(function*() {
      const repo = yield* TodoRepo
      const before = (yield* repo.list).length
      assert.strictEqual(before, 0)

      yield* repo.create("Write docs")

      const after = (yield* repo.list).length
      assert.strictEqual(after, 1)
    }))

  it.effect("layer is shared", () =>
    Effect.gen(function*() {
      const repo = yield* TodoRepo
      const before = (yield* repo.list).length
      assert.strictEqual(before, 1)

      yield* repo.create("Write docs again")

      // because the layer is shared between tests, the todo created in the
      // previous test is still present, so the count should be 2, not 1
      const after = (yield* repo.list).length
      assert.strictEqual(after, 2)
    }))
})

describe("TodoService", () => {
  it.effect("tests higher-level service logic", () =>
    Effect.gen(function*() {
      const ref = yield* TodoRepoTestRef
      const service = yield* TodoService
      const count = yield* service.addAndCount("Review docs")
      const titles = yield* service.titles

      assert.isTrue(count >= 1)
      assert.isTrue(titles.some((title) => title.includes("Review docs")))

      // You can also access the test ref directly to make assertions about the
      // underlying data.
      const todos = yield* Ref.get(ref)
      assert.isTrue(todos.length >= 1)
    }).pipe(Effect.provide(TodoService.layerTest)))
})
