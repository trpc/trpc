/**
 * @since 4.0.0
 */

import * as Arbitrary from "effect/Arbitrary"
import * as Cause from "effect/Cause"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { constVoid, flow, pipe } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"
import type * as Schema from "effect/Schema"
import * as Scope from "effect/Scope"
import * as TestClock from "effect/testing/TestClock"
import * as TestConsole from "effect/testing/TestConsole"
import * as V from "vitest"
import type * as Vitest from "../index.ts"

const getCurrentSuite = V.TestRunner.getCurrentSuite

const runPromise: <E, A>(
  _: Effect.Effect<A, E, never>,
  ctx?: Pick<V.TestContext, "signal"> | undefined
) => Promise<A> = Effect.fnUntraced(function*<E, A>(
  effect: Effect.Effect<A, E>,
  _ctx?: Pick<Vitest.TestContext, "signal">
) {
  const exit = yield* Effect.exit(effect)
  if (Exit.isFailure(exit)) {
    const errors = Cause.prettyErrors(exit.cause)
    for (let i = 0; i < errors.length; i++) {
      yield* Effect.logError(errors[i])
    }
  }
  return yield* exit
}, (effect, _, ctx) => Effect.runPromise(effect, { signal: ctx?.signal }))

/** @internal */
const runTest = (ctx?: Vitest.TestContext) => <E, A>(effect: Effect.Effect<A, E>) => {
  const promise = runPromise(effect, ctx)
  if (ctx) {
    // Vitest stops awaiting the test promise once the signal aborts (timeout or
    // cancellation), so only then add a hook that waits for the finalizers.
    // Registering it unconditionally would change the teardown of every test.
    const onAbort = () => ctx.onTestFinished(() => promise.then(constVoid, constVoid))
    ctx.signal.addEventListener("abort", onAbort, { once: true })
    const cleanup = () => ctx.signal.removeEventListener("abort", onAbort)
    promise.then(cleanup, cleanup)
    // A retry after a timed-out attempt reuses the aborted signal, so no event fires.
    if (ctx.signal.aborted) onAbort()
  }
  return promise
}

/** @internal */
export type TestContext = TestConsole.TestConsole | TestClock.TestClock

const TestEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer())

/** @internal */
export const addEqualityTesters = () => {
  V.expect.addEqualityTesters([])
}

/** @internal */
const testOptions = (timeout?: number | V.TestOptions) => typeof timeout === "number" ? { timeout } : timeout ?? {}

const hookTimeout = (timeout?: Duration.Input) =>
  timeout === undefined ? undefined : Duration.toMillis(Duration.fromInputUnsafe(timeout))

type PropertyTimeout =
  | number
  | V.TestOptions & {
    readonly arbitrary?: Arbitrary.CheckOptions | undefined
  }

type ArbitraryInput = Schema.Schema<any> | Arbitrary.Arbitrary<unknown>

type Arbitraries = Array<ArbitraryInput> | { [K in string]: ArbitraryInput }

const propertyTestOptions = (
  timeout: PropertyTimeout | undefined
): Exclude<PropertyTimeout, number> | undefined => typeof timeout === "number" ? undefined : timeout

const checkOptions = (timeout: PropertyTimeout | undefined): Arbitrary.CheckOptions | undefined =>
  propertyTestOptions(timeout)?.arbitrary

const compileArbitraryInput = (input: ArbitraryInput): Arbitrary.Arbitrary<any> =>
  Arbitrary.isArbitrary(input) ? input : Arbitrary.schema(input)

const makeArbitrary = (arbitraries: Arbitraries): Arbitrary.Arbitrary<any> =>
  Arbitrary.all(
    Array.isArray(arbitraries)
      ? arbitraries.map(compileArbitraryInput)
      : Object.fromEntries(Object.entries(arbitraries).map(([key, input]) => [key, compileArbitraryInput(input)]))
  )

const normalizeProperty = <A, E, R>(
  property: (value: A) => boolean | Effect.Effect<boolean, E, R>,
  value: A
): Effect.Effect<boolean, E | Cause.Cause<E>, R> =>
  Effect.catchCause(
    Effect.suspend(() => {
      const output = property(value)
      return Effect.isEffect(output) ? output : Effect.succeed(output)
    }),
    (cause): Effect.Effect<never, E | Cause.Cause<E>> =>
      Cause.hasInterrupts(cause) ? Effect.failCause(cause) : Effect.fail(cause)
  )

const runCheck = <A, E>(
  ctx: V.TestContext,
  arbitrary: Arbitrary.Arbitrary<A>,
  property: (value: A) => boolean | Effect.Effect<boolean, E>,
  options: Arbitrary.CheckOptions | undefined
): Promise<void> =>
  runTest(ctx)(
    Effect.flatMapEager(
      Arbitrary.checkEffect(arbitrary, (value) => normalizeProperty(property, value), options),
      (result) => {
        const failure = Arbitrary.formatCheckFailure(result)
        return failure === undefined ? Effect.void : Effect.die(new Error(failure))
      }
    )
  )

// Vitest decides which fixtures to set up by parsing the source of a test
// function's context parameter, and there is no public API to supply the names
// for a wrapper, so wrappers expose the source of the function they call.
const withFixturesOf = <F extends Function>(source: Function, f: F): F =>
  Object.defineProperty(f, "toString", { value: () => source.toString() })

const makeItProxy = <Methods extends object, ExtraContext>(
  it: V.TestAPI<ExtraContext>,
  overrides: Methods
): Methods & V.TestAPI<ExtraContext> =>
  new Proxy(it as Methods & V.TestAPI<ExtraContext>, {
    apply(target, thisArg, argArray) {
      return Reflect.apply(target, thisArg, argArray)
    },
    get(target, property, receiver) {
      if (Object.hasOwn(overrides, property)) {
        return Reflect.get(overrides, property)
      }
      // do not bind: binding would strip vitest's static helpers (e.g. `describe.each`)
      return Reflect.get(target, property, receiver)
    }
  })

type CollectedTask = {
  readonly type: string
  readonly mode?: string
  readonly tasks?: ReadonlyArray<CollectedTask>
}

const collectTasks = (tasks: ReadonlyArray<CollectedTask>, acc: Array<V.TestContext["task"]> = []) => {
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]
    if (task.type === "test" && task.mode !== "skip" && task.mode !== "todo") {
      acc.push(task as V.TestContext["task"])
    } else if (task.tasks !== undefined) {
      collectTasks(task.tasks, acc)
    }
  }
  return acc
}

const registerProp = <ExtraContext, A>(
  it: V.TestAPI<ExtraContext>,
  name: string,
  arbitraries: Arbitraries,
  property: (values: A, ctx: V.TestContext) => boolean | Effect.Effect<boolean, unknown>,
  timeout: PropertyTimeout | undefined
) => {
  const arbitrary = makeArbitrary(arbitraries)
  // Property callbacks receive only the base context; the empty source requests no fixtures.
  it(
    name,
    testOptions(timeout),
    withFixturesOf(
      () => {},
      (ctx: V.TestContext) => runCheck(ctx, arbitrary, (values) => property(values, ctx), checkOptions(timeout))
    )
  )
}

const makeTester = <R, ExtraContext>(
  mapEffect: <A, E>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, never>,
  it: V.TestAPI<ExtraContext>
): Vitest.Vitest.Tester<R, ExtraContext> => {
  const run = <A, E, TestArgs extends Array<unknown>>(
    ctx: V.TestContext,
    args: TestArgs,
    self: Vitest.Vitest.TestFunction<A, E, R, TestArgs>
  ) => pipe(Effect.suspend(() => self(...args)), mapEffect, runTest(ctx))

  const register = (
    test: (name: string, options: V.TestOptions, fn: V.TestFunction<ExtraContext>) => void
  ): Vitest.Vitest.Test<R, ExtraContext> =>
  (name, self, timeout) => test(name, testOptions(timeout), withFixturesOf(self, (ctx) => run(ctx, [ctx], self)))

  const each: Vitest.Vitest.Tester<R, ExtraContext>["each"] = (cases) => (name, self, timeout) =>
    it.for(cases)(
      name,
      testOptions(timeout),
      withFixturesOf(self, (args, ctx) => run(ctx, [args, ctx], self).then(constVoid))
    )

  const prop: Vitest.Vitest.Tester<R, ExtraContext>["prop"] = (name, arbitraries, self, timeout) =>
    registerProp(
      it,
      name,
      arbitraries,
      (values, ctx) =>
        Effect.mapEager(
          mapEffect(Effect.suspend(() => self(values as any, ctx))),
          (value) => (value as unknown) !== false
        ),
      timeout
    )

  return Object.assign(register(it), {
    skip: register(it.skip),
    skipIf: (condition: unknown) => register(it.skipIf(condition)),
    runIf: (condition: unknown) => register(it.runIf(condition)),
    only: register(it.only),
    each,
    fails: register(it.fails),
    prop
  })
}

const makeProp =
  <ExtraContext>(it: V.TestAPI<ExtraContext>): Vitest.Vitest.Methods["prop"] => (name, arbitraries, self, timeout) =>
    registerProp(it, name, arbitraries, (values, ctx) => (self(values as any, ctx) as unknown) !== false, timeout)

const makeLayer = <ExtraContext>(it: V.TestAPI<ExtraContext>) =>
<R, E>(
  layer_: Layer.Layer<R, E>,
  options?: {
    readonly concurrent?: boolean
    readonly memoMap?: Layer.MemoMap
    readonly timeout?: Duration.Input
    readonly excludeTestServices?: boolean
  }
): {
  (f: (it: Vitest.Vitest.MethodsNonLive<R, ExtraContext>) => void): void
  (
    name: string,
    f: (it: Vitest.Vitest.MethodsNonLive<R, ExtraContext>) => void
  ): void
} =>
(
  ...args: [
    name: string,
    f: (
      it: Vitest.Vitest.MethodsNonLive<R, ExtraContext>
    ) => void
  ] | [
    f: (it: Vitest.Vitest.MethodsNonLive<R, ExtraContext>) => void
  ]
) => {
  const excludeTestServices = options?.excludeTestServices ?? false
  const withTestEnv = excludeTestServices
    ? layer_ as Layer.Layer<R, E>
    : Layer.provideMerge(layer_, TestEnv)
  const memoMap = options?.memoMap ?? Effect.runSync(Layer.makeMemoMap)
  const scope = Effect.runSync(Scope.make())
  const contextEffect = Layer.buildWithMemoMap(withTestEnv, memoMap, scope).pipe(
    Effect.orDie,
    Effect.cached,
    Effect.runSync
  )
  let closed = false
  const closeScope = () => {
    if (closed) {
      return Promise.resolve()
    }
    closed = true
    // Layer cleanup must outlive the last test's already-aborted signal.
    return runPromise(Scope.close(scope, Exit.void))
  }

  const methods: Vitest.Vitest.MethodsNonLive<R, ExtraContext> = makeItProxy(it, {
    effect: makeTester<R | Scope.Scope, ExtraContext>(
      (effect) =>
        Effect.flatMap(contextEffect, (context) =>
          effect.pipe(
            Effect.scoped,
            Effect.provide(context)
          )),
      it
    ),
    prop: makeProp<ExtraContext>(it),
    flakyTest,
    layer<R2, E2>(nestedLayer: Layer.Layer<R2, E2, R>, options?: {
      readonly concurrent?: boolean
      readonly timeout?: Duration.Input
    }) {
      return makeLayer(it)(Layer.provideMerge(nestedLayer, withTestEnv), {
        ...options,
        memoMap: Layer.forkMemoMapUnsafe(memoMap),
        excludeTestServices
      })
    }
  })

  if (args.length === 1) {
    const currentSuite = getCurrentSuite()
    const previousTasks = new Set(currentSuite.tasks)

    args[0](methods)

    const blockTasks = collectTasks(
      currentSuite.tasks.filter((task) => !previousTasks.has(task)) as ReadonlyArray<CollectedTask>
    )
    if (blockTasks.length === 0) {
      V.afterAll(() => closeScope(), hookTimeout(options?.timeout))
      return
    }

    const blockTaskSet = new Set(blockTasks)
    let remaining = blockTasks.length

    V.beforeEach(
      // Destructured so Vitest can parse the hook once the suite defines fixtures.
      ({ onTestFinished, signal, task }) => {
        if (!blockTaskSet.has(task)) {
          return
        }
        onTestFinished(() => {
          remaining--
          if (remaining === 0) {
            return closeScope()
          }
        })
        return runPromise(Effect.asVoid(contextEffect), { signal })
      },
      hookTimeout(options?.timeout)
    )
    V.afterAll(() => closeScope(), hookTimeout(options?.timeout))
    return
  }

  const suiteOptions = options?.concurrent === undefined ? {} : { concurrent: options.concurrent }
  return V.describe(args[0], suiteOptions, () => {
    V.beforeAll(
      () => runPromise(Effect.asVoid(contextEffect)),
      hookTimeout(options?.timeout)
    )
    V.afterAll(
      () => closeScope(),
      hookTimeout(options?.timeout)
    )
    return args[1](methods)
  })
}

/** @internal */
export const flakyTest = <A, E, R>(
  self: Effect.Effect<A, E, R | Scope.Scope>,
  timeout: Duration.Input = Duration.seconds(30)
) =>
  pipe(
    self,
    Effect.scoped,
    Effect.sandbox,
    Effect.retry(
      pipe(
        Schedule.recurs(10),
        Schedule.while((_) =>
          Effect.succeed(Duration.isLessThanOrEqualTo(
            Duration.fromInputUnsafe(_.elapsed),
            Duration.fromInputUnsafe(timeout)
          ))
        )
      )
    ),
    Effect.orDie
  )

/** @internal */
export const makeMethods = <ExtraContext>(it: V.TestAPI<ExtraContext>): Vitest.Vitest.Methods<never, ExtraContext> =>
  makeItProxy(it, {
    effect: makeTester<Scope.Scope, ExtraContext>(flow(Effect.scoped, Effect.provide(TestEnv)), it),
    live: makeTester<Scope.Scope, ExtraContext>(Effect.scoped, it),
    flakyTest,
    layer: makeLayer<ExtraContext>(it),
    prop: makeProp<ExtraContext>(it)
  })

/** @internal */
export const it = makeMethods(V.it)

/** @internal */
export const {
  /** @internal */
  effect,
  /** @internal */
  layer,
  /** @internal */
  live,
  /** @internal */
  prop
} = it

/** @internal */
export const describeWrapped = (name: string, f: (it: Vitest.Vitest.Methods) => void): V.SuiteCollector =>
  V.describe(name, () => f(it))
