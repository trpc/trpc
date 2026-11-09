import * as Duration from "../Duration.ts"
import type { Effect } from "../Effect.ts"
import * as Api from "../ExecutionPlan.ts"
import type * as Exit from "../Exit.ts"
import { dual, identity } from "../Function.ts"
import * as Result from "../Result.ts"
import * as Schedule from "../Schedule.ts"
import { isEffect } from "./core.ts"
import * as effect from "./effect.ts"
import * as internalLayer from "./layer.ts"
import * as internalSchedule from "./schedule.ts"

/** @internal */
export interface AttemptState {
  readonly attempt: number
  readonly stepAttempt: number
  readonly stepIndex: number
  readonly startNanos: bigint
}

/** @internal */
export interface EventEmitter {
  readonly begin: Effect<AttemptState, never, any>
  readonly end: (state: AttemptState, exit: Exit.Exit<any, any>) => Effect<void, never, any>
}

/** @internal */
export const makeEventEmitter = (
  onEvent: (event: Api.Event<any>) => Effect<void, never, any>,
  currentMetadata: () => Api.Metadata
): EventEmitter => {
  let lastStepIndex = -1
  let stepAttempt = 0
  const emit = (event: Api.Event<any>) => effect.ignoreCause(onEvent(event))
  return {
    begin: effect.clockWith((clock) =>
      effect.suspend(() => {
        const meta = currentMetadata()
        if (meta.stepIndex !== lastStepIndex) {
          lastStepIndex = meta.stepIndex
          stepAttempt = 0
        }
        stepAttempt++
        const state: AttemptState = {
          attempt: meta.attempt,
          stepAttempt,
          stepIndex: meta.stepIndex,
          startNanos: clock.monotonicTimeNanosUnsafe()
        }
        return effect.as(
          emit({
            _tag: "AttemptStart",
            attempt: state.attempt,
            stepAttempt: state.stepAttempt,
            stepIndex: state.stepIndex
          }),
          state
        )
      })
    ),
    end: (state, exit) =>
      effect.clockWith((clock) => {
        const duration = Duration.nanos(clock.monotonicTimeNanosUnsafe() - state.startNanos)
        return emit(
          exit._tag === "Success"
            ? {
              _tag: "AttemptSuccess",
              attempt: state.attempt,
              stepAttempt: state.stepAttempt,
              stepIndex: state.stepIndex,
              duration
            }
            : {
              _tag: "AttemptFailure",
              attempt: state.attempt,
              stepAttempt: state.stepAttempt,
              stepIndex: state.stepIndex,
              duration,
              cause: exit.cause
            }
        )
      })
  }
}

/** @internal */
export const withExecutionPlan: {
  <Input, Provides, PlanE, PlanR, RX = never>(
    plan: Api.ExecutionPlan<{
      provides: Provides
      input: Input
      error: PlanE
      requirements: PlanR
    }>,
    options?: {
      readonly onEvent?: ((event: Api.Event<Input | PlanE>) => Effect<void, never, RX>) | undefined
    }
  ): <A, E extends Input, R>(effect: Effect<A, E, R>) => Effect<
    A,
    E | PlanE,
    Exclude<R, Provides> | PlanR | RX
  >
  <A, E extends Input, R, Provides, Input, PlanE, PlanR, RX = never>(
    effect: Effect<A, E, R>,
    plan: Api.ExecutionPlan<{
      provides: Provides
      input: Input
      error: PlanE
      requirements: PlanR
    }>,
    options?: {
      readonly onEvent?: ((event: Api.Event<E | PlanE>) => Effect<void, never, RX>) | undefined
    }
  ): Effect<
    A,
    E | PlanE,
    Exclude<R, Provides> | PlanR | RX
  >
} = dual((args) => isEffect(args[0]), <A, E extends Input, R, Provides, Input, PlanE, PlanR, RX>(
  self: Effect<A, E, R>,
  plan: Api.ExecutionPlan<{
    provides: Provides
    input: Input
    error: PlanE
    requirements: PlanR
  }>,
  options?: {
    readonly onEvent?: ((event: Api.Event<E | PlanE>) => Effect<void, never, RX>) | undefined
  }
) =>
  effect.suspend(() => {
    let i = 0
    let meta: Api.Metadata = {
      attempt: 0,
      stepIndex: 0
    }
    const provideMeta = effect.provideServiceEffect(
      Api.CurrentMetadata,
      effect.sync(() => {
        meta = {
          attempt: meta.attempt + 1,
          stepIndex: i
        }
        return meta
      })
    )
    const emitter = options?.onEvent === undefined
      ? undefined
      : makeEventEmitter(options.onEvent, () => meta)
    const instrument: (attempt: Effect<A, any, any>) => Effect<A, any, any> = emitter === undefined
      ? identity
      : (attempt) =>
        effect.uninterruptibleMask((restore) =>
          effect.flatMap(emitter.begin, (state) => effect.onExit(restore(attempt), (exit) => emitter.end(state, exit)))
        )
    let result: Result.Result<A, any> | undefined
    return effect.flatMap(
      effect.whileLoop({
        while: () => i < plan.steps.length && (result === undefined || Result.isFailure(result)),
        body() {
          const step = plan.steps[i]
          let nextEffect: Effect<A, any, any> = provideMeta(
            instrument(internalLayer.provide(self, step.provide as any))
          )
          if (result) {
            let attempted = false
            const wrapped = nextEffect
            // ensure the schedule is applied at least once
            nextEffect = effect.suspend(() => {
              if (attempted) return wrapped
              attempted = true
              return effect.fromResult(result!)
            })
            nextEffect = internalSchedule.retry(nextEffect, scheduleFromStep(step, false)!)
          } else {
            const schedule = scheduleFromStep(step, true)
            nextEffect = schedule ? internalSchedule.retry(nextEffect, schedule) : nextEffect
          }
          return effect.result(nextEffect)
        },
        step(result_) {
          result = result_
          i++
        }
      }),
      () => effect.fromResult(result!)
    )
  }))

/** @internal */
export const scheduleFromStep = <Provides, In, PlanE, PlanR>(
  step: Api.ExecutionPlan<{
    provides: Provides
    input: In
    error: PlanE
    requirements: PlanR
  }>["steps"][number],
  first: boolean
) => {
  if (!first) {
    return internalSchedule.buildFromOptions({
      schedule: step.schedule ? step.schedule : step.attempts ? undefined : scheduleOnce,
      times: step.attempts,
      while: step.while
    })
  } else if (step.attempts === 1 || !(step.schedule || step.attempts)) {
    return undefined
  }
  return internalSchedule.buildFromOptions({
    schedule: step.schedule,
    while: step.while,
    times: step.attempts ? step.attempts - 1 : undefined
  })
}

const scheduleOnce = Schedule.recurs(1)
