/**
 * The `Brand` module adds compile-time names to ordinary TypeScript values so
 * structurally identical values cannot be mixed accidentally. A branded value
 * has the same runtime representation as its unbranded value; the extra
 * information lives in the type system unless you choose a validating
 * constructor.
 *
 * @since 2.0.0
 */
import * as Arr from "./Array.ts"
import * as Option from "./Option.ts"
import * as Result from "./Result.ts"
import type * as Schema from "./Schema.ts"
import * as SchemaAST from "./SchemaAST.ts"
import * as SchemaIssue from "./SchemaIssue.ts"
import type * as Types from "./Types.ts"

const TypeId = "~effect/Brand"

/**
 * A generic interface that defines a branded type.
 *
 * **When to use**
 *
 * Use to define a branded type such as `number & Brand<"Positive">` when
 * TypeScript should keep structurally identical values separate without
 * changing their runtime value.
 *
 * @see {@link Branded} for applying a brand key to a base type
 * @see {@link Constructor} for validating or constructing branded values
 *
 * @category models
 * @since 2.0.0
 */
export interface Brand<in out Keys extends string> {
  readonly [TypeId]: {
    readonly [K in Keys]: Keys
  }
}

/**
 * A constructor for a branded type that provides validation and safe
 * construction methods.
 *
 * **When to use**
 *
 * Use as the shared callable interface for branded values when an API accepts
 * or returns a brand constructor and callers need throwing, `Option`, `Result`,
 * or type-guard validation forms.
 *
 * @see {@link nominal} for a constructor without runtime validation
 * @see {@link make} for creating a constructor from a validation predicate
 * @see {@link check} for creating a constructor from schema checks
 * @see {@link all} for combining brand constructors
 *
 * @category models
 * @since 2.0.0
 */
export interface Constructor<in out B extends Brand<any>> {
  /**
   * Constructs a branded type from a value of type `Unbranded<B>`, throwing an
   * error if the provided value is not valid.
   */
  (unbranded: Brand.Unbranded<B>): B
  /**
   * Constructs a branded type from a value of type `Unbranded<B>`, returning
   * `Some<B>` if the provided value is valid, `None` otherwise.
   */
  option(unbranded: Brand.Unbranded<B>): Option.Option<B>
  /**
   * Constructs a branded type from a value of type `Unbranded<B>`, returning
   * `Success<B>` if the provided value is valid, `Failure<BrandError>`
   * otherwise.
   */
  result(unbranded: Brand.Unbranded<B>): Result.Result<B, BrandError>
  /**
   * Attempts to refine the provided value of type `Unbranded<B>`, returning
   * `true` if the provided value is a valid branded type, `false` otherwise.
   */
  is(unbranded: Brand.Unbranded<B>): unbranded is Brand.Unbranded<B> & B

  /**
   * The checks that are applied to the branded type.
   *
   * @internal
   */
  checks?: readonly [SchemaAST.Check<Brand.Unbranded<B>>, ...Array<SchemaAST.Check<Brand.Unbranded<B>>>] | undefined
}

/**
 * Error returned when a branded type is constructed from an invalid value.
 *
 * **Details**
 *
 * The error wraps a `SchemaIssue.Issue`, renders `message` with the default
 * schema issue formatter, and formats as `BrandError(<message>)`.
 *
 * **Gotchas**
 *
 * `BrandError` is an error-like model with `_tag`, `name`, `message`, and
 * `toString`; it does not extend JavaScript `Error`.
 *
 * @category errors
 * @since 4.0.0
 */
export class BrandError {
  constructor(issue: SchemaIssue.Issue) {
    this.issue = issue
  }
  /**
   * Discriminant used to identify brand construction failures.
   *
   * @since 4.0.0
   */
  readonly _tag = "BrandError"
  /**
   * Error name used by tools that inspect JavaScript error-like objects.
   *
   * @since 4.0.0
   */
  readonly name: string = "BrandError"
  /**
   * Schema issue describing why brand validation failed.
   *
   * @since 4.0.0
   */
  readonly issue: SchemaIssue.Issue
  /**
   * Human-readable rendering of the validation issue.
   *
   * @since 4.0.0
   */
  get message() {
    return SchemaIssue.defaultFormatter(this.issue)
  }
  /**
   * Formats the brand error together with its validation message.
   *
   * @since 4.0.0
   */
  toString() {
    return `BrandError(${this.message})`
  }
}

/**
 * Namespace containing type-level helpers for working with branded types and
 * brand constructors.
 *
 * @since 2.0.0
 */
export declare namespace Brand {
  /**
   * A utility type to extract a branded type from a `Constructor`.
   *
   * @category utility types
   * @since 2.0.0
   */
  export type FromConstructor<C> = C extends Constructor<infer B> ? B : never

  /**
   * A utility type to extract the unbranded value type from a brand.
   *
   * @category utility types
   * @since 2.0.0
   */
  export type Unbranded<B extends Brand<any>> = B extends infer U & Brands<B> ? U : B

  /**
   * A utility type to extract the keys of a branded type.
   *
   * @category utility types
   * @since 4.0.0
   */
  export type Keys<B extends Brand<any>> = keyof B[typeof TypeId]

  /**
   * A utility type to extract the brands from a branded type.
   *
   * @category utility types
   * @since 2.0.0
   */
  export type Brands<B extends Brand<any>> = Types.UnionToIntersection<
    { [K in Keys<B>]: K extends string ? Brand<K> : never }[Keys<B>]
  >

  /**
   * A utility type that checks that all brands have the same base type.
   *
   * @category utility types
   * @since 2.0.0
   */
  export type EnsureCommonBase<
    Brands extends readonly [Constructor<any>, ...Array<Constructor<any>>]
  > = {
    [B in keyof Brands]: Brand.Unbranded<Brand.FromConstructor<Brands[0]>> extends
      Brand.Unbranded<Brand.FromConstructor<Brands[B]>>
      ? Brand.Unbranded<Brand.FromConstructor<Brands[B]>> extends Brand.Unbranded<Brand.FromConstructor<Brands[0]>>
        ? Brands[B]
      : Brands[B]
      : "ERROR: All brands should have the same base type"
  }
}

/**
 * A type alias for creating branded types more concisely.
 *
 * @category utility types
 * @since 2.0.0
 */
export type Branded<A, Key extends string> = A & Brand<Key>

/**
 * Returns a `Constructor` that **does not apply any runtime checks** and just
 * returns the provided value.
 *
 * **When to use**
 *
 * Use to create nominal types that allow distinguishing between two values
 * of the same type but with different meanings.
 *
 * @see {@link make} for constructing branded values with validation.
 * @see {@link check} for constructing branded values from schema checks.
 *
 * @category constructors
 * @since 2.0.0
 */
export function nominal<A extends Brand<any>>(): Constructor<A> {
  return Object.assign((input: Brand.Unbranded<A>) => input as A, {
    option: (input: Brand.Unbranded<A>) => Option.some(input as A),
    result: (input: Brand.Unbranded<A>) => Result.succeed(input as A),
    is: (_: Brand.Unbranded<A>): _ is Brand.Unbranded<A> & A => true
  })
}

/**
 * Returns a `Constructor` that can construct a branded type from an unbranded
 * value using the provided `filter` predicate as validation of the input data.
 *
 * **When to use**
 *
 * Use when you want validation while constructing the branded type.
 *
 * @see {@link nominal} for a brand constructor that performs no validation.
 *
 * @category constructors
 * @since 4.0.0
 */
export function make<A extends Brand<any>>(
  filter: (unbranded: Brand.Unbranded<A>) => Schema.FilterOutput
): Constructor<A> {
  return check(SchemaAST.makeFilter(filter))
}

/**
 * Creates a branded type `Constructor` from one or more schema checks.
 *
 * **When to use**
 *
 * Use when you need a branded type constructor that performs runtime validation
 * via schema checks.
 *
 * **Details**
 *
 * Calling the returned constructor validates the unbranded value and throws on
 * failure. Use the returned `option`, `result`, or `is` methods for
 * non-throwing validation.
 *
 * @see {@link nominal} for a brand constructor without runtime validation
 * @see {@link all} for combining multiple brand constructors
 * @category constructors
 * @since 4.0.0
 */
export function check<A extends Brand<any>>(
  ...checks: readonly [
    SchemaAST.Check<Brand.Unbranded<A>>,
    ...Array<SchemaAST.Check<Brand.Unbranded<A>>>
  ]
): Constructor<A> {
  const result = (input: Brand.Unbranded<A>): Result.Result<A, BrandError> => {
    return Result.mapError(SchemaAST.runChecks(checks, input), (issue) => new BrandError(issue)) as any
  }
  return Object.assign((input: Brand.Unbranded<A>) => Result.getOrThrow(result(input)), {
    option: (input: Brand.Unbranded<A>) => Option.getSuccess(result(input)),
    result,
    is: (input: Brand.Unbranded<A>): input is Brand.Unbranded<A> & A => Result.isSuccess(result(input)),
    checks
  })
}

/**
 * Combines one or more brand constructors to form a single branded type.
 *
 * **When to use**
 *
 * Use to require an input to satisfy every runtime check collected by the
 * provided brand constructors.
 *
 * **Details**
 *
 * If the provided constructors contain runtime checks, the combined
 * constructor succeeds only when all checks pass. If no runtime checks are
 * present, it behaves as a nominal constructor.
 *
 * @category combining
 * @since 2.0.0
 */
export function all<Brands extends readonly [Constructor<any>, ...Array<Constructor<any>>]>(
  ...brands: Brand.EnsureCommonBase<Brands>
): Constructor<
  Types.UnionToIntersection<{ [B in keyof Brands]: Brand.FromConstructor<Brands[B]> }[number]> extends
    infer X extends Brand<any> ? X : Brand<any>
> {
  const checks = brands.flatMap((brand) => brand.checks ?? [])
  return Arr.isArrayNonEmpty(checks) ?
    check(...checks) :
    nominal()
}
