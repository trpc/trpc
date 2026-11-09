import { assert, describe, it } from "@effect/vitest"
import { Context, Effect, Effectable, Exit } from "effect"

describe("Effectable", () => {
  describe("Mixin", () => {
    class Box {
      constructor(readonly value: number) {}
      double() {
        return this.value * 2
      }
    }

    class EffectBox extends Effectable.Mixin(Box) {
      override asEffect() {
        return Effect.succeed(this.value)
      }
    }

    it.effect("evaluates asEffect", () =>
      Effect.gen(function*() {
        const effectValue = yield* new EffectBox(1)
        assert.strictEqual(effectValue, 1)
      }))

    it.effect("propagates failures", () =>
      Effect.gen(function*() {
        class FailingBox extends Effectable.Mixin(Box) {
          override asEffect() {
            return Effect.fail(this.value)
          }
        }

        assert.deepStrictEqual(yield* Effect.exit(new FailingBox(1)), Exit.fail(1))
      }))

    it.effect("uses provided services", () =>
      Effect.gen(function*() {
        class Multiplier extends Context.Service<Multiplier, number>()("Multiplier") {}
        class ServiceBox extends Effectable.Mixin(Box) {
          override asEffect() {
            return Effect.map(Multiplier, (multiplier) => this.value * multiplier)
          }
        }

        const value = yield* new ServiceBox(2).pipe(Effect.provideService(Multiplier, 3))
        assert.strictEqual(value, 6)
      }))

    it("shadows base prototype methods without modifying them", () => {
      class PrintableBox extends Box {
        override toString() {
          return "Box"
        }
        toJSON(): unknown {
          return { _id: "Box" }
        }
      }
      class PrintableEffectBox extends Effectable.Mixin(PrintableBox) {
        override asEffect() {
          return Effect.succeed(this.value)
        }
      }

      const box = new PrintableEffectBox(1)
      assert.deepStrictEqual(box.toJSON(), { _id: "Effect", op: "Effectable" })
      assert.deepStrictEqual(JSON.parse(box.toString()), box.toJSON())
      assert.strictEqual(new PrintableBox(1).toString(), "Box")
      assert.deepStrictEqual(new PrintableBox(1).toJSON(), { _id: "Box" })
    })

    it("inserts the Effect prototype between the subclass and original class", () => {
      const box = new EffectBox(1)
      const protos: Array<object> = []
      let current: object | null = Object.getPrototypeOf(box)
      while (current !== null && current !== Box.prototype) {
        protos.push(current)
        current = Object.getPrototypeOf(current)
      }
      assert.strictEqual(current, Box.prototype)
      assert.isTrue(protos.some((proto) => Effect.TypeId in proto))
    })

    it("preserves the original constructor and instance members", () => {
      const box = new EffectBox(2)
      assert.isTrue(box instanceof EffectBox)
      assert.isTrue(box instanceof Box)
      assert.strictEqual(box.constructor, EffectBox)
      assert.strictEqual(box.value, 2)
      assert.strictEqual(box.double(), 4)
    })

    it("makes instances behave as Effects", () => {
      const box = new EffectBox(3)
      assert.isTrue(Effect.isEffect(box))
      assert.strictEqual(box.pipe((b) => b.value), 3)
    })

    it("does not modify the original class prototype", () => {
      assert.isFalse(Effect.TypeId in Box.prototype)
      assert.isFalse(Effect.isEffect(new Box(1)))
    })
  })
})
