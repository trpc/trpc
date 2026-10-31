import { Effect, hole, Layer, Schema, SubscriptionRef } from "effect"
import type { AsyncResult } from "effect/reactivity"
import { Atom } from "effect/reactivity"
import { describe, expect, it } from "tstyche"

describe("Atom", () => {
  describe("serializable", () => {
    it("rejects Date values as JSON-encoded input", () => {
      const atom = Atom.serializable(Atom.make(new Date()), { key: "date", schema: Schema.Date })

      expect(atom[Atom.SerializableTypeId].decode).type.not.toBeCallableWith(new Date())
    })
  })

  describe("context", () => {
    it("returns a registry runtime factory by default", () => {
      expect(Atom.context()).type.toBe<Atom.RegistryRuntimeFactory>()
    })

    it("returns a registry runtime factory for an atom-backed memo map", () => {
      const memoMap = Atom.make(() => Layer.makeMemoMapUnsafe())

      expect(Atom.context({ memoMap })).type.toBe<Atom.RegistryRuntimeFactory>()
    })

    it("returns a shared runtime factory for a concrete memo map", () => {
      const memoMap = Layer.makeMemoMapUnsafe()

      expect(Atom.context({ memoMap })).type.toBe<Atom.SharedRuntimeFactory>()
    })
  })

  describe("AtomRuntime.subscriptionRef", () => {
    it("includes the runtime error for an infallible ref", () => {
      const runtime = Atom.runtime(Layer.effectDiscard(Effect.fail("setup-failed" as const)))

      expect(runtime.subscriptionRef(SubscriptionRef.make(1)))
        .type.toBe<Atom.Writable<AsyncResult.AsyncResult<number, "setup-failed">, number>>()
    })

    it("preserves ref errors alongside runtime errors for both input forms", () => {
      const runtime = Atom.runtime(Layer.effectDiscard(Effect.fail("setup-failed" as const)))
      const ref: Effect.Effect<SubscriptionRef.SubscriptionRef<number>, "ref-failed"> = Effect.fail("ref-failed")

      expect(runtime.subscriptionRef(ref))
        .type.toBe<Atom.Writable<AsyncResult.AsyncResult<number, "ref-failed" | "setup-failed">, number>>()
      expect(runtime.subscriptionRef(() => ref))
        .type.toBe<Atom.Writable<AsyncResult.AsyncResult<number, "ref-failed" | "setup-failed">, number>>()
    })
  })

  describe("initialValue", () => {
    it("accepts options only in the data-first form", () => {
      const seed = Atom.make(1)

      expect(Atom.initialValue).type.not.toBeCallableWith(seed, { skipInitialRun: true })
    })
  })

  describe("reactivity keys", () => {
    it("accepts any keys when no keys are declared", () => {
      const keys = hole<ReadonlyArray<unknown>>()
      const runtime = Atom.runtime(Layer.empty)

      expect(Atom.withReactivity).type.toBeCallableWith(keys)
      expect(Atom.withReactivity).type.toBeCallableWith({ anything: [1, { id: 1 }] })
      expect(runtime.fn).type.toBeCallableWith(() => Effect.void, { reactivityKeys: keys })
    })
  })

  describe("serializable", () => {
    it("encodes to and decodes from the JSON representation", () => {
      const atom = Atom.serializable(Atom.make(1n), { key: "bigint", schema: Schema.BigInt })
      const serializable = atom[Atom.SerializableTypeId]

      expect(serializable.encode).type.toBe<(value: bigint) => Schema.Json>()
      expect(serializable.decode).type.toBe<(value: Schema.Json) => bigint>()
    })
  })
})
