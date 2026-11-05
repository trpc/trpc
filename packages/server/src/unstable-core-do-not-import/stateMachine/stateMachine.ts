/**
 * What one step of a state machine returns: the state it moves to, and the
 * side effects to run, as data. A transition never runs them itself.
 */
export interface MachineTransition<TState, TEffect> {
  readonly state: TState;
  readonly effects: readonly TEffect[];
}

/**
 * A pure state machine over unions of states, events and effects. Its
 * `transition` must not throw, read the clock or touch the world: it says
 * what should happen in `effects`, and a runtime does it. That keeps every
 * path testable without I/O or timers.
 * @see createMachineRuntime
 */
export interface StateMachine<
  TState,
  TEvent extends { readonly type: string },
  TEffect extends { readonly type: string },
> {
  /** The first state, and the effects that start it. */
  readonly initial: MachineTransition<TState, TEffect>;
  readonly transition: (
    state: TState,
    event: TEvent,
  ) => MachineTransition<TState, TEffect>;
}

/**
 * The members of a union whose `type` can be one of `TType`, including a
 * member whose `type` is itself a union.
 */
export type OfType<
  TUnion extends { readonly type: string },
  TType extends TUnion['type'],
> = TUnion extends unknown
  ? [Extract<TUnion['type'], TType>] extends [never]
    ? never
    : TUnion
  : never;

/**
 * Ends a `switch` that handles every member of a union. Passing anything but
 * `never` is a type error, so adding a member without handling it fails to
 * compile. A transition can't throw, so a value that is impossible by its
 * type but arrives at runtime anyway gets `fallback`.
 * @example
 * ```ts
 * switch (event.type) {
 *   case 'open': return ...;
 *   case 'close': return ...;
 *   default: return exhaustive(event, { state, effects: [] });
 * }
 * ```
 */
export function exhaustive<TFallback>(
  _value: never,
  fallback: TFallback,
): TFallback {
  return fallback;
}

/**
 * One synchronous step, for a short-lived machine that needs no runtime, such
 * as one request's: the caller keeps the state and runs the effects.
 * @see createMachineRuntime for a machine that reads sources and owns resources
 */
export function step<
  TState,
  TEvent extends { readonly type: string },
  TEffect extends { readonly type: string },
>(
  machine: StateMachine<TState, TEvent, TEffect>,
  state: TState,
  event: TEvent,
): MachineTransition<TState, TEffect> {
  return machine.transition(state, event);
}

/**
 * Splits effects into those of `types` and the rest, in order, each typed as
 * its part of the union.
 * @example
 * ```ts
 * const { matching: writes, rest } = splitEffects(effects, ['write']);
 * ```
 */
export function splitEffects<
  TEffect extends { readonly type: string },
  const TType extends TEffect['type'],
>(
  effects: readonly TEffect[],
  types: readonly TType[],
): {
  matching: OfType<TEffect, TType>[];
  rest: Exclude<TEffect, { readonly type: TType }>[];
} {
  const wanted: ReadonlySet<string> = new Set(types);
  const matching: OfType<TEffect, TType>[] = [];
  const rest: Exclude<TEffect, { readonly type: TType }>[] = [];
  for (const effect of effects) {
    if (wanted.has(effect.type)) {
      matching.push(effect as OfType<TEffect, TType>);
    } else {
      rest.push(effect as Exclude<TEffect, { readonly type: TType }>);
    }
  }
  return { matching, rest };
}
