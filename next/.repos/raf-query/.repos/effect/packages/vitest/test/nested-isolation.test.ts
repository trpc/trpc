import { afterAll, assert, beforeAll, describe, expect, layer } from "@effect/vitest"
import { Context, Effect, Layer, Ref } from "effect"

describe("nested sibling layers", { concurrent: false }, () => {
  let nextChildId = 0
  let firstChildId = -1
  let secondChildId = -1
  const releasedChildIds: Array<number> = []

  class Parent extends Context.Service<Parent, "parent">()("Parent") {
    static readonly layer = Layer.succeed(Parent)("parent")
  }

  class Child extends Context.Service<Child, { readonly id: number }>()("Child") {
    static readonly layer = Layer.effect(Child)(
      Effect.flatMap(Parent, () => {
        const id = ++nextChildId
        return Effect.acquireRelease(
          Effect.succeed({ id }),
          () =>
            Effect.sync(() => {
              releasedChildIds.push(id)
            })
        )
      })
    )
  }

  layer(Parent.layer)("parent", (it) => {
    it.layer(Child.layer)("first sibling", (it) => {
      it.effect("allocates child", () =>
        Effect.gen(function*() {
          const child = yield* Child
          firstChildId = child.id

          assert.strictEqual(child.id, 1)
          assert.deepStrictEqual(releasedChildIds, [])
        }))
    })

    it.layer(Child.layer)("second sibling", (it) => {
      beforeAll(() => {
        expect(releasedChildIds).toEqual([firstChildId])
      })

      it.effect("allocates a fresh child", () =>
        Effect.gen(function*() {
          const child = yield* Child
          secondChildId = child.id

          assert.strictEqual(child.id, 2)
          assert.isTrue(child.id !== firstChildId)
          assert.deepStrictEqual(releasedChildIds, [firstChildId])
        }))
    })

    afterAll(() => {
      expect(firstChildId).toEqual(1)
      expect(secondChildId).toEqual(2)
      expect(releasedChildIds).toEqual([1, 2])
    })
  })
})

describe.concurrent("nested sibling layers in concurrent suites", () => {
  let nextSharedId = 0
  let firstSharedId: number | undefined
  let secondSharedId: number | undefined
  const releasedSharedIds: Array<number> = []

  class Parent extends Context.Service<Parent, "parent">()("ConcurrentParent") {
    static readonly layer = Layer.succeed(Parent)("parent")
  }

  class SharedChild extends Context.Service<SharedChild, { readonly id: number }>()("SharedChild") {
    static readonly layer = Layer.effect(SharedChild)(
      Effect.flatMap(Parent, () =>
        Effect.gen(function*() {
          yield* Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 50)))

          const id = ++nextSharedId
          return yield* Effect.acquireRelease(
            Effect.succeed({ id }),
            () =>
              Effect.sync(() => {
                releasedSharedIds.push(id)
              })
          )
        }))
    )
  }

  layer(Parent.layer)("parent", (it) => {
    describe.concurrent("concurrent siblings", () => {
      it.layer(SharedChild.layer)("first sibling", (it) => {
        it.effect("captures shared child", () =>
          Effect.gen(function*() {
            const child = yield* SharedChild
            firstSharedId = child.id
            assert.isTrue(child.id === 1 || child.id === 2)
          }))
      })

      it.layer(SharedChild.layer)("second sibling", (it) => {
        it.effect("allocates an isolated child", () =>
          Effect.gen(function*() {
            const child = yield* SharedChild
            secondSharedId = child.id
            assert.isTrue(child.id === 1 || child.id === 2)
          }))
      })
    })

    afterAll(() => {
      expect(firstSharedId).not.toEqual(secondSharedId)
      expect(nextSharedId).toEqual(2)
      expect([...releasedSharedIds].sort((a, b) => a - b)).toEqual([1, 2])
    })
  })
})

describe("nested sibling isolation with provided state graph", { concurrent: false }, () => {
  interface StateShape {
    readonly id: number
    readonly todos: Ref.Ref<Array<string>>
    readonly migrated: Ref.Ref<boolean>
  }

  class Parent extends Context.Service<Parent, "parent">()("ProvidedParent") {
    static readonly layer = Layer.succeed(Parent)("parent")
  }

  class State extends Context.Service<State, StateShape>()("ProvidedState") {}

  class TodoService extends Context.Service<TodoService, {
    readonly stateId: Effect.Effect<number>
    readonly migrated: Effect.Effect<boolean>
    readonly add: (title: string) => Effect.Effect<void>
    readonly list: Effect.Effect<Array<string>>
  }>()("ProvidedTodoService") {}

  let nextId = 0
  let firstStateId = -1
  let secondStateId = -1

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

  layer(Parent.layer)("parent", (it) => {
    it.layer(inMemoryLayer)("first sibling", (it) => {
      it.effect("mutates isolated provided state", () =>
        Effect.gen(function*() {
          const service = yield* TodoService
          firstStateId = yield* service.stateId

          assert.isTrue(yield* service.migrated)
          yield* service.add("write tests")
          assert.deepStrictEqual(yield* service.list, ["write tests"])
        }))
    })

    it.layer(inMemoryLayer)("second sibling", (it) => {
      it.effect("starts fresh with a new provided state", () =>
        Effect.gen(function*() {
          const service = yield* TodoService
          secondStateId = yield* service.stateId

          assert.isTrue(yield* service.migrated)
          assert.deepStrictEqual(yield* service.list, [])

          yield* service.add("ship feature")
          assert.deepStrictEqual(yield* service.list, ["ship feature"])
        }))
    })

    afterAll(() => {
      expect(firstStateId).toEqual(1)
      expect(secondStateId).toEqual(2)
      expect(nextId).toEqual(2)
    })
  })
})
