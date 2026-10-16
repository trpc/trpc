/**
 * Reads and updates focused parts of values without mutating the original
 * value.
 *
 * An optic describes where to look inside a value, such as a record field, a
 * union variant, an optional value, or several values in a collection. Different
 * optic types describe different kinds of focus: some always find a value,
 * some may not, and some can find many. This module includes the optic types,
 * constructors, focusing helpers, and operations for replacing, modifying, or
 * collecting focused values.
 *
 * @since 4.0.0
 */

import * as Arr from "./Array.ts"
import { dual, identity } from "./Function.ts"
import * as InternalRecord from "./internal/record.ts"
import * as Option from "./Option.ts"
import * as Predicate from "./Predicate.ts"
import * as Result from "./Result.ts"
import type * as Schema from "./Schema.ts"
import * as SchemaAST from "./SchemaAST.ts"
import * as SchemaIssue from "./SchemaIssue.ts"
import * as Struct from "./Struct.ts"
import type { IsUnion, NoInfer } from "./Types.ts"

/**
 * A lossless, reversible conversion between types `S` and `A`.
 *
 * **When to use**
 *
 * Use when you have a pair of functions that convert back and forth without losing
 *   information (e.g. `Record ↔ entries`, `Celsius ↔ Fahrenheit`).
 * - You want the strongest optic that can be composed with any other.
 *
 * **Details**
 *
 * - `get(s)` always succeeds and returns an `A`.
 * - `set(a)` always succeeds and returns an `S`.
 * - `get(set(a)) === a` and `set(get(s))` equals `s` (round-trip laws).
 * - Extends both {@link Lens} and {@link Prism}.
 *
 * **Example** (Converting between Celsius and Fahrenheit)
 *
 * ```ts import.meta.vitest
 * import { Optic } from "effect"
 *
 * const fahrenheit = Optic.makeIso<number, number>(
 *   (c) => c * 9 / 5 + 32,
 *   (f) => (f - 32) * 5 / 9
 * )
 *
 * fahrenheit.get(100) // => 212
 *
 * fahrenheit.set(32) // => 0
 * ```
 *
 * @see {@link makeIso} — constructor
 * @see {@link Lens} — when you only need a one-directional focus into a whole
 * @see {@link Prism} — when the focus may not be present
 *
 * @category models
 * @since 4.0.0
 */
export interface Iso<in out S, in out A> extends Lens<S, A>, Prism<S, A> {}

/**
 * Creates an {@link Iso} from a pair of conversion functions.
 *
 * **When to use**
 *
 * Use when you have two pure conversion functions that preserve all information
 * between `S` and `A`.
 *
 * **Details**
 *
 * The returned optic can be composed with any other optic.
 *
 * **Example** (Wrapping and unwrapping a branded type)
 *
 * ```ts import.meta.vitest
 * import { Optic } from "effect"
 *
 * type Meters = { readonly value: number }
 * const meters = Optic.makeIso<Meters, number>(
 *   (m) => m.value,
 *   (n) => ({ value: n })
 * )
 *
 * meters.get({ value: 100 }) // => 100
 *
 * meters.set(42) // => { value: 42 }
 * ```
 *
 * @see {@link Iso} — the type this function returns
 * @see {@link id} — identity iso (no conversion)
 *
 * @category constructors
 * @since 4.0.0
 */
export function makeIso<S, A>(get: (s: S) => A, set: (a: A) => S): Iso<S, A> {
  return make(primitiveNode("Iso", get, set))
}

/**
 * Focuses on exactly one part `A` inside a whole `S`.
 *
 * **When to use**
 *
 * Use when you always have a value to read and need the original `S` to produce
 * the updated whole, unlike `Iso`.
 *
 * **Details**
 *
 * - `get(s)` always succeeds and returns `A`.
 * - `replace(a, s)` returns a new `S` with the focused part replaced.
 * - Extends {@link Optional}.
 * - Composing a Lens with a {@link Prism} or {@link Optional} produces an
 *   {@link Optional}.
 *
 * **Example** (Focusing on a struct field)
 *
 * ```ts import.meta.vitest
 * import { Optic } from "effect"
 *
 * type Person = { readonly name: string; readonly age: number }
 *
 * const _name = Optic.id<Person>().key("name")
 *
 * _name.get({ name: "Alice", age: 30 }) // => "Alice"
 * ```
 *
 * @see {@link makeLens} — constructor
 * @see {@link Iso} — when conversion is lossless in both directions
 * @see {@link Optional} — when reading can also fail
 *
 * @category models
 * @since 4.0.0
 */
export interface Lens<in out S, in out A> extends Optional<S, A> {
  readonly get: (s: S) => A
}

/**
 * Creates a {@link Lens} from a getter and a replacer.
 *
 * **When to use**
 *
 * Use when you can always extract `A` from `S` and produce a new `S` by
 *   substituting a new `A`.
 *
 * **Details**
 *
 * - `replace(a, s)` should return a structurally new `S` with `a` in place
 *   of the old focus.
 *
 * **Example** (Focusing on the first element of a pair)
 *
 * ```ts import.meta.vitest
 * import { Optic } from "effect"
 *
 * const _first = Optic.makeLens<readonly [string, number], string>(
 *   (pair) => pair[0],
 *   (s, pair) => [s, pair[1]]
 * )
 *
 * _first.get(["hello", 42]) // => "hello"
 *
 * _first.replace("world", ["hello", 42]) // => ["world", 42]
 * ```
 *
 * @see {@link Lens} — the type this function returns
 * @see {@link makeIso} — when no original `S` is needed for `set`
 *
 * @category constructors
 * @since 4.0.0
 */
export function makeLens<S, A>(get: (s: S) => A, replace: (a: A, s: S) => S): Lens<S, A> {
  return make(primitiveNode("Lens", get, replace))
}

/**
 * Focuses on a part `A` of `S` that may not be present (e.g. a union
 * variant or a validated subset).
 *
 * **When to use**
 *
 * Use when the focus is conditional — reading can fail (wrong variant, failed
 *   validation).
 * - Building a new `S` from `A` does **not** require the original `S`.
 *
 * **Details**
 *
 * - `getResult(s)` returns `Result.Success<A>` when the focus matches, or
 *   `Result.Failure<SchemaIssue.Issue>` with a structured issue.
 * - `set(a)` always succeeds and returns a new `S`.
 * - Extends {@link Optional}.
 * - Composing two Prisms produces a Prism; composing a Prism with a
 *   {@link Lens} produces an {@link Optional}.
 *
 * **Example** (Narrowing a tagged union)
 *
 * ```ts import.meta.vitest
 * import { Optic, Result } from "effect"
 *
 * type Shape =
 *   | { readonly _tag: "Circle"; readonly radius: number }
 *   | { readonly _tag: "Rect"; readonly width: number }
 *
 * const _circle = Optic.id<Shape>().tag("Circle")
 *
 * _circle.getResult({ _tag: "Circle", radius: 5 }) // => Result.succeed({ _tag: "Circle", radius: 5 })
 *
 * Result.isFailure(_circle.getResult({ _tag: "Rect", width: 10 })) // => true
 * ```
 *
 * @see {@link makePrism} — constructor
 * @see {@link fromChecks} — build a Prism from schema checks
 * @see {@link Lens} — when reading always succeeds
 *
 * @category models
 * @since 4.0.0
 */
export interface Prism<in out S, in out A> extends Optional<S, A> {
  readonly set: (a: A) => S
}

/**
 * Creates a {@link Prism} from a fallible getter and an infallible setter.
 *
 * **When to use**
 *
 * Use when reading can fail (the part may not exist in `S`), but building `S`
 *   from `A` always succeeds.
 *
 * **Details**
 *
 * - `getResult` should return `Result.fail(issue)` on mismatch.
 * - Issues are not formatted automatically; callers choose how to render them.
 *
 * **Example** (Parsing a string to a number)
 *
 * ```ts import.meta.vitest
 * import { Optic, Result, SchemaIssue } from "effect"
 *
 * const numeric = Optic.makePrism<string, number>(
 *   (s) => {
 *     const n = Number(s)
 *     return Number.isNaN(n)
 *       ? Result.fail(new SchemaIssue.InvalidValue({ message: "not a number" }))
 *       : Result.succeed(n)
 *   },
 *   String
 * )
 *
 * numeric.getResult("42") // => Result.succeed(42)
 *
 * numeric.set(42) // => "42"
 * ```
 *
 * @see {@link Prism} — the type this function returns
 * @see {@link fromChecks} — build from `Schema` checks instead
 *
 * @category constructors
 * @since 4.0.0
 */
export function makePrism<S, A>(
  getResult: (s: S) => Result.Result<A, SchemaIssue.Issue>,
  set: (a: A) => S
): Prism<S, A> {
  return make(primitiveNode("Prism", getResult, set))
}

/**
 * Creates a {@link Prism} from one or more `Schema` validation checks.
 *
 * **When to use**
 *
 * Use when you want to narrow `T` to the subset that passes certain validation
 *   rules (e.g. positive integer).
 * - You already have `Schema.isGreaterThan`, `Schema.isInt`, etc.
 *
 * **Details**
 *
 * - `getResult` runs all checks and preserves their structured issues when
 *   any check fails.
 * - `set` is identity — the value passes through unchanged.
 *
 * **Example** (Creating a positive integer prism)
 *
 * ```ts import.meta.vitest
 * import { Optic, Result, Schema } from "effect"
 *
 * const posInt = Optic.fromChecks<number>(
 *   Schema.isGreaterThan(0),
 *   Schema.isInt()
 * )
 *
 * posInt.getResult(3) // => Result.succeed(3)
 *
 * Result.isFailure(posInt.getResult(-1)) // => true
 * ```
 *
 * @see {@link makePrism} — constructor with custom getter/setter
 * @see {@link Prism} — the type this function returns
 *
 * @category constructors
 * @since 4.0.0
 */
export function fromChecks<T>(...checks: readonly [SchemaAST.Check<T>, ...Array<SchemaAST.Check<T>>]): Prism<T, T> {
  return make([new CheckNode(checks)])
}

type Kind = "Iso" | "Lens" | "Prism" | "Optional"

type Operation = {
  readonly kind: Kind
  readonly get: (s: any) => any
  readonly set: (a: any, s?: any) => any
}

type PrimitiveStep = Operation & {
  readonly _tag: "PrimitiveNode"
}

type Step = PrimitiveStep | PathNode | CheckNode<any>

type Node = ReadonlyArray<Step>

function primitiveNode(kind: Kind, get: (s: any) => any, set: (a: any, s?: any) => any): Node {
  return [{ _tag: "PrimitiveNode", kind, get, set }]
}

const identityOperation: Operation = {
  kind: "Iso",
  get: identity,
  set: identity
}

class PathNode {
  readonly _tag = "PathNode"
  readonly kind = "Lens"
  readonly path: ReadonlyArray<PropertyKey>
  readonly get: (s: any) => any
  readonly set: (a: any, s?: any) => any

  constructor(path: ReadonlyArray<PropertyKey>) {
    this.path = path
    this.get = (s) => {
      let out = s
      for (let i = 0; i < path.length; i++) {
        out = out[path[i]]
      }
      return out
    }
    this.set = (a, s) => {
      const out = cloneShallow(s)
      let current = out
      let i = 0
      for (; i < path.length - 1; i++) {
        const key = path[i]
        InternalRecord.assignProperty(current, key, cloneShallow(current[key]))
        current = current[key]
      }
      InternalRecord.assignProperty(current, path[i], a)
      return out
    }
  }
}

class CheckNode<T> {
  readonly _tag = "CheckNode"
  readonly kind = "Prism"
  readonly checks: readonly [SchemaAST.Check<T>, ...Array<SchemaAST.Check<T>>]
  readonly get: (s: T) => Result.Result<T, SchemaIssue.Issue>
  readonly set = identity

  constructor(checks: readonly [SchemaAST.Check<T>, ...Array<SchemaAST.Check<T>>]) {
    this.checks = checks
    this.get = (s) => SchemaAST.runChecks(checks, s)
  }
}

function compose(a: Node, b: Node): Node {
  if (a.length === 0) return b
  if (b.length === 0) return a
  const nodes = a.slice()
  for (let i = 0; i < b.length; i++) {
    const node = b[i]
    const last = nodes[nodes.length - 1]
    if (last._tag === "PathNode" && node._tag === "PathNode") {
      nodes[nodes.length - 1] = new PathNode([...last.path, ...node.path])
    } else if (last._tag === "CheckNode" && node._tag === "CheckNode") {
      nodes[nodes.length - 1] = new CheckNode<any>([...last.checks, ...node.checks])
    } else {
      nodes.push(node)
    }
  }
  return nodes
}

type ForbidUnion<A, Message extends string> = IsUnion<A> extends true ? [Message] : []

/**
 * The most general optic — both reading and writing can fail.
 *
 * **When to use**
 *
 * Use when the focus may not exist in `S` and writing a new `A` back may also
 * fail, for example when the source no longer matches the expected shape. This
 * is the base type extended by {@link Iso}, {@link Lens}, {@link Prism}, and
 * {@link Traversal}.
 *
 * **Details**
 *
 * - `getResult(s)` returns `Result.Success<A>` or `Result.Failure<SchemaIssue.Issue>`.
 * - `replaceResult(a, s)` returns `Result.Success<S>` or
 *   `Result.Failure<SchemaIssue.Issue>`.
 * - `replace(a, s)` returns the original `s` on failure (never throws).
 * - `modify(f)` returns the original `s` on failure (never throws).
 * - All operations are pure; inputs are never mutated.
 *
 * **Example** (Focusing on an optional record key)
 *
 * ```ts import.meta.vitest
 * import { Optic, Result } from "effect"
 *
 * type Env = { [key: string]: string }
 * const _home = Optic.id<Env>().at("HOME")
 *
 * _home.getResult({ HOME: "/root" }) // => Result.succeed("/root")
 *
 * Result.isFailure(_home.getResult({ PATH: "/bin" })) // => true
 *
 * // replace returns original on failure
 * _home.replace("/new", { PATH: "/bin" }) // => { PATH: "/bin" }
 * ```
 *
 * @see {@link makeOptional} — constructor
 * @see {@link Lens} — when reading always succeeds
 * @see {@link Prism} — when writing always succeeds
 *
 * @category models
 * @since 4.0.0
 */
export interface Optional<in out S, in out A> {
  /**
   * Attempts to read the focus `A` from the whole `S`. Returns
   * `Result.Success<A>` when the focus exists, or
   * `Result.Failure<SchemaIssue.Issue>` with a structured issue otherwise.
   */
  readonly getResult: (s: S) => Result.Result<A, SchemaIssue.Issue>
  /**
   * Replaces the focus in `S` with a new `A`. Returns the original `s`
   * unchanged when the optic cannot focus (never throws).
   */
  readonly replace: (a: A, s: S) => S
  /**
   * Like {@link replace}, but returns an explicit `Result` so callers can
   * detect and handle failure.
   */
  readonly replaceResult: (a: A, s: S) => Result.Result<S, SchemaIssue.Issue>
  /**
   * Composes this optic with another. The result type is the weakest of
   * the two: Iso + Iso = Iso, Lens + Prism = Optional, etc.
   *
   * **Example** (Composing a lens with a prism)
   *
   * ```ts import.meta.vitest
   * import { Optic, Option, Result } from "effect"
   *
   * type State = { value: Option.Option<number> }
   *
   * const _inner = Optic.id<State>().key("value").compose(Optic.some())
   * // _inner is Optional<State, number>
   * _inner.getResult({ value: Option.some(1) }) // => Result.succeed(1)
   * ```
   *
   * @see {@link id} — start a composition chain
   */
  compose<B>(this: Iso<S, A>, that: Iso<A, B>): Iso<S, B>
  compose<B>(this: Lens<S, A>, that: Lens<A, B>): Lens<S, B>
  compose<B>(this: Prism<S, A>, that: Prism<A, B>): Prism<S, B>
  compose<B>(this: Optional<S, A>, that: Optional<A, B>): Optional<S, B>

  /**
   * Returns a function `(s: S) => S` that applies `f` to the focused value.
   * If the optic cannot focus, the original `s` is returned unchanged.
   *
   * **Example** (Incrementing a nested field)
   *
   * ```ts import.meta.vitest
   * import { Optic } from "effect"
   *
   * type S = { readonly a: { readonly b: number } }
   * const _b = Optic.id<S>().key("a").key("b")
   *
   * const inc = _b.modify((n) => n + 1)
   * inc({ a: { b: 1 } }) // => { a: { b: 2 } }
   * ```
   */
  modify(f: (a: A) => A): (s: S) => S

  /**
   * Focuses on a property of the current struct/tuple focus.
   *
   * **Details**
   *
   * - On a {@link Lens}, returns a Lens.
   * - On an {@link Optional}, returns an Optional.
   * - Does **not** work on union types (compile error).
   *
   * **Example** (Drilling into nested structs)
   *
   * ```ts import.meta.vitest
   * import { Optic } from "effect"
   *
   * type S = { readonly a: { readonly b: number } }
   * const _b = Optic.id<S>().key("a").key("b")
   *
   * _b.get({ a: { b: 42 } }) // => 42
   * ```
   */
  key<S, A extends object, Key extends keyof A>(
    this: Lens<S, A>,
    key: Key,
    ..._err: ForbidUnion<A, "cannot use `key` on a union type">
  ): Lens<S, A[Key]>
  key<S, A extends object, Key extends keyof A>(
    this: Optional<S, A>,
    key: Key,
    ..._err: ForbidUnion<A, "cannot use `key` on a union type">
  ): Optional<S, A[Key]>

  /**
   * Focuses on a key where setting `undefined` **removes** the key from the
   * struct (or splices the element from an array/tuple).
   *
   * **Details**
   *
   * - The focus type becomes `A[Key] | undefined`.
   * - Does **not** work on union types (compile error).
   *
   * **Example** (Deleting an optional key)
   *
   * ```ts import.meta.vitest
   * import { Optic } from "effect"
   *
   * type S = { readonly a?: number }
   * const _a = Optic.id<S>().optionalKey("a")
   *
   * _a.replace(undefined, { a: 1 }) // => {}
   *
   * _a.replace(2, {}) // => { a: 2 }
   * ```
   */
  optionalKey<S, A extends object, Key extends keyof A>(
    this: Lens<S, A>,
    key: Key,
    ..._err: ForbidUnion<A, "cannot use `optionalKey` on a union type">
  ): Lens<S, A[Key] | undefined>
  optionalKey<S, A extends object, Key extends keyof A>(
    this: Optional<S, A>,
    key: Key,
    ..._err: ForbidUnion<A, "cannot use `optionalKey` on a union type">
  ): Optional<S, A[Key] | undefined>

  /**
   * Adds one or more `Schema` validation checks to the optic chain.
   * `getResult` fails when any check fails; `set` passes through unchanged.
   *
   * **Details**
   *
   * - On a {@link Prism}, returns a Prism.
   * - On an {@link Optional}, returns an Optional.
   *
   * **Example** (Focusing only on positive numbers)
   *
   * ```ts import.meta.vitest
   * import { Optic, Result, Schema } from "effect"
   *
   * const _pos = Optic.id<number>().check(Schema.isGreaterThan(0))
   *
   * _pos.getResult(5) // => Result.succeed(5)
   *
   * Result.isFailure(_pos.getResult(-1)) // => true
   * ```
   *
   * @see {@link fromChecks} — standalone prism from checks
   */
  check<S, A>(this: Prism<S, A>, ...checks: readonly [SchemaAST.Check<A>, ...Array<SchemaAST.Check<A>>]): Prism<S, A>
  check<S, A>(
    this: Optional<S, A>,
    ...checks: readonly [SchemaAST.Check<A>, ...Array<SchemaAST.Check<A>>]
  ): Optional<S, A>

  /**
   * Narrows the focus to a subtype `B` using a type guard.
   *
   * **Details**
   *
   * - On a {@link Prism}, returns a Prism.
   * - On an {@link Optional}, returns an Optional.
   * - Pass optional `annotations` to customize the error message.
   *
   * **Example** (Narrowing a union)
   *
   * ```ts import.meta.vitest
   * import { Optic, Result } from "effect"
   *
   * type B = { readonly _tag: "b"; readonly b: number }
   * type S = { readonly _tag: "a"; readonly a: string } | B
   *
   * const _b = Optic.id<S>().refine(
   *   (s: S): s is B => s._tag === "b",
   *   { expected: `"b" tag` }
   * )
   *
   * _b.getResult({ _tag: "b", b: 1 }) // => Result.succeed({ _tag: "b", b: 1 })
   * ```
   *
   * @see `.tag()` — shorthand for narrowing by `_tag`
   */
  refine<S, A, B extends A>(
    this: Prism<S, A>,
    refinement: (a: A) => a is B,
    annotations?: Schema.Annotations.Filter
  ): Prism<S, B>
  refine<S, A, B extends A>(
    this: Optional<S, A>,
    refinement: (a: A) => a is B,
    annotations?: Schema.Annotations.Filter
  ): Optional<S, B>

  /**
   * Narrows the focus to the variant of a tagged union with the given
   * `_tag` value.
   *
   * **Details**
   *
   * - On a {@link Prism}, returns a Prism.
   * - On an {@link Optional}, returns an Optional.
   * - Shorthand for `.refine(s => s._tag === tag)`.
   * - A non-matching value fails with {@link SchemaIssue.InvalidValue} whose
   *   `expected` annotation is `"<tag> tag"`.
   *
   * **Example** (Focusing a tagged variant)
   *
   * ```ts import.meta.vitest
   * import { Optic, Result } from "effect"
   *
   * type Shape =
   *   | { readonly _tag: "Circle"; readonly radius: number }
   *   | { readonly _tag: "Rect"; readonly width: number }
   *
   * const _radius = Optic.id<Shape>().tag("Circle").key("radius")
   *
   * _radius.getResult({ _tag: "Circle", radius: 5 }) // => Result.succeed(5)
   *
   * Result.isFailure(_radius.getResult({ _tag: "Rect", width: 10 })) // => true
   * ```
   *
   * @see `.refine()` — for arbitrary type guards
   */
  tag<S, A extends { readonly _tag: SchemaAST.LiteralValue }, Tag extends A["_tag"]>(
    this: Prism<S, A>,
    tag: Tag
  ): Prism<S, Extract<A, { readonly _tag: Tag }>>
  tag<S, A extends { readonly _tag: SchemaAST.LiteralValue }, Tag extends A["_tag"]>(
    this: Optional<S, A>,
    tag: Tag
  ): Optional<S, Extract<A, { readonly _tag: Tag }>>

  /**
   * Focuses on a key only if it exists (`Object.hasOwn`). Both
   * `getResult` and `replaceResult` fail when the key is absent.
   *
   * **Details**
   *
   * Unlike `.key()`, which always succeeds on the read side, `.at()` is
   * useful for Records or arrays where the key/index may not be present.
   *
   * - Always returns an {@link Optional}.
   * - Does **not** work on union types (compile error).
   * - A missing key fails with a {@link SchemaIssue.Pointer} at that key whose
   *   inner issue is {@link SchemaIssue.MissingKey}, for both `getResult` and
   *   `replaceResult`.
   *
   * **Example** (Accessing records safely)
   *
   * ```ts import.meta.vitest
   * import { Optic, Result } from "effect"
   *
   * type Env = { [key: string]: number }
   * const _x = Optic.id<Env>().at("x")
   *
   * _x.getResult({ x: 1 }) // => Result.succeed(1)
   *
   * Result.isFailure(_x.getResult({ y: 2 })) // => true
   * ```
   *
   * @see `.key()` — when the key is always present
   */
  at<S, A extends object, Key extends keyof A>(
    this: Optional<S, A>,
    key: Key,
    ..._err: ForbidUnion<A, "cannot use `at` on a union type">
  ): Optional<S, A[Key]>

  /**
   * Focuses on a subset of keys of the current struct focus.
   *
   * **Details**
   *
   * - On a {@link Lens}, returns a Lens.
   * - On an {@link Optional}, returns an Optional.
   * - Does **not** work on union types (compile error).
   *
   * **Example** (Picking keys)
   *
   * ```ts import.meta.vitest
   * import { Optic } from "effect"
   *
   * type S = { readonly a: string; readonly b: number; readonly c: boolean }
   *
   * const _ac = Optic.id<S>().pick(["a", "c"])
   *
   * _ac.get({ a: "hi", b: 1, c: true }) // => { a: "hi", c: true }
   * ```
   *
   * @see `.omit()` — the inverse operation
   */
  pick<S, A, Keys extends ReadonlyArray<keyof A>>(
    this: Lens<S, A>,
    keys: Keys,
    ..._err: ForbidUnion<A, "cannot use `pick` on a union type">
  ): Lens<S, Pick<A, Keys[number]>>
  pick<S, A, Keys extends ReadonlyArray<keyof A>>(
    this: Optional<S, A>,
    keys: Keys,
    ..._err: ForbidUnion<A, "cannot use `pick` on a union type">
  ): Optional<S, Pick<A, Keys[number]>>

  /**
   * Focuses on all keys **except** the specified ones.
   *
   * **Details**
   *
   * - On a {@link Lens}, returns a Lens.
   * - On an {@link Optional}, returns an Optional.
   * - Does **not** work on union types (compile error).
   *
   * **Example** (Omitting keys)
   *
   * ```ts import.meta.vitest
   * import { Optic } from "effect"
   *
   * type S = { readonly a: string; readonly b: number; readonly c: boolean }
   *
   * const _ac = Optic.id<S>().omit(["b"])
   *
   * _ac.get({ a: "hi", b: 1, c: true }) // => { a: "hi", c: true }
   * ```
   *
   * @see `.pick()` — the inverse operation
   *
   * @since 4.0.0
   */
  omit<S, A, Keys extends ReadonlyArray<keyof A>>(
    this: Lens<S, A>,
    keys: Keys,
    ..._err: ForbidUnion<A, "cannot use `omit` on a union type">
  ): Lens<S, Omit<A, Keys[number]>>
  omit<S, A, Keys extends ReadonlyArray<keyof A>>(
    this: Optional<S, A>,
    keys: Keys,
    ..._err: ForbidUnion<A, "cannot use `omit` on a union type">
  ): Optional<S, Omit<A, Keys[number]>>

  /**
   * Filters out `undefined` from the focus, producing a {@link Prism}.
   * `getResult` fails when the focus is `undefined`.
   *
   * **Example** (Filtering undefined values)
   *
   * ```ts import.meta.vitest
   * import { Optic, Result } from "effect"
   *
   * const _defined = Optic.id<number | undefined>().notUndefined()
   *
   * _defined.getResult(42) // => Result.succeed(42)
   *
   * Result.isFailure(_defined.getResult(undefined)) // => true
   * ```
   *
   * @since 4.0.0
   */
  notUndefined<S, A>(this: Prism<S, A>): Prism<S, Exclude<A, undefined>>
  notUndefined<S, A>(this: Optional<S, A>): Optional<S, Exclude<A, undefined>>

  /**
   * Focuses **all elements** of an array-like focus and optionally narrows
   * to a subset using an element-level optic.
   * Available only on {@link Traversal} (i.e. when `A` is
   * `ReadonlyArray<Element>`). Returns a new Traversal focused on the
   * selected elements.
   *
   * **Details**
   *
   * - **getResult** collects the values focused by `f(id<A>())` for each
   *   element. Non-focusable elements are skipped.
   * - **replaceResult** expects exactly as many values as were collected by
   *   `getResult` and writes them back in order. Fails with a
   *   {@link SchemaIssue.InvalidValue} if counts differ. If an inner replacement
   *   fails, its issue is wrapped in a {@link SchemaIssue.Pointer} at the element
   *   index.
   *
   * **Example** (Incrementing liked posts)
   *
   * ```ts import.meta.vitest
   * import { Optic, Schema } from "effect"
   *
   * type Post = { title: string; likes: number }
   * type S = { user: { posts: ReadonlyArray<Post> } }
   *
   * const _likes = Optic.id<S>()
   *   .key("user")
   *   .key("posts")
   *   .forEach((post) => post.key("likes").check(Schema.isGreaterThan(0)))
   *
   * const addLike = _likes.modifyAll((n) => n + 1)
   *
   * const result = addLike({
   *   user: { posts: [{ title: "a", likes: 0 }, { title: "b", likes: 1 }] }
   * })
   * result.user.posts // => [{ title: "a", likes: 0 }, { title: "b", likes: 2 }]
   * ```
   *
   * @see {@link getAll} — extract all focused elements as an array
   * @see `.modifyAll()` — apply a function to every focused element
   */
  forEach<S, A, B>(this: Traversal<S, A>, f: (iso: Iso<A, A>) => Optional<A, B>): Traversal<S, B>

  /**
   * Applies a function to **every** element focused by the traversal.
   *
   * **Details**
   *
   * Available only on {@link Traversal}. Returns a function `(s: S) => S`.
   * If the traversal cannot focus, the original `s` is returned unchanged.
   *
   * Unlike `.modify()`, which operates on the whole array, `modifyAll`
   * maps `f` over each individual element.
   *
   * **Example** (Doubling all focused values)
   *
   * ```ts import.meta.vitest
   * import { Optic, Schema } from "effect"
   *
   * type S = { readonly items: ReadonlyArray<number> }
   *
   * const _positive = Optic.id<S>()
   *   .key("items")
   *   .forEach((n) => n.check(Schema.isGreaterThan(0)))
   *
   * const doubled = _positive.modifyAll((n) => n * 2)
   *
   * doubled({ items: [1, -2, 3] }) // => { items: [2, -2, 6] }
   * ```
   *
   * @see `.forEach()` — create a sub-traversal
   * @see {@link getAll} — extract focused elements
   */
  modifyAll<S, A>(this: Traversal<S, A>, f: (a: A) => A): (s: S) => S
}

/**
 * Creates an {@link Optional} from a fallible getter and a fallible setter.
 *
 * **When to use**
 *
 * Use when you need an optic for a focus that may be missing on read and may
 * reject updates on write.
 *
 * **Details**
 *
 * - `getResult` should return `Result.fail(issue)` on mismatch.
 * - `set` should return `Result.fail(issue)` when the update cannot be
 *   applied.
 * - Issues are not formatted automatically; callers choose how to render them.
 *
 * **Example** (Accessing record keys safely)
 *
 * ```ts import.meta.vitest
 * import { Optic, Result, SchemaIssue } from "effect"
 *
 * const atKey = (key: string) => {
 *   const issue = new SchemaIssue.Pointer([key], new SchemaIssue.MissingKey(undefined))
 *   return Optic.makeOptional<Record<string, number>, number>(
 *     (s) =>
 *       Object.hasOwn(s, key)
 *         ? Result.succeed(s[key])
 *         : Result.fail(issue),
 *     (a, s) =>
 *       Object.hasOwn(s, key)
 *         ? Result.succeed({ ...s, [key]: a })
 *         : Result.fail(issue)
 *   )
 * }
 *
 * atKey("x").getResult({ x: 1 }) // => Result.succeed(1)
 * ```
 *
 * @see {@link Optional} — the type this function returns
 * @see {@link makeLens} — when reading always succeeds
 * @see {@link makePrism} — when writing always succeeds
 *
 * @category constructors
 * @since 4.0.0
 */
export function makeOptional<S, A>(
  getResult: (s: S) => Result.Result<A, SchemaIssue.Issue>,
  set: (a: A, s: S) => Result.Result<S, SchemaIssue.Issue>
): Optional<S, A> {
  return make(primitiveNode("Optional", getResult, set))
}

/**
 * An optic that focuses on **zero or more** elements of type `A` inside `S`.
 *
 * **When to use**
 *
 * Use when you want to read/update multiple elements at once (e.g. all items in
 *   an array, or a filtered subset).
 *
 * **Details**
 *
 * - Technically `Optional<S, ReadonlyArray<A>>` — the focused value is an
 *   array of all matched elements.
 * - Use `.forEach()` to add per-element sub-optics (filtering, drilling
 *   deeper).
 * - Use `.modifyAll(f)` to map a function over every focused element.
 * - Use {@link getAll} to extract all focused elements as a plain array.
 *
 * **Example** (Traversing array elements with a filter)
 *
 * ```ts import.meta.vitest
 * import { Optic, Schema } from "effect"
 *
 * type S = { readonly items: ReadonlyArray<number> }
 *
 * const _positive = Optic.id<S>()
 *   .key("items")
 *   .forEach((n) => n.check(Schema.isGreaterThan(0)))
 *
 * const getPositive = Optic.getAll(_positive)
 *
 * getPositive({ items: [1, -2, 3] }) // => [1, 3]
 * ```
 *
 * @see {@link getAll} — extract focused elements
 * @see {@link Optional} — the base type
 *
 * @category models
 * @since 4.0.0
 */
export interface Traversal<in out S, in out A> extends Optional<S, ReadonlyArray<A>> {}

class OptionalImpl<S, A> implements Optional<S, A> {
  /** @internal */
  readonly node: Node
  readonly getResult: (s: S) => Result.Result<A, SchemaIssue.Issue>
  readonly replaceResult: (a: A, s: S) => Result.Result<S, SchemaIssue.Issue>
  constructor(
    node: Node,
    getResult: (s: S) => Result.Result<A, SchemaIssue.Issue>,
    replaceResult: (a: A, s: S) => Result.Result<S, SchemaIssue.Issue>
  ) {
    this.node = node
    this.getResult = getResult
    this.replaceResult = replaceResult
  }
  replace(a: A, s: S): S {
    return Result.getOrElse(this.replaceResult(a, s), () => s)
  }
  modify(f: (a: A) => A): (s: S) => S {
    return (s) => Result.getOrElse(Result.flatMap(this.getResult(s), (a) => this.replaceResult(f(a), s)), () => s)
  }
  compose(that: any): any {
    return make(compose(this.node, that.node))
  }
  key(key: PropertyKey): any {
    return make(compose(this.node, [new PathNode([key])]))
  }
  optionalKey(key: PropertyKey): any {
    return make(
      compose(
        this.node,
        primitiveNode(
          "Lens",
          (s) => s[key],
          (a, s) => {
            const copy = cloneShallow(s)
            if (a === undefined) {
              if (
                Array.isArray(copy) &&
                (typeof key === "number" || (typeof key === "string" && Arr.isCanonicalArrayIndex(key)))
              ) {
                copy.splice(Number(key), 1)
              } else {
                delete copy[key]
              }
            } else {
              InternalRecord.assignProperty(copy, key, a)
            }
            return copy
          }
        )
      )
    )
  }
  check(...checks: readonly [SchemaAST.Check<any>, ...Array<SchemaAST.Check<any>>]): any {
    return make(compose(this.node, [new CheckNode(checks)]))
  }
  refine<B extends A>(refinement: (a: A) => a is B, annotations?: Schema.Annotations.Filter): any {
    return make(compose(this.node, [new CheckNode([SchemaAST.makeFilterByGuard(refinement, annotations)])]))
  }
  tag(tag: string): any {
    const err = Result.fail(new SchemaIssue.InvalidValue({ expected: `${JSON.stringify(tag)} tag` }))
    return make(
      compose(
        this.node,
        primitiveNode(
          "Prism",
          (s) => s._tag === tag ? Result.succeed(s) : err,
          identity
        )
      )
    )
  }
  at(key: PropertyKey, ..._rest: Array<any>): any {
    const err = Result.fail(
      new SchemaIssue.Pointer([key], new SchemaIssue.MissingKey(undefined))
    )
    return make(
      compose(
        this.node,
        primitiveNode(
          "Optional",
          (s) => Object.hasOwn(s, key) ? Result.succeed(s[key]) : err,
          (a, s) => {
            if (Object.hasOwn(s, key)) {
              const copy = cloneShallow(s)
              InternalRecord.assignProperty(copy, key, a)
              return Result.succeed(copy)
            } else {
              return err
            }
          }
        )
      )
    )
  }
  pick(keys: any) {
    return this.compose(makeLens(Struct.pick(keys), (p, a) => ({ ...Struct.omit(a, keys), ...p })))
  }
  omit(keys: any) {
    return this.compose(makeLens(Struct.omit(keys), (o, a) => ({ ...Struct.pick(a, keys), ...o })))
  }
  notUndefined(): any {
    return this.refine(Predicate.isNotUndefined, { expected: "a value other than `undefined`" })
  }
  forEach<S, A, B>(this: Traversal<S, A>, f: (iso: Iso<A, A>) => Optional<A, B>): Traversal<S, B> {
    const inner = f(id<A>())
    return makeOptional<S, ReadonlyArray<B>>(
      // GET: collect focused Bs
      (s) =>
        Result.map(this.getResult(s), (as) => {
          const bs: Array<B> = []
          for (let i = 0; i < as.length; i++) {
            const r = inner.getResult(as[i])
            if (Result.isSuccess(r)) bs.push(r.success)
          }
          return bs
        }),
      // SET: bs must match the number of focusable elements
      (bs, s) =>
        Result.flatMap(this.getResult(s), (as) => {
          // 1) collect focusable indices
          const idxs: Array<number> = []
          for (let i = 0; i < as.length; i++) {
            if (Result.isSuccess(inner.getResult(as[i]))) idxs.push(i)
          }

          // 2) arity check
          if (bs.length !== idxs.length) {
            return Result.fail(
              new SchemaIssue.InvalidValue({
                message: `each: replacement length mismatch: ${bs.length} !== ${idxs.length}`
              })
            )
          }

          // 3) update those indices
          const out: Array<A> = as.slice()
          for (let k = 0; k < idxs.length; k++) {
            const i = idxs[k]
            const r = inner.replaceResult(bs[k], as[i])
            if (Result.isFailure(r)) {
              return Result.fail(new SchemaIssue.Pointer([i], r.failure))
            }
            out[i] = r.success
          }
          return this.replaceResult(out, s)
        })
    )
  }
  modifyAll<S, A>(this: Traversal<S, A>, f: (a: A) => A): (s: S) => S {
    return (s) =>
      Result.getOrElse(
        Result.flatMap(this.getResult(s), (as) => this.replaceResult(as.map(f), s)),
        () => s
      )
  }
}

class IsoImpl<S, A> extends OptionalImpl<S, A> implements Iso<S, A> {
  readonly get: (s: S) => A
  readonly set: (a: A) => S
  constructor(node: Node, get: (s: S) => A, set: (a: A) => S) {
    super(node, (s) => Result.succeed(get(s)), (a) => Result.succeed(set(a)))
    this.get = get
    this.set = set
  }
  override replace(a: A, _: S): S {
    return this.set(a)
  }
  override modify(f: (a: A) => A): (s: S) => S {
    return (s) => this.set(f(this.get(s)))
  }
}

class LensImpl<S, A> extends OptionalImpl<S, A> implements Lens<S, A> {
  readonly get: (s: S) => A
  constructor(node: Node, get: (s: S) => A, replace: (a: A, s: S) => S) {
    super(node, (s) => Result.succeed(get(s)), (a, s) => Result.succeed(replace(a, s)))
    this.get = get
    this.replace = replace
  }
  override modify(f: (a: A) => A): (s: S) => S {
    return (s) => this.replace(f(this.get(s)), s)
  }
}

class PrismImpl<S, A> extends OptionalImpl<S, A> implements Prism<S, A> {
  readonly set: (a: A) => S
  constructor(node: Node, getResult: (s: S) => Result.Result<A, SchemaIssue.Issue>, set: (a: A) => S) {
    super(node, getResult, (a, _) => Result.succeed(set(a)))
    this.set = set
  }
  override replace(a: A, _: S): S {
    return this.set(a)
  }
  override modify(f: (a: A) => A): (s: S) => S {
    return (s) => Result.getOrElse(Result.map(this.getResult(s), (a) => this.set(f(a))), () => s)
  }
}

function make(node: Node): any {
  let op: Operation = node[0] ?? identityOperation
  if (node.length > 1) {
    const kind = node.reduce<Kind>((kind, step) => composeKind(kind, step.kind), "Iso")
    op = {
      kind,
      get: compileGet(node, kind),
      set: compileSet(node, kind)
    }
  }
  switch (op.kind) {
    case "Iso":
      return new IsoImpl(node, op.get, op.set)
    case "Lens":
      return new LensImpl(node, op.get, op.set)
    case "Prism":
      return new PrismImpl(node, op.get, op.set)
    case "Optional":
      return new OptionalImpl(node, op.get, op.set)
  }
}

function cloneShallow<T>(pojo: T): T {
  if (Array.isArray(pojo)) return pojo.slice() as T
  if (typeof pojo === "object" && pojo !== null) {
    const proto = Object.getPrototypeOf(pojo)
    if (proto !== Object.prototype && proto !== null) {
      throw new Error("Cannot clone object with non-Object constructor or null prototype")
    }
    return { ...pojo } as T
  }
  return pojo
}

function compileGet(nodes: Node, kind: Kind): (s: any) => any {
  return (s) => {
    for (let i = 0; i < nodes.length; i++) {
      const op = nodes[i]
      const result = op.get(s)
      if (hasFailingGet(op.kind)) {
        if (Result.isFailure(result)) {
          return result
        }
        s = result.success
      } else {
        s = result
      }
    }
    return hasFailingGet(kind) ? Result.succeed(s) : s
  }
}

function compileSet(nodes: Node, kind: Kind): (a: any, s: any) => any {
  if (hasSourceFreeSet(kind)) {
    return (a) => {
      for (let i = nodes.length - 1; i >= 0; i--) {
        a = nodes[i].set(a)
      }
      return a
    }
  }
  return (a, s) => {
    const len = nodes.length
    const sources = new Array(len)
    for (let i = 0; i < len; i++) {
      sources[i] = s
      const op = nodes[i]
      if (hasFailingGet(op.kind)) {
        const result = op.get(s)
        if (Result.isFailure(result)) {
          return result
        }
        s = result.success
      } else {
        s = op.get(s)
      }
    }
    for (let i = len - 1; i >= 0; i--) {
      const op = nodes[i]
      if (hasSourceFreeSet(op.kind)) {
        a = op.set(a)
      } else if (op.kind === "Lens") {
        a = op.set(a, sources[i])
      } else {
        const result = op.set(a, sources[i])
        if (Result.isFailure(result)) {
          return result
        }
        a = result.success
      }
    }
    return kind === "Optional" ? Result.succeed(a) : a
  }
}

function hasFailingGet(kind: Kind): boolean {
  return kind === "Prism" || kind === "Optional"
}

function hasSourceFreeSet(kind: Kind): boolean {
  return kind === "Iso" || kind === "Prism"
}

function composeKind(a: Kind, b: Kind): Kind {
  if (a === "Iso") return b
  if (b === "Iso" || a === b) return a
  return "Optional"
}
// ---------------------------------------------
// Derived APIs
// ---------------------------------------------

/**
 * Reads the focused value from a `Lens`.
 *
 * **When to use**
 *
 * Use when the optic always focuses exactly one value.
 *
 * **Details**
 *
 * Supports both data-first and data-last forms.
 *
 * @see {@link getResult} for optics whose focus may be absent
 *
 * @category getters
 * @since 4.0.0
 */
export const get: {
  <S, A>(optic: Lens<S, A>): (self: NoInfer<S>) => A
  <S, A>(self: NoInfer<S>, optic: Lens<S, A>): A
} = dual<
  <S, A>(optic: Lens<S, A>) => (self: NoInfer<S>) => A,
  <S, A>(self: NoInfer<S>, optic: Lens<S, A>) => A
>(2, (self, optic) => optic.get(self))

/**
 * Attempts to read the focused value from an `Optional`.
 *
 * **When to use**
 *
 * Use when the optic may not focus and you need the failure as a `Result`.
 *
 * **Details**
 *
 * Supports both data-first and data-last forms.
 *
 * @see {@link get} for optics that always focus
 *
 * @category getters
 * @since 4.0.0
 */
export const getResult: {
  <S, A>(optic: Optional<S, A>): (self: NoInfer<S>) => Result.Result<A, SchemaIssue.Issue>
  <S, A>(self: NoInfer<S>, optic: Optional<S, A>): Result.Result<A, SchemaIssue.Issue>
} = dual<
  <S, A>(optic: Optional<S, A>) => (self: NoInfer<S>) => Result.Result<A, SchemaIssue.Issue>,
  <S, A>(self: NoInfer<S>, optic: Optional<S, A>) => Result.Result<A, SchemaIssue.Issue>
>(2, (self, optic) => optic.getResult(self))

/**
 * Builds a source value from a focused value using a `Prism`.
 *
 * **When to use**
 *
 * Use when the optic can construct the source without an existing source value.
 *
 * **Details**
 *
 * Supports both data-first and data-last forms. The focused value is `self`.
 *
 * @see {@link replace} for updates that use an existing source
 *
 * @category transforming
 * @since 4.0.0
 */
export const set: {
  <S, A>(optic: Prism<S, A>): (self: NoInfer<A>) => S
  <S, A>(self: NoInfer<A>, optic: Prism<S, A>): S
} = dual<
  <S, A>(optic: Prism<S, A>) => (self: NoInfer<A>) => S,
  <S, A>(self: NoInfer<A>, optic: Prism<S, A>) => S
>(2, (self, optic) => optic.set(self))

/**
 * Replaces the focused value in a source.
 *
 * **When to use**
 *
 * Use when a failed focus should leave the source unchanged.
 *
 * **Details**
 *
 * Supports both data-first and data-last forms.
 *
 * @see {@link replaceResult} for an explicit replacement failure
 *
 * @category transforming
 * @since 4.0.0
 */
export const replace: {
  <S, A>(optic: Optional<S, A>, value: NoInfer<A>): (self: NoInfer<S>) => S
  <S, A>(self: NoInfer<S>, optic: Optional<S, A>, value: NoInfer<A>): S
} = dual<
  <S, A>(optic: Optional<S, A>, value: NoInfer<A>) => (self: NoInfer<S>) => S,
  <S, A>(self: NoInfer<S>, optic: Optional<S, A>, value: NoInfer<A>) => S
>(3, (self, optic, value) => optic.replace(value, self))

/**
 * Attempts to replace the focused value in a source.
 *
 * **When to use**
 *
 * Use when you need an explicit `Result` for a replacement failure.
 *
 * **Details**
 *
 * Supports both data-first and data-last forms.
 *
 * @see {@link replace} for returning the original source on failure
 *
 * @category transforming
 * @since 4.0.0
 */
export const replaceResult: {
  <S, A>(
    optic: Optional<S, A>,
    value: NoInfer<A>
  ): (self: NoInfer<S>) => Result.Result<S, SchemaIssue.Issue>
  <S, A>(
    self: NoInfer<S>,
    optic: Optional<S, A>,
    value: NoInfer<A>
  ): Result.Result<S, SchemaIssue.Issue>
} = dual<
  <S, A>(
    optic: Optional<S, A>,
    value: NoInfer<A>
  ) => (self: NoInfer<S>) => Result.Result<S, SchemaIssue.Issue>,
  <S, A>(
    self: NoInfer<S>,
    optic: Optional<S, A>,
    value: NoInfer<A>
  ) => Result.Result<S, SchemaIssue.Issue>
>(3, (self, optic, value) => optic.replaceResult(value, self))

/**
 * Transforms the focused value in a source.
 *
 * **When to use**
 *
 * Use when you want to update a focus with a function.
 *
 * **Details**
 *
 * Supports both data-first and data-last forms. A failed focus leaves the
 * source unchanged.
 *
 * @see {@link modifyAll} for transforming every value in a traversal
 *
 * @category transforming
 * @since 4.0.0
 */
export const modify: {
  <S, A>(
    optic: Optional<S, A>,
    f: (value: NoInfer<A>) => NoInfer<A>
  ): (self: NoInfer<S>) => S
  <S, A>(
    self: NoInfer<S>,
    optic: Optional<S, A>,
    f: (value: NoInfer<A>) => NoInfer<A>
  ): S
} = dual<
  <S, A>(
    optic: Optional<S, A>,
    f: (value: NoInfer<A>) => NoInfer<A>
  ) => (self: NoInfer<S>) => S,
  <S, A>(
    self: NoInfer<S>,
    optic: Optional<S, A>,
    f: (value: NoInfer<A>) => NoInfer<A>
  ) => S
>(3, (self, optic, f) => optic.modify(f)(self))

/**
 * Extracts all values focused by a `Traversal` as a plain mutable array.
 *
 * **When to use**
 *
 * Use when you need the focused values as a simple `Array<A>` for further
 *   processing.
 *
 * **Details**
 *
 * - Returns an empty array when the traversal cannot focus.
 * - Always returns a fresh array (safe to mutate).
 * - Supports both data-first and data-last forms.
 *
 * **Example** (Collecting positive numbers)
 *
 * ```ts import.meta.vitest
 * import { Optic, Schema } from "effect"
 *
 * type S = { readonly values: ReadonlyArray<number> }
 *
 * const _pos = Optic.id<S>()
 *   .key("values")
 *   .forEach((n) => n.check(Schema.isGreaterThan(0)))
 *
 * const getPositive = Optic.getAll(_pos)
 *
 * getPositive({ values: [3, -1, 5] }) // => [3, 5]
 *
 * getPositive({ values: [-1, -2] }) // => []
 * ```
 *
 * @see {@link Traversal} — the optic type this operates on
 *
 * @category getters
 * @since 4.0.0
 */
export const getAll: {
  <S, A>(traversal: Traversal<S, A>): (self: NoInfer<S>) => Array<A>
  <S, A>(self: NoInfer<S>, traversal: Traversal<S, A>): Array<A>
} = dual<
  <S, A>(traversal: Traversal<S, A>) => (self: NoInfer<S>) => Array<A>,
  <S, A>(self: NoInfer<S>, traversal: Traversal<S, A>) => Array<A>
>(2, (self, traversal) =>
  Result.match(traversal.getResult(self), {
    onFailure: () => [],
    onSuccess: (as) => [...as]
  }))

/**
 * Transforms every value focused by a `Traversal`.
 *
 * **When to use**
 *
 * Use when you want to update each value selected by a traversal.
 *
 * **Details**
 *
 * Supports both data-first and data-last forms. A failed traversal leaves the
 * source unchanged.
 *
 * @see {@link modify} for transforming the focus as a whole
 * @see {@link getAll} for reading every focused value
 *
 * @category transforming
 * @since 4.0.0
 */
export const modifyAll: {
  <S, A>(
    traversal: Traversal<S, A>,
    f: (value: NoInfer<A>) => NoInfer<A>
  ): (self: NoInfer<S>) => S
  <S, A>(
    self: NoInfer<S>,
    traversal: Traversal<S, A>,
    f: (value: NoInfer<A>) => NoInfer<A>
  ): S
} = dual<
  <S, A>(
    traversal: Traversal<S, A>,
    f: (value: NoInfer<A>) => NoInfer<A>
  ) => (self: NoInfer<S>) => S,
  <S, A>(
    self: NoInfer<S>,
    traversal: Traversal<S, A>,
    f: (value: NoInfer<A>) => NoInfer<A>
  ) => S
>(3, (self, traversal, f) => traversal.modifyAll(f)(self))

// ---------------------------------------------
// Built-in Optics
// ---------------------------------------------

const identityIso = make([])

/**
 * Iso that focuses on the whole value unchanged.
 *
 * **When to use**
 *
 * Use when you need to start an optic chain with a focus on the whole value.
 *
 * **Details**
 *
 * - `get(s)` returns `s`.
 * - `set(a)` returns `a`.
 * - Singleton — every call returns the same instance.
 *
 * **Example** (Starting an optic chain)
 *
 * ```ts import.meta.vitest
 * import { Optic } from "effect"
 *
 * type S = { readonly x: number }
 *
 * const _x = Optic.id<S>().key("x")
 *
 * _x.get({ x: 42 }) // => 42
 * ```
 *
 * @see {@link Iso} — the type this function returns
 *
 * @category constructors
 * @since 4.0.0
 */
export function id<S>(): Iso<S, S> {
  return identityIso
}

/**
 * Iso that converts a `Record<string, A>` to an array of
 * `[key, value]` entries and back.
 *
 * **When to use**
 *
 * Use when you want to traverse or manipulate record entries as an array (e.g.
 *   with `.forEach()`).
 *
 * **Details**
 *
 * - `get` uses `Object.entries`.
 * - `set` uses `Object.fromEntries`.
 * - Round-trip is lossless for `Record<string, A>`.
 *
 * **Example** (Traversing record values)
 *
 * ```ts import.meta.vitest
 * import { Optic, Schema } from "effect"
 *
 * const _positiveValues = Optic.entries<number>()
 *   .forEach((entry) => entry.key(1).check(Schema.isGreaterThan(0)))
 *
 * const inc = _positiveValues.modifyAll((n) => n + 1)
 *
 * inc({ a: 0, b: 3, c: -1 }) // => { a: 0, b: 4, c: -1 }
 * ```
 *
 * @see {@link Iso} — the type this function returns
 * @see {@link id} — identity iso
 *
 * @category constructors
 * @since 4.0.0
 */
export function entries<A>(): Iso<Record<string, A>, ReadonlyArray<readonly [string, A]>> {
  return make(primitiveNode("Iso", Object.entries, Object.fromEntries))
}

/**
 * Prism that focuses on the value inside `Option.Some`.
 *
 * **When to use**
 *
 * Use when you have an `Option<A>` and want to read/update the inner value only
 *   when it is `Some`.
 *
 * **Details**
 *
 * - `getResult` fails with a structured issue when the option is `None`.
 * - `set(a)` wraps `a` in `Option.some(a)`.
 *
 * **Example** (Accessing Some value)
 *
 * ```ts import.meta.vitest
 * import { Optic, Option, Result } from "effect"
 *
 * const _some = Optic.id<Option.Option<number>>().compose(Optic.some())
 *
 * _some.getResult(Option.some(42)) // => Result.succeed(42)
 *
 * Result.isFailure(_some.getResult(Option.none())) // => true
 *
 * _some.set(10) // => Option.some(10)
 * ```
 *
 * @see {@link none} — focuses on `None` instead
 * @see {@link Prism} — the type this function returns
 *
 * @category constructors
 * @since 4.0.0
 */
export function some<A>(): Prism<Option.Option<A>, A> {
  const run = runRefinement(Option.isSome, { expected: "a Some value" })
  return makePrism(
    (s) => Result.map(run(s), (s) => s.value),
    Option.some
  )
}

/**
 * Prism that focuses on `Option.None`, exposing `undefined`.
 *
 * **When to use**
 *
 * Use when you want to match or construct `None` values within an optic chain.
 *
 * **Details**
 *
 * - `getResult` succeeds with `undefined` when the option is `None`.
 * - `getResult` fails when the option is `Some`.
 * - `set(undefined)` produces `Option.none()`.
 *
 * **Example** (Matching None)
 *
 * ```ts import.meta.vitest
 * import { Optic, Option, Result } from "effect"
 *
 * const _none = Optic.id<Option.Option<number>>().compose(Optic.none())
 *
 * _none.getResult(Option.none()) // => Result.succeed(undefined)
 *
 * Result.isFailure(_none.getResult(Option.some(1))) // => true
 * ```
 *
 * @see {@link some} — focuses on `Some` instead
 * @see {@link Prism} — the type this function returns
 *
 * @category constructors
 * @since 4.0.0
 */
export function none<A>(): Prism<Option.Option<A>, undefined> {
  const run = runRefinement(Option.isNone, { expected: "a None value" })
  return makePrism(
    (s) => Result.map(run(s), () => undefined),
    () => Option.none()
  )
}

/**
 * Prism that focuses on the success value of a `Result`.
 *
 * **When to use**
 *
 * Use when you have a `Result<A, E>` and want to read/update `A` only when it
 *   is a `Success`.
 *
 * **Details**
 *
 * - `getResult` fails when the result is a `Failure`.
 * - `set(a)` produces `Result.succeed(a)`.
 *
 * **Example** (Accessing success)
 *
 * ```ts import.meta.vitest
 * import { Optic, Result } from "effect"
 *
 * const _ok = Optic.id<Result.Result<number, string>>().compose(Optic.success())
 *
 * _ok.getResult(Result.succeed(42)) // => Result.succeed(42)
 *
 * Result.isFailure(_ok.getResult(Result.fail("err"))) // => true
 * ```
 *
 * @see {@link failure} — focuses on the failure side
 * @see {@link Prism} — the type this function returns
 *
 * @category constructors
 * @since 4.0.0
 */
export function success<A, E>(): Prism<Result.Result<A, E>, A> {
  const run = runRefinement(Result.isSuccess, { expected: "a Result.Success value" })
  return makePrism(
    (s) => Result.map(run(s), (s) => s.success),
    Result.succeed
  )
}

/**
 * Prism that focuses on the failure value of a `Result`.
 *
 * **When to use**
 *
 * Use when you have a `Result<A, E>` and want to read/update `E` only when it
 *   is a `Failure`.
 *
 * **Details**
 *
 * - `getResult` fails when the result is a `Success`.
 * - `set(e)` produces `Result.fail(e)`.
 *
 * **Example** (Accessing failure)
 *
 * ```ts import.meta.vitest
 * import { Optic, Result } from "effect"
 *
 * const _err = Optic.id<Result.Result<number, string>>().compose(Optic.failure())
 *
 * _err.getResult(Result.fail("oops")) // => Result.succeed("oops")
 *
 * Result.isFailure(_err.getResult(Result.succeed(42))) // => true
 * ```
 *
 * @see {@link success} — focuses on the success side
 * @see {@link Prism} — the type this function returns
 *
 * @category constructors
 * @since 4.0.0
 */
export function failure<A, E>(): Prism<Result.Result<A, E>, E> {
  const run = runRefinement(Result.isFailure, { expected: "a Result.Failure value" })
  return makePrism(
    (s) => Result.map(run(s), (s) => s.failure),
    Result.fail
  )
}

function runRefinement<T extends E, E>(
  refinement: (e: E) => e is T,
  annotations?: Schema.Annotations.Filter
): (e: E) => Result.Result<T, SchemaIssue.Issue> {
  return (e) => SchemaAST.runChecks([SchemaAST.makeFilterByGuard(refinement, annotations)], e) as any
}
