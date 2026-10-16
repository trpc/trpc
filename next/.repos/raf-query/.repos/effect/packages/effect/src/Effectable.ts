/**
 * Low-level helpers for making custom values behave like Effects. The module
 * exposes a prototype builder, an abstract base class, and a mixin that let
 * domain-specific values, such as service keys or configuration descriptions,
 * be evaluated by Effect and yielded inside `Effect.gen`.
 *
 * @since 4.0.0
 */
import type * as Effect from "./Effect.ts"
import type * as Fiber from "./Fiber.ts"
import { evaluate, makePrimitiveProto } from "./internal/core.ts"

/**
 * Create a low-level `Effect` prototype.
 *
 * **When to use**
 *
 * Use when you need to create a custom Effect-like value without extending a
 * class, by providing a label and an evaluate function that receives the
 * current fiber.
 *
 * **Details**
 *
 * When the effect is evaluated, it calls `evaluate` with the current fiber.
 *
 * @see {@link Class} for a class-based approach to defining custom Effect values
 * @see {@link Mixin} for wrapping an existing class constructor
 *
 * @category prototypes
 * @since 4.0.0
 */
export const Prototype = <A extends Effect.Effect<any, any, any>>(options: {
  readonly label: string
  readonly evaluate: (
    this: A,
    fiber: Fiber.Fiber<any, any>
  ) => Effect.Effect<Effect.Success<A>, Effect.Error<A>, Effect.Services<A>>
}): Effect.Effect<Effect.Success<A>, Effect.Error<A>, Effect.Services<A>> =>
  makePrimitiveProto({
    op: options.label,
    [evaluate]: options.evaluate
  }) as any

const proto = Prototype<Class<any, any, any>>({
  label: "Effectable",
  evaluate(_) {
    return this.asEffect()
  }
})

const Base: new<A, E, R>() => Effect.Effect<A, E, R> = (() => {
  const Base = function() {}
  Base.prototype = proto
  return Base as any
})()

/**
 * Provides an abstract class that can be extended to create an `Effect`.
 *
 * **When to use**
 *
 * Use as an abstract base class to define custom classes whose instances behave
 * as `Effect` values.
 *
 * @see {@link Prototype} for a lower-level primitive approach to creating custom Effect-like values without a class
 * @see {@link Mixin} for wrapping an existing class constructor
 * @category constructors
 * @since 2.0.0
 */
export abstract class Class<A, E = never, R = never> extends Base<A, E, R> {
  abstract asEffect(): Effect.Effect<A, E, R>
}

type AsEffectReturn<Self> = Self extends {
  asEffect(): infer A extends Effect.Effect<any, any, any>
} ? A
  : never

declare abstract class MixinBase extends Class<any, any, any> {
  constructor(...args: ReadonlyArray<any>)
  override readonly [Effect.TypeId]: AsEffectReturn<this>[Effect.TypeId]
  override [Symbol.iterator](): Effect.EffectIterator<AsEffectReturn<this>>
}

/**
 * Returns a subclass of the provided class that inserts the Effect prototype
 * into the inheritance chain.
 *
 * **When to use**
 *
 * Use to make instances of an existing class behave as `Effect` values without
 * extending {@link Class} or modifying the original prototype.
 *
 * **Details**
 *
 * Pass the class to wrap, then implement `asEffect` on the final class. The
 * returned class is abstract, and the success, error, and service types are
 * inferred from the concrete `asEffect` return type. Concrete and abstract base
 * classes are supported. Constructor parameters and instance members are
 * preserved, except that Effect's prototype members shadow base prototype
 * members with the same name: `pipe`, `toString`, `toJSON`, `[Symbol.iterator]`,
 * and `[Symbol.for("nodejs.util.inspect.custom")]`.
 *
 * **Example** (Evaluating a mixed-in class)
 *
 * ```ts import.meta.vitest
 * import { Effect, Effectable } from "effect"
 *
 * class Box {
 *   constructor(readonly value: number) {}
 * }
 *
 * class EffectBox extends Effectable.Mixin(Box) {
 *   asEffect() {
 *     return Effect.succeed(this.value)
 *   }
 * }
 *
 * const box = new EffectBox(2)
 * Effect.isEffect(box) // => true
 * await Effect.runPromise(box) // => 2
 * ```
 *
 * @see {@link Prototype} for a lower-level primitive approach to creating custom Effect-like values without a class
 * @see {@link Class} for a base constructor to extend
 * @category constructors
 * @since 4.0.0
 */
export const Mixin = <TBase extends abstract new(...args: ReadonlyArray<any>) => object>(
  klass: TBase
): TBase & typeof MixinBase => {
  abstract class Mixed extends klass {
    abstract asEffect(): Effect.Effect<any, any, any>
  }
  Object.defineProperties(Mixed.prototype, Object.getOwnPropertyDescriptors(proto))
  return Mixed as TBase & typeof MixinBase
}
