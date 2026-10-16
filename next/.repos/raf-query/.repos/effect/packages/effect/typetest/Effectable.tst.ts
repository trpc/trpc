import { Effect, Effectable } from "effect"
import { describe, expect, it } from "tstyche"

describe("Effectable.Mixin", () => {
  class Box {
    constructor(readonly value: number) {}
  }

  class EffectBox extends Effectable.Mixin(Box) {
    override asEffect() {
      return Effect.succeed(this.value.toString())
    }
  }

  class FullEffectBox extends Effectable.Mixin(Box) {
    override asEffect() {
      return undefined as unknown as Effect.Effect<"success", "error", "service">
    }
  }

  it("preserves constructor parameters", () => {
    expect<ConstructorParameters<typeof EffectBox>>().type.toBe<[value: number]>()
  })

  it("rejects unknown properties", () => {
    expect(new EffectBox(1)).type.not.toHaveProperty("typo")
  })

  it("supports abstract base classes", () => {
    abstract class AbstractBox {
      constructor(readonly value: number) {}
      abstract double(): number
    }

    class ConcreteBox extends Effectable.Mixin(AbstractBox) {
      double() {
        return this.value * 2
      }
      override asEffect() {
        return Effect.succeed(this.double())
      }
    }

    expect<ConstructorParameters<typeof ConcreteBox>>().type.toBe<[value: number]>()
    expect(new ConcreteBox(1)).type.toBeAssignableTo<AbstractBox>()
    expect(new ConcreteBox(1)).type.toBeAssignableTo<Effect.Effect<number>>()
    // @ts-expect-error does not implement inherited abstract member double
    class MissingDouble extends Effectable.Mixin(AbstractBox) {
      override asEffect() {
        return Effect.succeed(this.value)
      }
    }
  })

  it("instances are Effects of the asEffect success type and original class instances", () => {
    expect<Effect.Success<EffectBox>>().type.toBe<string>()
    expect(new EffectBox(1)).type.toBeAssignableTo<Effect.Effect<string>>()
    expect(new EffectBox(1)).type.toBeAssignableTo<Box>()
  })

  it("propagates success, error, and services through yield*", () => {
    const effect = Effect.gen(function*() {
      return yield* new FullEffectBox(1)
    })
    expect(effect).type.toBe<Effect.Effect<"success", "error", "service">>()
  })

  it("requires asEffect", () => {
    // @ts-expect-error does not implement inherited abstract member asEffect
    class MissingAsEffect extends Effectable.Mixin(Box) {}
  })
})
