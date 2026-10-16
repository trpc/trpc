import { afterAll, assert, describe, it } from "@effect/vitest"
import { Context, Effect, Layer, Ref } from "effect"

interface StateShape {
  readonly id: number
  readonly todos: Ref.Ref<Array<string>>
  readonly migrated: Ref.Ref<boolean>
}

class State extends Context.Service<State, StateShape>()("State") {}

class TodoService extends Context.Service<TodoService, {
  readonly stateId: Effect.Effect<number>
  readonly migrated: Effect.Effect<boolean>
  readonly add: (title: string) => Effect.Effect<void>
  readonly list: Effect.Effect<Array<string>>
}>()("TodoService") {}

describe("top-level it.layer isolation", () => {
  let nextId = 0
  const observedStateIds: Array<number> = []

  const baseLayer = Layer.effect(State)(
    Effect.gen(function*() {
      const id = ++nextId
      const todos = yield* Ref.make<Array<string>>([])
      const migrated = yield* Ref.make(false)
      return { id, todos, migrated }
    })
  )

  const migrationLayer = Layer.effectDiscard(
    Effect.gen(function*() {
      const state = yield* State
      yield* Ref.set(state.migrated, true)
    })
  )

  const migratedLayer = Layer.merge(
    baseLayer,
    migrationLayer.pipe(Layer.provide(baseLayer))
  )

  const inMemoryLayer = Layer.effect(TodoService)(
    Effect.gen(function*() {
      const state = yield* State
      return {
        stateId: Effect.succeed(state.id),
        migrated: Ref.get(state.migrated),
        add: (title: string) => Ref.update(state.todos, (todos) => [...todos, title]),
        list: Ref.get(state.todos)
      } as const
    })
  ).pipe(Layer.provide(migratedLayer))

  it.layer(inMemoryLayer)((it) => {
    it.effect("first block mutates isolated state", () =>
      Effect.gen(function*() {
        const service = yield* TodoService
        const stateId = yield* service.stateId
        const migrated = yield* service.migrated

        observedStateIds.push(stateId)
        yield* service.add("write tests")

        assert.isTrue(migrated)
        assert.deepStrictEqual(yield* service.list, ["write tests"])
      }))
  })

  it.layer(inMemoryLayer)((it) => {
    it.effect("second block starts fresh", () =>
      Effect.gen(function*() {
        const service = yield* TodoService
        const stateId = yield* service.stateId
        const migrated = yield* service.migrated

        observedStateIds.push(stateId)

        assert.isTrue(migrated)
        assert.deepStrictEqual(yield* service.list, [])

        yield* service.add("ship feature")
        assert.deepStrictEqual(yield* service.list, ["ship feature"])
      }))
  })

  it.layer(inMemoryLayer)((it) => {
    it.effect("third block also starts fresh", () =>
      Effect.gen(function*() {
        const service = yield* TodoService
        const stateId = yield* service.stateId
        const migrated = yield* service.migrated

        observedStateIds.push(stateId)

        assert.isTrue(migrated)
        assert.deepStrictEqual(yield* service.list, [])
      }))
  })

  afterAll(() => {
    assert.deepStrictEqual(observedStateIds, [1, 2, 3])
  })
})
