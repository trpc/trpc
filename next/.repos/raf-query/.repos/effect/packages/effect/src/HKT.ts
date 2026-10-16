/**
 * Provides type-level helpers for generic code over container-like types.
 *
 * TypeScript cannot directly abstract over shapes such as `Option<A>`,
 * `ReadonlyArray<A>`, or `Effect<A, E, R>`. This module represents those shapes
 * with `TypeLambda` and applies concrete type arguments with `Kind`. It is
 * mostly useful when defining generic helpers or type classes that should work
 * across several data types.
 *
 * @since 2.0.0
 */
import type * as Types from "./Types.ts"

/**
 * Defines the unique symbol used to associate `TypeClass` implementations with their `TypeLambda`.
 *
 * **When to use**
 *
 * Use when you need to define a custom type class that exposes the `TypeLambda`
 * it operates on.
 *
 * **Details**
 *
 * This symbol links a type class shape with its compile-time type lambda. It is
 * intended for type-class definitions and has no runtime behavior.
 *
 * **Example** (Linking a type class to a type lambda)
 *
 * ```ts import.meta.vitest
 * import type { HKT } from "effect"
 *
 * interface IdentityTypeLambda extends HKT.TypeLambda {
 *   readonly type: this["Target"]
 * }
 *
 * interface IdentityTypeClass extends HKT.TypeClass<IdentityTypeLambda> {
 *   readonly [HKT.URI]?: IdentityTypeLambda
 *   readonly of: <A>(value: A) => HKT.Kind<IdentityTypeLambda, never, never, never, A>
 * }
 *
 * const identity: IdentityTypeClass = {
 *   of: (value) => value
 * }
 *
 * type LinkedTypeLambda = typeof identity[typeof HKT.URI]
 *
 * const value: HKT.Kind<NonNullable<LinkedTypeLambda>, never, never, never, string> = identity.of("ok")
 * ```
 *
 * @category symbols
 * @since 2.0.0
 */
export declare const URI: unique symbol

/**
 * Base interface for type classes that work with Higher-Kinded Types.
 *
 * **When to use**
 *
 * Use to define type class interfaces parameterized by a `TypeLambda`.
 *
 * **Details**
 *
 * A `TypeClass` defines operations that can be performed on any type constructor
 * that matches the given `TypeLambda`. This enables writing generic code that
 * works across different container types like Array, Option, Effect, etc.
 *
 * **Example** (Defining higher-kinded type classes)
 *
 * ```ts import.meta.vitest
 * import type { HKT } from "effect"
 *
 * // Define a Functor type class
 * interface Functor<F extends HKT.TypeLambda> extends HKT.TypeClass<F> {
 *   map<A, B>(
 *     fa: HKT.Kind<F, never, never, never, A>,
 *     f: (a: A) => B
 *   ): HKT.Kind<F, never, never, never, B>
 * }
 *
 * // Define a Monad type class
 * interface Monad<F extends HKT.TypeLambda> extends Functor<F> {
 *   flatMap<A, B>(
 *     fa: HKT.Kind<F, never, never, never, A>,
 *     f: (a: A) => HKT.Kind<F, never, never, never, B>
 *   ): HKT.Kind<F, never, never, never, B>
 * }
 *
 * const witness: keyof Monad<HKT.TypeLambda> = "flatMap"
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface TypeClass<F extends TypeLambda> {
  readonly [URI]?: F
}

/**
 * Base interface for defining Higher-Kinded Type parameters.
 *
 * **When to use**
 *
 * Use to encode a type constructor for higher-kinded generic programming.
 *
 * **Details**
 *
 * A `TypeLambda` encodes the "shape" of a type constructor, specifying how many
 * type parameters it takes and their variance (contravariant, covariant, or
 * invariant). The four parameters are `In` for contravariant input, `Out2` for
 * covariant output often used for errors, `Out1` for covariant output often used
 * for context or environment, and `Target` for the invariant main type.
 *
 * **Example** (Defining type lambdas)
 *
 * ```ts import.meta.vitest
 * import type { Effect, HKT } from "effect"
 *
 * // TypeLambda for Array<A>
 * interface ArrayTypeLambda extends HKT.TypeLambda {
 *   readonly type: Array<this["Target"]>
 * }
 *
 * // TypeLambda for Effect<A, E, R>
 * interface EffectTypeLambda extends HKT.TypeLambda {
 *   readonly type: Effect.Effect<this["Target"], this["Out2"], this["Out1"]>
 * }
 *
 * // TypeLambda for function (A) => B
 * interface FunctionTypeLambda extends HKT.TypeLambda {
 *   readonly type: (a: this["In"]) => this["Target"]
 * }
 *
 * const witness: HKT.Kind<ArrayTypeLambda, never, never, never, string> = ["ok"]
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface TypeLambda {
  readonly In: unknown
  readonly Out2: unknown
  readonly Out1: unknown
  readonly Target: unknown
}

/**
 * Applies type parameters to a `TypeLambda` to get the concrete type.
 *
 * **When to use**
 *
 * Use to apply a `TypeLambda` to type parameters and obtain its concrete type.
 *
 * **Details**
 *
 * This type-level function takes a `TypeLambda` and four type parameters, then
 * "applies" them to get the actual type. It handles variance correctly, ensuring
 * contravariant parameters are used as inputs and covariant parameters as
 * outputs. This is the core mechanism that allows HKT to transform abstract type
 * constructors into concrete types by applying arguments.
 *
 * **Example** (Applying type lambdas)
 *
 * ```ts import.meta.vitest
 * import { Option } from "effect"
 * import type { Effect, HKT } from "effect"
 *
 * // Define TypeLambdas
 * interface OptionTypeLambda extends HKT.TypeLambda {
 *   readonly type: Option.Option<this["Target"]>
 * }
 *
 * interface EffectTypeLambda extends HKT.TypeLambda {
 *   readonly type: Effect.Effect<this["Target"], this["Out2"], this["Out1"]>
 * }
 *
 * // Apply type parameters to get concrete types
 * type OptionString = HKT.Kind<OptionTypeLambda, never, never, never, string>
 * // Result: Option.Option<string>
 *
 * type EffectStringNumberBoolean = HKT.Kind<
 *   EffectTypeLambda,
 *   never,
 *   number,
 *   boolean,
 *   string
 * >
 * // Result: Effect.Effect<string, number, boolean>
 *
 * // TypeLambdas enable generic programming over type constructors
 * type StringType<F extends HKT.TypeLambda> = HKT.Kind<
 *   F,
 *   never,
 *   never,
 *   never,
 *   string
 * >
 *
 * const witness: OptionString = Option.some("ok")
 * ```
 *
 * @category utility types
 * @since 2.0.0
 */
export type Kind<F extends TypeLambda, In, Out2, Out1, Target> = F extends {
  readonly type: unknown
} ? (F & {
    readonly In: In
    readonly Out2: Out2
    readonly Out1: Out1
    readonly Target: Target
  })["type"]
  : {
    readonly F: F
    readonly In: Types.Contravariant<In>
    readonly Out2: Types.Covariant<Out2>
    readonly Out1: Types.Covariant<Out1>
    readonly Target: Types.Invariant<Target>
  }
