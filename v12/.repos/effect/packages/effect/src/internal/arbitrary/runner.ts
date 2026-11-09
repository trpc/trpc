import type {
  Arbitrary,
  ArrayOptions,
  CheckOptions,
  CheckResult,
  Exhausted,
  GlobalOptions,
  Passed,
  PropertyError,
  PropertyFailure,
  Replay,
  ReturnedFalse,
  SampleError,
  SampleOptions,
  SchemaOptions
} from "../../Arbitrary.ts"
import * as Effect from "../../Effect.ts"
import * as Fiber from "../../Fiber.ts"
import * as Option from "../../Option.ts"
import { pipeArguments } from "../../Pipeable.ts"
import * as Queue from "../../Queue.ts"
import * as Random from "../../Random.ts"
import type * as Result from "../../Result.ts"
import * as Scheduler from "../../Scheduler.ts"
import type * as Schema from "../../Schema.ts"
import * as Scope from "../../Scope.ts"
import * as Semaphore from "../../Semaphore.ts"
import { done } from "../core.ts"
import * as InternalRecord from "../record.ts"
import * as Arrays from "./array.ts"
import * as Model from "./model.ts"
import * as Compiler from "./schema.ts"

/** @internal */
export const TypeId = "~effect/arbitrary/Arbitrary"

let globalOptions: GlobalOptions = {}

export const configureGlobal = (options: GlobalOptions) => {
  globalOptions = { check: { ...options.check }, sample: { ...options.sample } }
}

type FailureTag = PropertyFailure<unknown>["_tag"]

interface ReplayData {
  readonly seed: string | number
  readonly attempt: number
  readonly size: number
  readonly path: ReadonlyArray<number>
  readonly failureTag: FailureTag
}

const ArbitraryProto = {
  [TypeId]: TypeId,
  pipe() {
    return pipeArguments(this, arguments)
  }
}

function make<A>(generator: Model.Generator<A>): Arbitrary<A> {
  return Object.create(ArbitraryProto, {
    gen: { value: generator }
  })
}

function makeReplay(data: ReplayData): Replay {
  return JSON.stringify([
    typeof data.seed === "number" ? 0 : 1,
    globalThis.String(data.seed),
    data.attempt,
    data.size,
    data.path,
    data.failureTag
  ])
}

function replayData(replay: Replay): ReplayData {
  const encoded = JSON.parse(replay) as [0 | 1, string, number, number, ReadonlyArray<number>, FailureTag]
  return {
    seed: encoded[0] === 0 ? globalThis.Number(encoded[1]) : encoded[1],
    attempt: encoded[2],
    size: encoded[3],
    path: encoded[4],
    failureTag: encoded[5]
  }
}

function natural(value: number | undefined, fallback: number, label: string): number {
  const out = value ?? fallback
  if (!Number.isSafeInteger(out) || out < 0) throw new Error(`${label} must be a non-negative safe integer`)
  return out
}

function positive(value: number | undefined, fallback: number, label: string): number {
  const out = natural(value, fallback, label)
  if (out === 0) throw new Error(`${label} must be greater than zero`)
  return out
}

interface SeedState {
  readonly first: number
  readonly second: number
}

function mix32(value: number): number {
  // MurmurHash3 fmix32 by Austin Appleby, dedicated to the public domain.
  value ^= value >>> 16
  value = Math.imul(value, 0x85ebca6b)
  value ^= value >>> 13
  value = Math.imul(value, 0xc2b2ae35)
  return (value ^ value >>> 16) >>> 0
}

function hashSeed(seed: string | number): SeedState {
  const value = `${typeof seed}:${seed}`
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code ^ index, 0x85ebca6b)
  }
  return {
    first: mix32(first),
    second: mix32(second ^ value.length)
  }
}

function rotateLeft(value: number, shift: number): number {
  return (value << shift | value >>> (32 - shift)) >>> 0
}

function makeGenerationRandom(
  initialState0: number,
  initialState1: number,
  initialState2: number,
  initialState3: number
): Model.GenerationRandom {
  let state0 = initialState0
  let state1 = initialState1
  let state2 = initialState2
  let state3 = initialState3
  // xoshiro128** 1.1 by David Blackman and Sebastiano Vigna, dedicated to the public domain.
  // https://prng.di.unimi.it/xoshiro128starstar.c
  const nextUint32 = () => {
    const result = Math.imul(rotateLeft(Math.imul(state1, 5), 7), 9) >>> 0
    const temporary = state1 << 9
    state2 ^= state0
    state3 ^= state1
    state1 ^= state2
    state0 ^= state3
    state2 ^= temporary
    state3 = rotateLeft(state3, 11)
    return result
  }
  const nextDoubleUnsafe = () => {
    const high = nextUint32() >>> 5
    const low = nextUint32() >>> 6
    return (high * 0x4000000 + low) / 0x20000000000000
  }
  return {
    nextUint32,
    nextDoubleUnsafe,
    clone: () => makeGenerationRandom(state0, state1, state2, state3),
    copyFrom: (source) => {
      const snapshot = source.snapshot()
      state0 = snapshot[0]
      state1 = snapshot[1]
      state2 = snapshot[2]
      state3 = snapshot[3]
    },
    snapshot: () => [state0, state1, state2, state3]
  }
}

function makeAttemptRandom(seed: SeedState, attempt: number): Model.GenerationRandom {
  // This provides the same per-run isolation targeted by fast-check v4.9.0's jump-before-toss strategy (MIT), while
  // deriving the attempt state directly so replay can jump to it without executing preceding attempts.
  // https://github.com/dubzzz/fast-check/blob/v4.9.0/packages/fast-check/src/check/runner/Tosser.ts
  const attemptLow = attempt >>> 0
  const attemptHigh = Math.floor(attempt / 0x100000000) >>> 0
  let state0 = mix32(seed.first ^ attemptLow ^ Math.imul(attemptHigh, 0x9e3779b9))
  const state1 = mix32(seed.second ^ attemptHigh ^ Math.imul(attemptLow, 0x85ebca6b))
  const state2 = mix32(seed.first ^ attemptHigh ^ Math.imul(attemptLow, 0xc2b2ae35) ^ 0x243f6a88)
  const state3 = mix32(seed.second ^ attemptLow ^ Math.imul(attemptHigh, 0x27d4eb2f) ^ 0xb7e15162)
  if ((state0 | state1 | state2 | state3) === 0) state0 = 0x9e3779b9
  return makeGenerationRandom(state0, state1, state2, state3)
}

const generateAttemptRaw = <A>(
  generator: Model.Generator<A>,
  seed: SeedState,
  attempt: number,
  size: number,
  shrinks: boolean
): Model.Generation<A> => {
  const biasFactor = 2 + Math.floor(Math.log10(attempt + 1))
  return generator.generate({
    size,
    shrinks,
    // This is fast-check v4.9.0's run-dependent numeric bias schedule (MIT). It makes short checks edge-heavy while
    // progressively dedicating more attempts to the complete domain, without becoming part of the public API.
    // https://github.com/dubzzz/fast-check/blob/v4.9.0/packages/fast-check/src/check/property/IRawProperty.ts#L92-L95
    biasFactor,
    nullPrototype: (attempt + 1) % (biasFactor * 4) === 0,
    random: makeAttemptRandom(seed, attempt),
    budget: { remaining: generator.minCost + size }
  })
}

const generateAttempt = <A>(
  generator: Model.Generator<A>,
  seed: SeedState,
  attempt: number,
  size: number,
  shrinks: boolean
): Effect.Effect<Model.Attempt<A>> =>
  Model.toEffectGeneration(generateAttemptRaw(generator, seed, attempt, size, shrinks))

const resolveMasterSeed = (seed: string | number | undefined): Effect.Effect<string | number> =>
  seed === undefined ? Random.nextInt : Effect.succeed(seed)

/** @internal */
export function schema<S extends Schema.Constraint>(
  schema: S,
  options?: SchemaOptions<S["Type"]>
): Arbitrary<S["Type"]> {
  const compiled = Compiler.compile(schema)
  const shrink = options?.shrink
  if (shrink === undefined) return make(compiled)
  const validate = Compiler.compileValidator(schema)
  return make(Model.makeGenerator(
    compiled.minCost,
    (state) =>
      Model.mapGeneration(compiled.generate(state), (attempt) =>
        attempt._tag === "Discarded" || !state.shrinks
          ? attempt
          : Model.sampleFromValidatedShrink(attempt.value, shrink, validate))
  ))
}

/** @internal */
export function constant<A>(value: A): Arbitrary<A> {
  return make(Model.makeGenerator(0, () => Model.makeSample(value)))
}

/** @internal */
export function map<A, B>(self: Arbitrary<A>, f: (value: A) => B): Arbitrary<B> {
  return make(Model.makeGenerator(
    self.gen.minCost,
    (state) =>
      Model.mapGeneration(
        self.gen.generate(state),
        (attempt) => attempt._tag === "Discarded" ? attempt : Model.mapSample(attempt, f)
      )
  ))
}

/** @internal */
export function filter<A>(self: Arbitrary<A>, predicate: (value: A) => boolean): Arbitrary<A> {
  return make(Model.makeGenerator(
    self.gen.minCost,
    (state) =>
      Model.mapGeneration(self.gen.generate(state), (attempt) => {
        if (attempt._tag === "Discarded") return attempt
        if (!state.shrinks) return predicate(attempt.value) ? attempt : Model.discarded
        const sample = Model.filterSample(attempt, predicate)
        return sample ?? Model.discarded
      })
  ))
}

/** @internal */
export function filterMap<A, B, X>(
  self: Arbitrary<A>,
  f: (value: A) => Result.Result<B, X>
): Arbitrary<B> {
  const apply = (value: A): Option.Option<B> => {
    const result = f(value)
    return result._tag === "Success" ? Option.some(result.success) : Option.none()
  }
  return make(Model.makeGenerator(
    self.gen.minCost,
    (state) =>
      state.shrinks
        ? Model.filterMapGeneration(self.gen.generate(state), apply)
        : Model.mapGeneration(self.gen.generate(state), (attempt) => {
          if (attempt._tag === "Discarded") return attempt
          const result = apply(attempt.value)
          return Option.isSome(result) ? Model.makeSample(result.value) : Model.discarded
        })
  ))
}

/** @internal */
export function array<A>(item: Arbitrary<A>, options?: ArrayOptions): Arbitrary<Array<A>> {
  const minimum = options?.minLength ?? 0
  const maximum = options?.maxLength ?? 0xffffffff
  if (
    !Number.isInteger(minimum) || minimum < 0 || minimum > 0xffffffff ||
    !Number.isInteger(maximum) || maximum < minimum || maximum > 0xffffffff
  ) {
    throw new RangeError("Arbitrary.array: expected 0 <= minLength <= maxLength <= 4294967295 with integer lengths")
  }
  const child = item.gen
  const minCost = minimum === 0 ? 0 : minimum * child.minCost
  return make(Model.makeGenerator(minCost, (state) => {
    const upper = Math.min(
      maximum,
      Math.max(minimum, state.size),
      child.minCost > 0 ? Math.floor(state.budget.remaining / child.minCost) : maximum
    )
    if (upper < minimum) return Model.discarded
    const length = Model.randomLength(state, minimum, upper)
    const children = Array.from({ length }, () => child)
    const order = length < 2 ? undefined : Model.shuffle(state, children.keys())
    const itemState = state.size >= length ? state : { ...state, size: length }
    return Model.mapComputation(
      Model.generateProduct(children, itemState, order, length === 0 ? 0 : length * child.minCost),
      (samples) =>
        samples === undefined ? Model.discarded : Arrays.sample<A>(samples, {
          fixedCount: 0,
          optionalCount: 0,
          repeatCount: length,
          tailCount: 0,
          minimum
        }, state.shrinks)
    )
  }))
}

/** @internal */
export function all(
  input: Iterable<Arbitrary<any>> | Record<string, Arbitrary<any>>
): Arbitrary<any> {
  const iterable = Symbol.iterator in input
  const keys = iterable ? undefined : Object.keys(input)
  const members = iterable ? Array.from(input as Iterable<Arbitrary<any>>) : keys!.map((key) => input[key])
  const generators = members.map((member) => member.gen)
  let minCost = 0
  for (let index = 0; index < generators.length; index++) minCost += generators[index].minCost
  const indexes = generators.map((_, index) => index)
  return make(Model.makeGenerator(
    minCost,
    (state) => {
      const order = indexes.length < 2 ? undefined : Model.shuffle(state, indexes)
      return Model.mapComputation(
        Model.generateProduct(generators, state, order, minCost),
        (samples) => {
          if (samples === undefined) return Model.discarded
          return Model.productSample(samples, (samples) => {
            if (keys === undefined) return samples.map((sample) => sample.value)
            const out = Model.makeObject(state.nullPrototype)
            for (let index = 0; index < keys.length; index++) {
              InternalRecord.assignProperty(out, keys[index], samples[index].value)
            }
            return out
          })
        }
      )
    }
  ))
}

function makeGenerationState(
  state: Model.GenerationState,
  random: Model.GenerationRandom,
  remaining: number
): Model.GenerationState {
  return {
    size: state.size,
    shrinks: state.shrinks,
    biasFactor: state.biasFactor,
    nullPrototype: state.nullPrototype,
    random,
    budget: { remaining }
  }
}

function flatMapSourcePull<A, B>(
  source: Model.ShrinkPull<Model.Attempt<A>>,
  f: (value: A) => Arbitrary<B>,
  checkpoint: Model.GenerationRandom,
  state: Model.GenerationState,
  residual: number
): Model.ShrinkPull<Model.Attempt<B>> {
  const stack: Array<Model.ShrinkPull<Model.Attempt<A>>> = [source]
  const loop = (): Model.ShrinkPull<Model.Attempt<B>> =>
    Effect.suspend(() => {
      const current = stack[stack.length - 1]
      if (current === undefined) return done()
      return Effect.matchCauseEffect(current, {
        onFailure: Model.onTypedFailure(() => {
          stack.pop()
          return loop()
        }),
        onSuccess: (sourceAttempt) => {
          if (sourceAttempt._tag === "Discarded") return Effect.succeed<Model.Attempt<B>>(sourceAttempt)
          const sourceSample = sourceAttempt
          const target = f(sourceSample.value).gen
          const targetState = makeGenerationState(state, checkpoint.clone(), residual + target.minCost)
          return Effect.flatMapEager(Model.toEffectGeneration(target.generate(targetState)), (attempt) => {
            if (attempt._tag === "Discarded") {
              if (sourceSample.shrinks !== undefined) stack.push(sourceSample.shrinks)
              return Effect.succeed<Model.Attempt<B>>(Model.discarded)
            }
            return Effect.succeed<Model.Attempt<B>>(
              flatMapSample(sourceSample, attempt, f, checkpoint, state, residual)
            )
          })
        }
      })
    })
  return loop()
}

function flatMapSample<A, B>(
  source: Model.Sample<A>,
  target: Model.Sample<B>,
  f: (value: A) => Arbitrary<B>,
  checkpoint: Model.GenerationRandom,
  state: Model.GenerationState,
  residual: number
): Model.Sample<B> {
  // Source-first shrinking followed by permanently closing the source after a dependent shrink follows fast-check
  // v4.9.0's ChainArbitrary topology (MIT).
  // https://github.com/dubzzz/fast-check/blob/v4.9.0/packages/fast-check/src/check/arbitrary/definition/Arbitrary.ts#L147-L228
  if (source.shrinks === undefined) return target
  const sourceShrinks = flatMapSourcePull(source.shrinks, f, checkpoint, state, residual)
  const shrinks = target.shrinks === undefined
    ? sourceShrinks
    : Model.concatPulls([sourceShrinks, target.shrinks])
  return Model.makeSample(target.value, shrinks)
}

/** @internal */
export function flatMap<A, B>(self: Arbitrary<A>, f: (value: A) => Arbitrary<B>): Arbitrary<B> {
  return make(Model.makeGenerator(self.gen.minCost, (state) => {
    if (!state.shrinks) {
      return Model.flatMapGeneration(self.gen.generate(state), (source) => {
        if (source._tag === "Discarded") return source
        const target = f(source.value).gen
        const residual = state.budget.remaining
        state.budget.remaining = residual + target.minCost
        return Model.mapGeneration(target.generate(state), (attempt) => {
          state.budget.remaining = Math.min(residual, state.budget.remaining)
          return attempt
        })
      })
    }

    // Unlike fast-check's pre-source checkpoint, Effect captures the isolated PRNG after source generation so a
    // smaller source changes the dependent constraint without rerolling its choices.
    const sourceState = makeGenerationState(state, state.random.clone(), state.budget.remaining)
    return Model.flatMapGeneration(self.gen.generate(sourceState), (source) => {
      if (source._tag === "Discarded") {
        state.random.copyFrom(sourceState.random)
        state.budget.remaining = sourceState.budget.remaining
        return source
      }
      const target = f(source.value).gen
      const residual = sourceState.budget.remaining
      const checkpoint = sourceState.random.clone()
      const targetState = makeGenerationState(state, checkpoint.clone(), residual + target.minCost)
      return Model.mapGeneration(target.generate(targetState), (attempt) => {
        state.random.copyFrom(targetState.random)
        state.budget.remaining = Math.min(residual, targetState.budget.remaining)
        return attempt._tag === "Discarded" ? attempt : flatMapSample(source, attempt, f, checkpoint, state, residual)
      })
    })
  }))
}

/** @internal */
export const sampleEffect = Effect.fnUntraced(function*<A>(self: Arbitrary<A>, options?: SampleOptions) {
  const defaults = globalOptions.sample
  const count = natural(options?.count ?? defaults?.count, 10, "count")
  const size = natural(options?.size ?? defaults?.size, 10, "size")
  const maxDiscards = natural(options?.maxDiscards ?? defaults?.maxDiscards, Math.max(100, count * 10), "maxDiscards")
  const seedOption = options?.seed ?? defaults?.seed
  const maxOpsBeforeYield = yield* Scheduler.MaxOpsBeforeYield
  const seed = yield* resolveMasterSeed(seedOption)
  const seedState = hashSeed(seed)
  const values: Array<A> = []
  let discards = 0
  let attemptIndex = 0
  let attemptsSinceYield = 0
  while (values.length < count) {
    const generated = generateAttemptRaw(self.gen, seedState, attemptIndex++, size, false)
    const attempt = Model.isAttempt(generated) ? generated : yield* generated
    if (attempt._tag === "Generated") {
      values.push(attempt.value)
    } else if (++discards > maxDiscards) {
      const error: SampleError = { _tag: "SampleError", generated: values.length, discards, seed }
      return yield* Effect.fail(error)
    }
    if (++attemptsSinceYield >= maxOpsBeforeYield) {
      attemptsSinceYield = 0
      yield* Effect.yieldNow
    }
  }
  return values
})

const passedProperty = { _tag: "Passed" } as const
const returnedFalse: ReturnedFalse = { _tag: "ReturnedFalse" }

const evaluateProperty = <A, E, R>(
  property: (value: A) => boolean | Effect.Effect<boolean, E, R>,
  value: A
): Effect.Effect<typeof passedProperty | PropertyFailure<E>, never, R> => {
  const output = property(value)
  if (!Effect.isEffect(output)) return Effect.succeed(output === true ? passedProperty : returnedFalse)
  return Effect.matchCauseEffectEager(output, {
    onFailure: Model.onTypedFailure((error: E) => Effect.succeed<PropertyError<E>>({ _tag: "PropertyError", error })),
    onSuccess: (success) => Effect.succeed(success === true ? passedProperty : returnedFalse)
  })
}

const pullNext = <A>(pull: Model.ShrinkPull<Model.Attempt<A>>): Effect.Effect<Model.Attempt<A> | undefined> =>
  Effect.catchCause(pull, Model.onTypedFailure(() => Effect.succeed(undefined)))

const shrink = Effect.fnUntraced(function*<A, E, R>(
  initial: Model.Sample<A>,
  initialFailure: PropertyFailure<E>,
  property: (value: A) => boolean | Effect.Effect<boolean, E, R>,
  maximum: number
) {
  // The first-failing-child traversal and its sibling-index path follow fast-check v4.9.0's counterexample-path model
  // (MIT).
  // https://github.com/dubzzz/fast-check/blob/v4.9.0/packages/fast-check/src/check/runner/RunnerIterator.ts
  // https://github.com/dubzzz/fast-check/blob/v4.9.0/packages/fast-check/src/check/runner/utils/PathWalker.ts
  let current = initial
  let failure = initialFailure
  let inspected = 0
  const path: Array<number> = []
  while (inspected < maximum) {
    let index = 0
    let found: Model.Sample<A> | undefined
    while (inspected < maximum) {
      if (current.shrinks === undefined) break
      const candidate = yield* pullNext(current.shrinks)
      if (candidate === undefined) break
      inspected++
      const attempt = candidate
      if (attempt._tag === "Discarded") continue
      const outcome = yield* evaluateProperty(property, attempt.value)
      if (outcome._tag === initialFailure._tag) {
        found = attempt
        failure = outcome
        path.push(index)
        break
      }
      index++
    }
    if (found === undefined) break
    current = found
  }
  return { current, failure, shrinks: path.length, path }
})

const followReplay = Effect.fnUntraced(function*<A, E, R>(
  initial: Model.Sample<A>,
  initialFailure: PropertyFailure<E>,
  path: ReadonlyArray<number>,
  property: (value: A) => boolean | Effect.Effect<boolean, E, R>
) {
  let current = initial
  let failure = initialFailure
  for (const targetIndex of path) {
    if (current.shrinks === undefined) return { _tag: "ReplayMismatch", reason: "ShrinkPathUnavailable" } as const
    let selected: Model.Sample<A> | undefined
    let index = 0
    while (index <= targetIndex) {
      const candidate = yield* pullNext(current.shrinks)
      if (candidate === undefined) return { _tag: "ReplayMismatch", reason: "ShrinkPathUnavailable" } as const
      if (candidate._tag === "Discarded") continue
      if (index === targetIndex) selected = candidate
      index++
    }
    const outcome = yield* evaluateProperty(property, selected!.value)
    if (outcome._tag !== initialFailure._tag) {
      return { _tag: "ReplayMismatch", reason: "ShrinkPassed" } as const
    }
    current = selected!
    failure = outcome
  }
  return { _tag: "Replayed", current, failure } as const
})

interface SearchOptions {
  readonly runs: number
  readonly size: number
  readonly maxDiscards: number
  readonly seed: string | number
  readonly maxOpsBeforeYield: number
}

interface SearchCase<A> {
  readonly sample: Model.Sample<A>
  readonly attempt: number
  readonly size: number
  readonly runs: number
  readonly discards: number
}

interface Found<A, E> extends SearchCase<A> {
  readonly _tag: "Found"
  readonly failure: PropertyFailure<E>
}

type SearchResult<A, E> = Passed | Exhausted | Found<A, E>

// Only the search advances this cursor. Each generated case advances size, while discards retain it.
// This gives both search strategies the sequential seed and size schedule, independently of evaluation timing.
const makeSearch = <A>(self: Arbitrary<A>, options: SearchOptions) => {
  const seed = hashSeed(options.seed)
  let runs = 0
  let discards = 0
  let attemptIndex = 0
  return Effect.gen(function*(): Effect.fn.Return<SearchCase<A> | Exhausted> {
    const size = options.runs === 1 ? options.size : Math.round(runs * options.size / (options.runs - 1))
    while (true) {
      const index = attemptIndex++
      const sample = yield* generateAttempt(self.gen, seed, index, size, true)
      if (sample._tag === "Generated") {
        return { sample, attempt: index, size, runs: ++runs, discards }
      }
      if (++discards > options.maxDiscards) return { _tag: "Exhausted", runs, discards, seed: options.seed }
      if (options.maxOpsBeforeYield <= 1 || discards % options.maxOpsBeforeYield === 0) yield* Effect.yieldNow
    }
  })
}

const searchSequential = Effect.fnUntraced(function*<A, E, R>(
  next: Effect.Effect<SearchCase<A> | Exhausted>,
  property: (value: A) => boolean | Effect.Effect<boolean, E, R>,
  runs: number
): Effect.fn.Return<SearchResult<A, E>, never, R> {
  while (true) {
    const current = yield* next
    if ("_tag" in current) return current
    const outcome = yield* evaluateProperty(property, current.sample.value)
    if (outcome._tag !== "Passed") return { ...current, _tag: "Found", failure: outcome }
    if (current.runs === runs) return { _tag: "Passed", runs, discards: current.discards }
  }
})

const searchConcurrent = Effect.fnUntraced(function*<A, E, R>(
  next: Effect.Effect<SearchCase<A> | Exhausted>,
  property: (value: A) => boolean | Effect.Effect<boolean, E, R>,
  runs: number,
  concurrency: number
): Effect.fn.Return<SearchResult<A, E>, never, R> {
  interface Pending extends SearchCase<A> {
    readonly fiber: Fiber.Fiber<typeof passedProperty | PropertyFailure<E>>
  }
  const queue = yield* Queue.make<Pending | Exhausted>()
  const window = yield* Semaphore.make(concurrency)
  const scope = yield* Scope.make("parallel")
  const produce = Effect.gen(function*() {
    for (let index = 0; index < runs; index++) {
      // Hold each permit until its result is consumed, bounding both work and buffered results.
      yield* window.take(1)
      const current = yield* next
      if ("_tag" in current) {
        yield* Queue.offer(queue, current)
        return
      }
      const fiber = yield* Effect.forkIn(Effect.suspend(() => evaluateProperty(property, current.sample.value)), scope)
      yield* Queue.offer(queue, { ...current, fiber })
    }
  }).pipe(
    // Queue failure follows already queued cases, so speculative generation defects cannot overtake them.
    Effect.catchCause((cause) => Queue.failCause(queue, cause)),
    Effect.awaitAllChildren
  )
  return yield* Effect.acquireUseRelease(
    Effect.forkIn(produce, scope),
    () =>
      Effect.gen(function*(): Effect.fn.Return<SearchResult<A, E>, never, R> {
        while (true) {
          const current = yield* Queue.take(queue)
          if ("_tag" in current) return current
          const outcome = yield* Fiber.join(current.fiber)
          if (outcome._tag !== "Passed") return { ...current, _tag: "Found", failure: outcome }
          if (current.runs === runs) return { _tag: "Passed", runs, discards: current.discards }
          yield* window.release(1)
        }
      }),
    // Generator and evaluation finalizers can depend on each other, so interrupt them independently before awaiting.
    (_, exit) => Scope.close(scope, exit)
  )
})

/** @internal */
export const checkEffect = Effect.fnUntraced(function*<A, E, R>(
  self: Arbitrary<A>,
  property: (value: A) => boolean | Effect.Effect<boolean, E, R>,
  options?: CheckOptions
): Effect.fn.Return<CheckResult<A, E>, never, R> {
  const replay = options?.replay
  if (replay !== undefined) {
    const data = replayData(replay)
    const attempt = yield* generateAttempt(self.gen, hashSeed(data.seed), data.attempt, data.size, true)
    if (attempt._tag === "Discarded") return { _tag: "ReplayMismatch", reason: "AttemptDiscarded" }
    const outcome = yield* evaluateProperty(property, attempt.value)
    if (outcome._tag === "Passed") return { _tag: "ReplayMismatch", reason: "PropertyPassed" }
    if (outcome._tag !== data.failureTag) return { _tag: "ReplayMismatch", reason: "ShrinkPassed" }
    const replayed = yield* followReplay(attempt, outcome, data.path, property)
    if (replayed._tag === "ReplayMismatch") return replayed
    return {
      _tag: "Falsified",
      initialInput: attempt.value,
      shrunkInput: replayed.current.value,
      failure: replayed.failure,
      runs: 1,
      discards: 0,
      shrinks: data.path.length,
      replay
    }
  }

  const defaults = globalOptions.check
  const runsTarget = positive(options?.runs ?? defaults?.runs, 100, "runs")
  const concurrency = positive(options?.concurrency ?? defaults?.concurrency, 1, "concurrency")
  const size = natural(options?.size ?? defaults?.size, 10, "size")
  const maxDiscards = natural(
    options?.maxDiscards ?? defaults?.maxDiscards,
    Math.max(100, runsTarget * 10),
    "maxDiscards"
  )
  const maxShrinks = natural(options?.maxShrinks ?? defaults?.maxShrinks, 100, "maxShrinks")
  const seedOption = options?.seed ?? defaults?.seed
  const maxOpsBeforeYield = yield* Scheduler.MaxOpsBeforeYield
  const seed = yield* resolveMasterSeed(seedOption)
  const next = makeSearch(self, { runs: runsTarget, size, maxDiscards, seed, maxOpsBeforeYield })
  const result = yield* concurrency === 1
    ? searchSequential(next, property, runsTarget)
    : searchConcurrent(next, property, runsTarget, concurrency)
  if (result._tag !== "Found") return result
  const minimized = yield* shrink(result.sample, result.failure, property, maxShrinks)
  return {
    _tag: "Falsified",
    initialInput: result.sample.value,
    shrunkInput: minimized.current.value,
    failure: minimized.failure,
    runs: result.runs,
    discards: result.discards,
    shrinks: minimized.shrinks,
    replay: makeReplay({
      seed,
      attempt: result.attempt,
      size: result.size,
      path: minimized.path,
      failureTag: result.failure._tag
    })
  }
})
