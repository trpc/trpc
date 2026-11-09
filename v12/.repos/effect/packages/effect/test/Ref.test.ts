import { assert, describe, it } from "@effect/vitest"
import { Effect, Option, Ref } from "effect"

const current = "value"
const update = "new value"

type State = Active | Changed | Closed

interface Active {
  readonly _tag: "Active"
}

interface Changed {
  readonly _tag: "Changed"
}

interface Closed {
  readonly _tag: "Closed"
}

export const Active: State = { _tag: "Active" }
export const Changed: State = { _tag: "Changed" }
export const Closed: State = { _tag: "Closed" }

const isActive = (self: State): boolean => self._tag === "Active"
const isChanged = (self: State): boolean => self._tag === "Changed"
const isClosed = (self: State): boolean => self._tag === "Closed"

describe("Ref", () => {
  it.effect("get returns the current value", () =>
    Effect.gen(function*() {
      const result = yield* Ref.get(Ref.makeUnsafe(current))
      assert.strictEqual(result, current)
    }))

  it.effect("getAndSet returns the previous value and stores the replacement", () =>
    Effect.gen(function*() {
      const ref = yield* Ref.make(current)
      const result1 = yield* Ref.getAndSet(ref, update)
      assert.strictEqual(result1, current)
    }))

  it.effect("getAndUpdate returns the previous value and stores the computed value", () =>
    Effect.gen(function*() {
      const ref = yield* Ref.make(current)
      const result1 = yield* Ref.getAndUpdate(ref, () => update)
      assert.strictEqual(result1, current)
    }))

  it.effect("getAndUpdateSome leaves state unchanged when no transition matches", () =>
    Effect.gen(function*() {
      const ref = yield* Ref.make<State>(Active)
      const result1 = yield* Ref.getAndUpdateSome(
        ref,
        (state) => isClosed(state) ? Option.some(Changed) : Option.none()
      )
      const result2 = yield* Ref.get(ref)
      assert.strictEqual(result1, Active)
      assert.strictEqual(result2, Active)
    }))

  it.effect("getAndUpdateSome returns each previous state while applying matching transitions", () =>
    Effect.gen(function*() {
      const ref = yield* Ref.make<State>(Active)
      const result1 = yield* Ref.getAndUpdateSome(
        ref,
        (state) => isActive(state) ? Option.some(Changed) : Option.none()
      )
      const result2 = yield* Ref.getAndUpdateSome(ref, (state) =>
        isActive(state) ?
          Option.some(Changed) :
          isChanged(state) ?
          Option.some(Closed) :
          Option.none())
      const result3 = yield* Ref.get(ref)
      assert.strictEqual(result1, Active)
      assert.strictEqual(result2, Changed)
      assert.strictEqual(result3, Closed)
    }))

  it.effect("set stores the provided value", () =>
    Effect.gen(function*() {
      const ref = yield* Ref.make(current)
      yield* Ref.set(ref, update)
      const result = yield* Ref.get(ref)
      assert.strictEqual(result, update)
    }))

  it.effect("update stores the computed value", () =>
    Effect.gen(function*() {
      const ref = yield* Ref.make(current)
      yield* Ref.update(ref, () => update)
      const result = yield* Ref.get(ref)
      assert.strictEqual(result, update)
    }))

  it.effect("updateAndGet stores and returns the computed value", () =>
    Effect.gen(function*() {
      const ref = yield* Ref.make(current)
      const result = yield* Ref.updateAndGet(ref, () => update)
      assert.strictEqual(result, update)
    }))

  it.effect("updateSome leaves state unchanged when no transition matches", () =>
    Effect.gen(function*() {
      const ref = yield* Ref.make<State>(Active)
      yield* Ref.updateSome(ref, (state) => isClosed(state) ? Option.some(Changed) : Option.none())
      const result = yield* Ref.get(ref)
      assert.deepEqual(result, Active)
    }))

  it.effect("updateSome applies matching transitions to the stored state", () =>
    Effect.gen(function*() {
      const ref = yield* Ref.make<State>(Active)
      yield* Ref.updateSome(ref, (state) => isActive(state) ? Option.some(Changed) : Option.none())
      const result1 = yield* Ref.get(ref)
      yield* Ref.updateSome(ref, (state) =>
        isActive(state) ?
          Option.some(Changed) :
          isChanged(state) ?
          Option.some(Closed) :
          Option.none())
      const result2 = yield* Ref.get(ref)
      assert.deepEqual(result1, Changed)
      assert.deepEqual(result2, Closed)
    }))

  it.effect("updateSomeAndGet returns the current state when no transition matches", () =>
    Effect.gen(function*() {
      const ref = yield* Ref.make<State>(Active)
      const result = yield* Ref.updateSomeAndGet(ref, (state) => isClosed(state) ? Option.some(Changed) : Option.none())
      assert.strictEqual(result, Active)
    }))
  it.effect("updateSomeAndGet - twice", () =>
    Effect.gen(function*() {
      const ref = yield* Ref.make<State>(Active)
      const result1 = yield* Ref.updateSomeAndGet(
        ref,
        (state) => isActive(state) ? Option.some(Changed) : Option.none()
      )
      const result2 = yield* Ref.updateSomeAndGet(ref, (state): Option.Option<State> => {
        return isActive(state) ?
          Option.some(Changed) :
          isChanged(state) ?
          Option.some(Closed) :
          Option.none()
      })
      assert.deepEqual(result1, Changed)
      assert.deepEqual(result2, Closed)
    }))

  it.effect("modify returns a result while storing the new value", () =>
    Effect.gen(function*() {
      const ref = yield* Ref.make(current)
      const result1 = yield* Ref.modify(ref, () => ["hello", update])
      const result2 = yield* Ref.get(ref)
      assert.strictEqual(result1, "hello")
      assert.strictEqual(result2, update)
    }))
  it.effect("modifySome - once", () =>
    Effect.gen(function*() {
      const ref = yield* Ref.make<State>(Active)
      const result = yield* Ref.modifySome(ref, (state) =>
        isClosed(state) ?
          ["active", Option.some(Active)] :
          ["state does not change", Option.none()])
      assert.strictEqual(result, "state does not change")
    }))

  it.effect("modifySome returns a result while applying matching transitions", () =>
    Effect.gen(function*() {
      const ref = yield* Ref.make<State>(Active)
      const result1 = yield* Ref.modifySome(ref, (state) =>
        isActive(state) ?
          ["changed", Option.some(Changed)] :
          ["state does not change", Option.none()])

      const result2 = yield* Ref.modifySome(ref, (state) =>
        isActive(state) ?
          ["changed", Option.some(Changed)] :
          isChanged(state) ?
          ["closed", Option.some(Closed)] :
          ["state does not change", Option.none()])
      assert.strictEqual(result1, "changed")
      assert.strictEqual(result2, "closed")
    }))
})
