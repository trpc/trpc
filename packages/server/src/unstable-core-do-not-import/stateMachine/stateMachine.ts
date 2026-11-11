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
 * what should happen in `effects`, and its caller does it. That keeps every
 * path testable without I/O or timers.
 *
 * A machine that waits on nothing, such as one HTTP request's, needs no
 * runtime: its caller keeps the state and runs the effects of each
 * `transition`.
 * @see createMachineRuntime for a machine that reads sources and owns resources
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
