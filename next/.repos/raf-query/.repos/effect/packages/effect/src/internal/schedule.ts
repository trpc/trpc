import type * as Cause from "../Cause.ts"
import type { Effect, Repeat, Retry } from "../Effect.ts"
import { constant, constTrue, dual, identity } from "../Function.ts"
import * as Option from "../Option.ts"
import * as Pull from "../Pull.ts"
import * as Schedule from "../Schedule.ts"
import type { NoInfer } from "../Types.ts"
import { internalCall } from "../Utils.ts"
import * as core from "./core.ts"
import * as effect from "./effect.ts"

/** @internal */
export const repeatOrElse: {
  <R2, A, B, E, E2, E3, R3>(
    schedule: Schedule.Schedule<B, A, E2, R2>,
    orElse: (error: E | E2, meta: Option.Option<Schedule.Metadata<B, A>>) => Effect<B, E3, R3>
  ): <R>(
    self: Effect<A, E, R>
  ) => Effect<B, E3, R | R2 | R3>
  <A, E, R, R2, B, E2, E3, R3>(
    self: Effect<A, E, R>,
    schedule: Schedule.Schedule<B, A, E2, R2>,
    orElse: (error: E | E2, meta: Option.Option<Schedule.Metadata<B, A>>) => Effect<B, E3, R3>
  ): Effect<B, E3, R | R2 | R3>
} = dual(3, <A, E, R, R2, B, E2, E3, R3>(
  self: Effect<A, E, R>,
  schedule: Schedule.Schedule<B, A, E2, R2>,
  orElse: (error: E | E2, meta: Option.Option<Schedule.Metadata<B, A>>) => Effect<B, E3, R3>
): Effect<B, E3, R | R2 | R3> =>
  effect.flatMap(Schedule.toStepWithMetadata(schedule), (step) => {
    let meta = Schedule.CurrentMetadata.defaultValue()
    return effect.catch_(
      effect.forever(
        effect.tap(
          effect.flatMap(effect.suspend(() => effect.provideService(self, Schedule.CurrentMetadata, meta)), step),
          (meta_) =>
            effect.sync(() => {
              meta = meta_
            })
        ),
        { disableYield: true }
      ),
      (error) =>
        core.isDone(error)
          ? effect.succeed(error.value as B)
          : orElse(error as E | E2, meta.attempt === 0 ? Option.none() : Option.some(meta as any))
    )
  }))

/** @internal */
export const retryOrElse: {
  <A1, E, E1, R1, A2, E2, R2>(
    policy: Schedule.Schedule<A1, NoInfer<E>, E1, R1>,
    orElse: (e: NoInfer<E>, out: A1) => Effect<A2, E2, R2>
  ): <A, R>(self: Effect<A, E, R>) => Effect<A | A2, E1 | E2, R | R1 | R2>
  <A, E, R, A1, E1, R1, A2, E2, R2>(
    self: Effect<A, E, R>,
    policy: Schedule.Schedule<A1, NoInfer<E>, E1, R1>,
    orElse: (e: NoInfer<E>, out: A1) => Effect<A2, E2, R2>
  ): Effect<A | A2, E1 | E2, R | R1 | R2>
} = dual(3, <A, E, R, A1, E1, R1, A2, E2, R2>(
  self: Effect<A, E, R>,
  policy: Schedule.Schedule<A1, NoInfer<E>, E1, R1>,
  orElse: (e: NoInfer<E>, out: A1) => Effect<A2, E2, R2>
): Effect<A | A2, E1 | E2, R | R1 | R2> =>
  effect.flatMap(Schedule.toStepWithMetadata(policy), (step) => {
    let meta = Schedule.CurrentMetadata.defaultValue()
    let lastError!: E
    const loop: Effect<A, E1 | Cause.Done<A1>, R | R1> = effect.catch_(
      effect.suspend(() => effect.provideService(self, Schedule.CurrentMetadata, meta)),
      (error) => {
        lastError = error
        return effect.flatMap(step(error), (meta_) => {
          meta = meta_
          return loop
        })
      }
    )
    return Pull.catchDone(loop, (out) => internalCall(() => orElse(lastError, out as A1)))
  }))

/** @internal */
export const repeat = dual<{
  <O extends Repeat.Options<A>, A>(
    options: O
  ): <E, R>(self: Effect<A, E, R>) => Repeat.Return<R, E, A, O>
  <Output, Input, Error, Env>(
    schedule: Schedule.Schedule<Output, NoInfer<Input>, Error, Env>
  ): <E, R>(self: Effect<Input, E, R>) => Effect<Output, E | Error, R | Env>
  <Output, Input, Error, Env>(
    builder: (
      $: <O, E, R>(_: Schedule.Schedule<O, NoInfer<Input>, E, R>) => Schedule.Schedule<O, Input, E, R>
    ) => Schedule.Schedule<Output, NoInfer<Input>, Error, Env>
  ): <E, R>(self: Effect<Input, E, R>) => Effect<Output, E | Error, R | Env>
}, {
  <A, E, R, O extends Repeat.Options<A>>(
    self: Effect<A, E, R>,
    options: O
  ): Repeat.Return<R, E, A, O>
  <Input, E, R, Output, Error, Env>(
    self: Effect<Input, E, R>,
    schedule: Schedule.Schedule<Output, NoInfer<Input>, Error, Env>
  ): Effect<Output, E | Error, R | Env>
  <Input, E, R, Output, Error, Env>(
    self: Effect<Input, E, R>,
    builder: (
      $: <O, E, R>(_: Schedule.Schedule<O, NoInfer<Input>, E, R>) => Schedule.Schedule<O, Input, E, R>
    ) => Schedule.Schedule<Output, NoInfer<Input>, Error, Env>
  ): Effect<Output, E | Error, R | Env>
}>(
  2,
  (
    self: Effect<any, any, any>,
    options:
      | Repeat.Options<any>
      | Schedule.Schedule<any, any, any, any>
      | ((
        $: <O, E, R>(_: Schedule.Schedule<O, any, E, R>) => Schedule.Schedule<O, any, E, R>
      ) => Schedule.Schedule<any, any, any, any>)
  ) => {
    const schedule = typeof options === "function"
      ? options(identity)
      : Schedule.isSchedule(options)
      ? options
      : buildFromOptions(options)
    return repeatOrElse(self, schedule, effect.fail)
  }
)

/** @internal */
export const retry = dual<{
  <E, O extends Retry.Options<E>>(
    options: O
  ): <A, R>(
    self: Effect<A, E, R>
  ) => Retry.Return<R, E, A, O>
  <B, E, Error, Env>(
    policy: Schedule.Schedule<B, NoInfer<E>, Error, Env>
  ): <A, R>(self: Effect<A, E, R>) => Effect<A, E | Error, R | Env>
  <B, E, Error, Env>(
    builder: (
      $: <O, SE, R>(_: Schedule.Schedule<O, NoInfer<E>, SE, R>) => Schedule.Schedule<O, E, SE, R>
    ) => Schedule.Schedule<B, NoInfer<E>, Error, Env>
  ): <A, R>(self: Effect<A, E, R>) => Effect<A, E | Error, R | Env>
}, {
  <A, E, R, O extends Retry.Options<E>>(
    self: Effect<A, E, R>,
    options: O
  ): Retry.Return<R, E, A, O>
  <A, E, R, B, Error, Env>(
    self: Effect<A, E, R>,
    policy: Schedule.Schedule<B, NoInfer<E>, Error, Env>
  ): Effect<A, E | Error, R | Env>
  <A, E, R, B, Error, Env>(
    self: Effect<A, E, R>,
    builder: (
      $: <O, SE, R>(_: Schedule.Schedule<O, NoInfer<E>, SE, R>) => Schedule.Schedule<O, E, SE, R>
    ) => Schedule.Schedule<B, NoInfer<E>, Error, Env>
  ): Effect<A, E | Error, R | Env>
}>(
  2,
  (
    self: Effect<any, any, any>,
    options:
      | Retry.Options<any>
      | Schedule.Schedule<any, any, any, any>
      | ((
        $: <O, SE, R>(_: Schedule.Schedule<O, any, SE, R>) => Schedule.Schedule<O, any, SE, R>
      ) => Schedule.Schedule<any, any, any, any>)
  ) => {
    const schedule = typeof options === "function"
      ? options(identity)
      : Schedule.isSchedule(options)
      ? options
      : buildFromOptions(options)
    return retryOrElse(self, schedule, effect.fail)
  }
)

/** @internal */
export const scheduleFrom = dual<
  <Input, Output, Error, Env>(
    initial: Input,
    schedule: Schedule.Schedule<Output, Input, Error, Env>
  ) => <E, R>(
    self: Effect<Input, E, R>
  ) => Effect<Output, E | Error, R | Env>,
  <Input, E, R, Output, Error, Env>(
    self: Effect<Input, E, R>,
    initial: Input,
    schedule: Schedule.Schedule<Output, Input, Error, Env>
  ) => Effect<Output, E | Error, R | Env>
>(3, <Input, E, R, Output, Error, Env>(
  self: Effect<Input, E, R>,
  initial: Input,
  schedule: Schedule.Schedule<Output, Input, Error, Env>
): Effect<Output, E | Error, R | Env> =>
  effect.flatMap(Schedule.toStepWithMetadata(schedule), (step) => {
    let meta = Schedule.CurrentMetadata.defaultValue()
    const selfWithMeta = effect.suspend(() => effect.provideService(self, Schedule.CurrentMetadata, meta))
    return effect.catch_(
      effect.flatMap(
        step(initial),
        (meta_) => {
          meta = meta_
          const body = constant(effect.flatMap(selfWithMeta, step))
          return effect.whileLoop({
            while: constTrue,
            body,
            step(meta_) {
              meta = meta_
            }
          }) as Effect<never, E, R | Env>
        }
      ),
      (error) => core.isDone(error) ? effect.succeed(error.value as Output) : effect.fail(error as E | Error)
    )
  }))

const passthroughForever = Schedule.passthrough(Schedule.forever)

/** @internal */
export const buildFromOptions = <Input>(options: {
  schedule?: Schedule.Schedule<any, Input, any, any> | undefined
  while?: ((input: Input) => boolean | Effect<boolean, any, any>) | undefined
  until?: ((input: Input) => boolean | Effect<boolean, any, any>) | undefined
  times?: number | undefined
}) => {
  let schedule: Schedule.Schedule<any, Input, any, any> = options.schedule
    ? Schedule.passthrough(options.schedule)
    : passthroughForever
  if (options.while) {
    schedule = Schedule.while(schedule, ({ input }) => {
      const applied = options.while!(input)
      return core.isEffect(applied) ? applied : effect.succeed(applied)
    })
  }
  if (options.until) {
    schedule = Schedule.while(schedule, ({ input }) => {
      const applied = options.until!(input)
      return core.isEffect(applied) ? effect.map(applied, (b) => !b) : effect.succeed(!applied)
    })
  }
  if (options.times !== undefined) {
    schedule = Schedule.while(schedule, ({ attempt }) => effect.succeed(attempt <= options.times!))
  }
  return schedule
}
