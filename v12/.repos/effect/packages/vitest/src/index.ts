/**
 * Vitest integration for scoped Effect tests, shared layers, and property tests.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as Arbitrary from "effect/Arbitrary"
import type * as Duration from "effect/Duration"
import type * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import type * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import type * as V from "vitest"
import * as internal from "./internal/internal.ts"

/**
 * Re-exports the `vitest` API unchanged.
 *
 * @stability unstable
 * @since 4.0.0
 */
export * from "vitest"

/**
 * Vitest test API without additional fixtures.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type API = V.TestAPI<{}>

/**
 * Types for Effect-aware Vitest tests and helpers.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace Vitest {
  /**
   * An Effect-returning test callback with the specified arguments.
   *
   * @since 4.0.0
   */
  export interface TestFunction<A, E, R, TestArgs extends Array<any>> {
    (...args: TestArgs): Effect.Effect<A, E, R>
  }

  /**
   * Registers an Effect test with a name and optional Vitest options.
   *
   * @since 4.0.0
   */
  export interface Test<R, ExtraContext = {}> {
    <A, E>(
      name: string,
      self: TestFunction<A, E, R, [V.TestContext & ExtraContext]>,
      timeout?: number | V.TestOptions
    ): void
  }

  /**
   * Schema or Arbitrary inputs for tuple-based or keyed property tests.
   *
   * @since 4.0.0
   */
  export type Arbitraries =
    | Array<Schema.Schema<any> | Arbitrary.Arbitrary<any>>
    | { [K in string]: Schema.Schema<any> | Arbitrary.Arbitrary<any> }

  type ArbitraryValue<A> = A extends Schema.Schema<infer T> ? T
    : A extends Arbitrary.Arbitrary<infer T> ? T
    : never

  /**
   * Effect test registration API with modifiers and property testing.
   *
   * @since 4.0.0
   */
  export interface Tester<R, ExtraContext = {}> extends Vitest.Test<R, ExtraContext> {
    skip: Vitest.Test<R, ExtraContext>
    skipIf: (condition: unknown) => Vitest.Test<R, ExtraContext>
    runIf: (condition: unknown) => Vitest.Test<R, ExtraContext>
    only: Vitest.Test<R, ExtraContext>
    each: <T>(
      cases: ReadonlyArray<T>
    ) => <A, E>(
      name: string,
      self: TestFunction<A, E, R, [T, V.TestContext & ExtraContext]>,
      timeout?: number | V.TestOptions
    ) => void
    fails: Vitest.Test<R, ExtraContext>

    /**
     * Runs an Effectful property test using Schema or Arbitrary inputs.
     *
     * **Details**
     *
     * Returning `false` or completing with any non-interruption failure falsifies the property and triggers shrinking.
     * This includes typed Effect failures, thrown exceptions, and defects such as failed assertions. Effect
     * interruption continues to interrupt the test.
     *
     * The Vitest timeout interrupts the Effect fiber running generation, property evaluation, and shrinking. Effect
     * finalizers run during that interruption.
     *
     * **Gotchas**
     *
     * A timeout cannot preempt a synchronous JavaScript callback that does not return.
     *
     * @since 4.0.0
     */
    prop: <const Arbs extends Arbitraries, A, E>(
      name: string,
      arbitraries: Arbs,
      self: TestFunction<
        A,
        E,
        R,
        [
          {
            [K in keyof Arbs]: ArbitraryValue<Arbs[K]>
          },
          V.TestContext
        ]
      >,
      timeout?:
        | number
        | V.TestOptions & {
          arbitrary?: Arbitrary.CheckOptions
        }
    ) => void
  }

  /**
   * Vitest test helpers with test services and shared layers.
   *
   * @since 4.0.0
   */
  export interface MethodsNonLive<R = never, ExtraContext = {}> extends V.TestAPI<ExtraContext> {
    readonly effect: Vitest.Tester<R | Scope.Scope, ExtraContext>
    readonly flakyTest: <A, E, R2>(
      self: Effect.Effect<A, E, R2 | Scope.Scope>,
      timeout?: Duration.Input
    ) => Effect.Effect<A, never, R2>
    readonly layer: <R2, E>(layer: Layer.Layer<R2, E, R>, options?: {
      readonly concurrent?: boolean
      readonly timeout?: Duration.Input
      readonly buildPerTest?: boolean
    }) => {
      (f: (it: Vitest.MethodsNonLive<R | R2, ExtraContext>) => void): void
      (
        name: string,
        f: (it: Vitest.MethodsNonLive<R | R2, ExtraContext>) => void
      ): void
    }

    /**
     * Runs a synchronous property test using Schema or Arbitrary inputs.
     *
     * **Details**
     *
     * Returning `false` or throwing falsifies the property and triggers shrinking. Returning `true` or `undefined`
     * passes for that generated input. Other return values are rejected; use `it.effect.prop` for Effect callbacks.
     *
     * The Vitest timeout interrupts the Effect fiber running generation and shrinking.
     *
     * **Gotchas**
     *
     * A timeout cannot preempt a synchronous JavaScript callback that does not return.
     *
     * @since 4.0.0
     */
    readonly prop: <const Arbs extends Arbitraries>(
      name: string,
      arbitraries: Arbs,
      self: (
        properties: {
          [K in keyof Arbs]: ArbitraryValue<Arbs[K]>
        },
        ctx: V.TestContext
      ) => boolean | void,
      timeout?:
        | number
        | V.TestOptions & {
          arbitrary?: Arbitrary.CheckOptions
        }
    ) => void
  }

  /**
   * Vitest test helpers including live-service tests and shared layers.
   *
   * @since 4.0.0
   */
  export interface Methods<R = never, ExtraContext = {}> extends MethodsNonLive<R, ExtraContext> {
    readonly live: Vitest.Tester<Scope.Scope | R, ExtraContext>
    readonly layer: <R2, E>(layer: Layer.Layer<R2, E, R>, options?: {
      readonly concurrent?: boolean
      readonly memoMap?: Layer.MemoMap
      readonly timeout?: Duration.Input
      readonly excludeTestServices?: boolean
      readonly buildPerTest?: boolean
    }) => {
      (f: (it: Vitest.MethodsNonLive<R | R2, ExtraContext>) => void): void
      (
        name: string,
        f: (it: Vitest.MethodsNonLive<R | R2, ExtraContext>) => void
      ): void
    }
  }
}

/**
 * Invokes the Effect Vitest equality-tester registration hook.
 *
 * @stability unstable
 * @category utils
 * @since 4.0.0
 */
export const addEqualityTesters: () => void = internal.addEqualityTesters

/**
 * Registers a callback to run once before all tests in the current suite. If
 * the callback returns an `Effect`, it is run and awaited with a `Scope` that
 * closes in a cleanup after the suite's `afterAll` hooks, within the hook's
 * timeout. The `Effect` must not require any other services.
 *
 * **Details**
 *
 * If Vitest stops waiting for the setup, the setup is interrupted before the
 * `Scope` closes. As with any `beforeAll` cleanup, Vitest reports a closing
 * that exceeds the hook's timeout and does not wait for it.
 *
 * @stability unstable
 * @category hooks
 * @since 4.0.0
 */
export const beforeAll: typeof V.beforeAll = internal.beforeAll

/**
 * Registers a callback to run before each test in the current suite. If the
 * callback returns an `Effect`, it is run and awaited with a `Scope` that
 * closes when the test finishes, and interrupted if the hook times out. The
 * `Effect` must not require any other services.
 *
 * @stability unstable
 * @category hooks
 * @since 4.0.0
 */
export const beforeEach: typeof V.beforeEach = internal.beforeEach

/**
 * Runs a scoped Effect test with test clock and console services.
 *
 * @stability unstable
 * @category testing
 * @since 4.0.0
 */
export const effect: Vitest.Tester<Scope.Scope> = internal.effect

/**
 * Runs a scoped Effect test with live services.
 *
 * @stability unstable
 * @category testing
 * @since 4.0.0
 */
export const live: Vitest.Tester<Scope.Scope> = internal.live

/**
 * Share a `Layer` between multiple tests, optionally wrapping
 * the tests in a `describe` block if a name is provided.
 *
 * **Details**
 *
 * Named layers accept `concurrent` to override inherited suite concurrency.
 * Anonymous layers always inherit the enclosing suite's concurrency.
 * Use `ctx.expect` in concurrent tests for test-local snapshots and assertion counts.
 *
 * Pass `buildPerTest: true` to build the layer once per test instead of once
 * per block. Each test gets new services, released when the test finishes,
 * while services from an enclosing `layer` block stay shared. A build failure
 * fails only that test. Blocks nested inside a per-test block are built per
 * test as well. `timeout` has no effect on a per-test block, since the test's
 * own timeout covers the build.
 *
 * **Example** (Sharing layers between tests)
 *
 * ```ts
 * import { assert, layer } from "@effect/vitest"
 * import { Effect, Layer, Context } from "effect"
 *
 * class Foo extends Context.Service<Foo, "foo">()("Foo") {
 *   static layer = Layer.succeed(Foo, "foo")
 * }
 *
 * class Bar extends Context.Service<Bar, "bar">()("Bar") {
 *   static layer = Layer.effect(
 *     Bar,
 *     Effect.map(Foo, () => "bar" as const)
 *   )
 * }
 *
 * layer(Foo.layer)("layer", (it) => {
 *   it.effect("adds context", () =>
 *     Effect.gen(function*() {
 *       const foo = yield* Foo
 *       assert.strictEqual(foo, "foo")
 *     }))
 *
 *   it.layer(Bar.layer)("nested", (it) => {
 *     it.effect("adds context", () =>
 *       Effect.gen(function*() {
 *         const foo = yield* Foo
 *         const bar = yield* Bar
 *         assert.strictEqual(foo, "foo")
 *         assert.strictEqual(bar, "bar")
 *       }))
 *   })
 * })
 * ```
 *
 * **Example** (Building a layer for each test)
 *
 * ```ts
 * import { assert, layer } from "@effect/vitest"
 * import { Effect, Layer, Context, Ref } from "effect"
 *
 * class Database extends Context.Service<Database, "database">()("Database") {
 *   static layer = Layer.succeed(Database, "database")
 * }
 *
 * class Cache extends Context.Service<Cache, Ref.Ref<Array<string>>>()("Cache") {
 *   static layer = Layer.effect(
 *     Cache,
 *     Effect.andThen(Database, Ref.make<Array<string>>([]))
 *   )
 * }
 *
 * layer(Database.layer)("repository", (it) => {
 *   // Database is shared, Cache is built for each test
 *   it.layer(Cache.layer, { buildPerTest: true })((it) => {
 *     it.effect("writes to the cache", () =>
 *       Effect.gen(function*() {
 *         const cache = yield* Cache
 *         yield* Ref.update(cache, (keys) => [...keys, "a"])
 *         assert.deepStrictEqual(yield* Ref.get(cache), ["a"])
 *       }))
 *
 *     it.effect("starts with an empty cache", () =>
 *       Effect.gen(function*() {
 *         const cache = yield* Cache
 *         assert.deepStrictEqual(yield* Ref.get(cache), [])
 *       }))
 *   })
 * })
 * ```
 *
 * @stability unstable
 * @category testing
 * @since 4.0.0
 */
export const layer: <R, E>(
  layer_: Layer.Layer<R, E>,
  options?: {
    readonly concurrent?: boolean
    readonly memoMap?: Layer.MemoMap
    readonly timeout?: Duration.Input
    readonly excludeTestServices?: boolean
    readonly buildPerTest?: boolean
  }
) => {
  (f: (it: Vitest.MethodsNonLive<R>) => void): void
  (name: string, f: (it: Vitest.MethodsNonLive<R>) => void): void
} = internal.layer

/**
 * Retries a scoped Effect to tolerate intermittent test failures, dying on exhausted retries.
 *
 * @stability unstable
 * @category testing
 * @since 4.0.0
 */
export const flakyTest: <A, E, R>(
  self: Effect.Effect<A, E, R | Scope.Scope>,
  timeout?: Duration.Input
) => Effect.Effect<A, never, R> = internal.flakyTest

/**
 * Runs a synchronous property test using schemas or arbitraries.
 *
 * @stability unstable
 * @category testing
 * @since 4.0.0
 */
export const prop: Vitest.Methods["prop"] = internal.prop

/**
 * Vitest test API extended with Effect test helpers.
 *
 * @stability unstable
 * @category testing
 * @since 4.0.0
 */
export const it: Vitest.Methods = internal.it

/**
 * Creates the Effect test helpers for a Vitest test API, such as one extended with fixtures.
 *
 * **Details**
 *
 * Tests receive the fixtures they destructure from their context. Vitest sets them up before the test and tears
 * them down after the test's scope closes, as it does for its own tests. `it.effect.each` passes the context
 * after the test case, and named and anonymous `it.layer` blocks keep the fixtures.
 *
 * **Gotchas**
 *
 * Vitest reads the destructured names to decide which fixtures to set up. Once any fixture is defined, a test that
 * takes the whole context as a plain parameter, such as `(ctx) =>`, fails with a `FixtureParseError`. Property
 * tests receive only the base test context and cannot request fixtures; auto fixtures still run.
 *
 * **Example** (Using a Vitest fixture in an Effect test)
 *
 * ```ts
 * import { assert, makeMethods, test } from "@effect/vitest"
 * import { Effect } from "effect"
 *
 * const it = makeMethods(
 *   test.extend("config", { scope: "file" }, () => ({ port: 3000 }))
 * )
 *
 * it.effect("reads the config fixture", ({ config }) =>
 *   Effect.sync(() => {
 *     assert.strictEqual(config.port, 3000)
 *   }))
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeMethods: <ExtraContext>(it: V.TestAPI<ExtraContext>) => Vitest.Methods<never, ExtraContext> =
  internal.makeMethods

/**
 * Creates a named Vitest suite whose callback receives Effect test helpers.
 *
 * @stability unstable
 * @category testing
 * @since 4.0.0
 */
export const describeWrapped: (name: string, f: (it: Vitest.Methods) => void) => V.SuiteCollector =
  internal.describeWrapped
