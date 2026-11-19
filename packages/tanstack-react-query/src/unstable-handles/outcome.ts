/**
 * How one unit of a load ended: an entry, a call, a page or an item. Each
 * unit has its own, so that one unit's failure is never another's: what
 * waits for a unit gets its outcome, never a rejection.
 */
export type Outcome<TData, TError = unknown> =
  | { readonly ok: true; readonly data: TData }
  | { readonly ok: false; readonly error: TError };

export function ok<TData>(data: TData): Outcome<TData, never> {
  return { ok: true, data };
}

export function failed<TError>(error: TError): Outcome<never, TError> {
  return { ok: false, error };
}

/**
 * Runs one unit's work. What it throws, as it starts or later, is that
 * unit's outcome: it never rejects
 */
export function attempt<TData>(
  run: () => TData | PromiseLike<TData>,
): Promise<Outcome<Awaited<TData>>> {
  try {
    return Promise.resolve(run()).then(ok, failed);
  } catch (error) {
    return Promise.resolve(failed(error));
  }
}

/** `attempt()` for work that is done in this step, such as building options */
export function attemptNow<TData>(run: () => TData): Outcome<TData> {
  try {
    return ok(run());
  } catch (error) {
    return failed(error);
  }
}

/** Where a unit is: still running, or settled with its outcome */
export type UnitState<TData, TError> =
  | { readonly status: 'pending' }
  | { readonly status: 'settled'; readonly outcome: Outcome<TData, TError> };

/**
 * A unit's outcome, settled exactly once: the first `settle()` is its
 * outcome, and any later one changes nothing. What waits for it is told in
 * the step in which it settles.
 */
export interface Unit<TData, TError = unknown> {
  readonly state: () => UnitState<TData, TError>;
  readonly settle: (outcome: Outcome<TData, TError>) => void;
  /** Told once, in the step it settles in, or at once if it has */
  readonly onSettled: (
    listener: (outcome: Outcome<TData, TError>) => void,
  ) => void;
  /** Resolves to its outcome. Never rejects */
  readonly outcome: Promise<Outcome<TData, TError>>;
}

export function createUnit<TData, TError = unknown>(): Unit<TData, TError> {
  let state: UnitState<TData, TError> = { status: 'pending' };
  const listeners: ((outcome: Outcome<TData, TError>) => void)[] = [];
  const unit: Unit<TData, TError> = {
    state: () => state,
    settle(outcome) {
      if (state.status === 'settled') {
        return;
      }
      state = { status: 'settled', outcome };
      // Every listener is told, also after one that throws. The first throw
      // is rethrown once they all have been
      const thrown: { error: unknown }[] = [];
      for (const listener of listeners.splice(0)) {
        try {
          listener(outcome);
        } catch (error) {
          thrown.push({ error });
        }
      }
      const [first] = thrown;
      if (first) {
        throw first.error;
      }
    },
    onSettled(listener) {
      if (state.status === 'settled') {
        listener(state.outcome);
      } else {
        listeners.push(listener);
      }
    },
    outcome: new Promise((resolve) => {
      listeners.push(resolve);
    }),
  };
  return unit;
}

/** A unit that settles with what `outcome` resolves to */
export function unitOf<TData, TError>(
  outcome: Promise<Outcome<TData, TError>>,
): Unit<TData, TError> {
  const unit = createUnit<TData, TError>();
  void outcome.then(unit.settle);
  return unit;
}

/**
 * Calls `run` once, in the step in which the last of the units has data, or
 * the first of them has failed, with the data of each by its key.
 */
export function whenAll<TKey, TData, TError>(
  units: ReadonlyMap<TKey, Unit<TData, TError>>,
  run: (outcome: Outcome<Map<TKey, TData>, TError>) => void,
) {
  let done = false;
  const check = () => {
    if (done) {
      return;
    }
    const data = new Map<TKey, TData>();
    let pending = false;
    // Every unit, also after a pending one: a later one can have failed
    for (const [key, unit] of units) {
      const state = unit.state();
      if (state.status === 'pending') {
        pending = true;
        continue;
      }
      if (!state.outcome.ok) {
        done = true;
        run(state.outcome);
        return;
      }
      data.set(key, state.outcome.data);
    }
    if (pending) {
      return;
    }
    done = true;
    run(ok(data));
  };
  if (units.size === 0) {
    check();
    return;
  }
  for (const unit of units.values()) {
    unit.onSettled(check);
  }
}

/** `whenAll()` as a promise of the outcome. Never rejects */
export function allOf<TKey, TData, TError>(
  units: ReadonlyMap<TKey, Unit<TData, TError>>,
): Promise<Outcome<Map<TKey, TData>, TError>> {
  return new Promise((resolve) => whenAll(units, resolve));
}
