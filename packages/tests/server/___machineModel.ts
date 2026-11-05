import type {
  MachineTransition,
  StateMachine,
} from '@trpc/server/unstable-core-do-not-import';
import type { RunDetails } from 'fast-check';
import { defaultReportMessage } from 'fast-check';

/**
 * A model-based test harness for the pure state machines that
 * `createMachineRuntime` runs. fast-check generates the actions; the
 * simulator plays the machine the way the runtime does, but synchronously
 * and with a simulated world, and every step is checked before its effects
 * play.
 */

/** One step as the simulator played it. `before` is `null` for the initial one. */
export interface ModelStep<TState, TEvent, TEffect> {
  readonly event: TEvent | null;
  readonly before: TState | null;
  readonly after: TState;
  readonly effects: readonly TEffect[];
}

export class InvariantError extends Error {}

export function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new InvariantError(message);
}

export interface MachineModel<TState, TEvent> {
  readonly state: TState;
  send(event: TEvent): void;
}

/**
 * Plays `machine` as `createMachineRuntime` would: one event at a time, and
 * an event sent while effects play waits its turn. `check` sees each step
 * before its effects play, and throws to fail the run. `play` plays an
 * effect as the simulated world would, and may send more events.
 */
export function simulateMachine<
  TState,
  TEvent extends { readonly type: string },
  TEffect extends { readonly type: string },
>(opts: {
  machine: StateMachine<TState, TEvent, TEffect>;
  check: (step: ModelStep<TState, TEvent, TEffect>) => void;
  play: (effect: TEffect, model: MachineModel<TState, TEvent>) => void;
}): MachineModel<TState, TEvent> {
  let state = opts.machine.initial.state;
  const queue: TEvent[] = [];
  let running = false;

  function playStep(
    event: TEvent | null,
    before: TState | null,
    result: MachineTransition<TState, TEffect>,
  ) {
    opts.check({ event, before, after: result.state, effects: result.effects });
    for (const effect of result.effects) opts.play(effect, model);
  }

  function drain() {
    if (running) return;
    running = true;
    for (let event = queue.shift(); event; event = queue.shift()) {
      const before = state;
      const result = opts.machine.transition(before, event);
      state = result.state;
      playStep(event, before, result);
    }
    running = false;
  }

  const model: MachineModel<TState, TEvent> = {
    get state() {
      return state;
    },
    send(event) {
      queue.push(event);
      drain();
    },
  };

  running = true;
  playStep(null, null, opts.machine.initial);
  running = false;
  drain();
  return model;
}

/**
 * Paths the random runs must reach, or the invariants prove little. Mark
 * them from `check`, `reset()` before a seeded property, and pass `report`
 * as its fast-check `reporter`.
 */
export function coverage<const TGoal extends string>(goals: readonly TGoal[]) {
  const covered = new Set<TGoal>();
  const missing = () => goals.filter((goal) => !covered.has(goal));
  return {
    add(goal: TGoal) {
      covered.add(goal);
    },
    missing,
    reset: () => covered.clear(),
    /**
     * Fails a failed property as fast-check would, with the seed and path
     * that replay it. A passed one must have reached every goal.
     */
    report: <TValues>(details: RunDetails<TValues>) => {
      if (details.failed) {
        throw new Error(defaultReportMessage(details), {
          cause: details.errorInstance,
        });
      }
      expect(missing()).toEqual([]);
    },
  };
}
