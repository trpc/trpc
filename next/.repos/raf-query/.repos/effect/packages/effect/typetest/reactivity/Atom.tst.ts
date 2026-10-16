import { Layer } from "effect"
import { Atom } from "effect/reactivity"
import { describe, expect, it } from "tstyche"

describe("Atom", () => {
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
})
