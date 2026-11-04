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

/** The members of a union with this `type`. */
export type OfType<
  TUnion extends { readonly type: string },
  TType extends TUnion['type'],
> = Extract<TUnion, { readonly type: TType }>;

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
