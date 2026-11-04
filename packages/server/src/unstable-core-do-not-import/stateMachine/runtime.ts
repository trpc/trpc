import type { Unsubscribable } from '../../observable/types';
import { iteratorResource } from '../stream/utils/asyncIterable';
import { createDeferred } from '../stream/utils/createDeferred';
import { makeAsyncResource, makeResource } from '../stream/utils/disposable';
import { mergeAsyncIterables } from '../stream/utils/mergeAsyncIterables';
import type { StateMachine } from './stateMachine';

/** A running {@link StateMachine}. Dispose it to stop everything it owns. */
export interface MachineRuntime<TState, TEvent> extends AsyncDisposable {
  readonly state: TState;
  /**
   * Runs `event` through the machine, then its effects. An event sent while
   * effects run, e.g. by an effect or a listener, waits its turn, so every
   * step sees the state the last one left. Ignored once disposed. It needs
   * no `this`, so it can be passed as `intake`'s `receive`.
   */
  readonly send: (event: TEvent) => void;
  /**
   * Reads `source` until it ends or the runtime is disposed. Every source is
   * read by the runtime's one loop, in the order values arrive, and
   * `receive` gets each value when its turn comes; it usually calls `send`,
   * or drops values that no longer count. The runtime lets go of a value
   * once `receive` has run, so a source should too: hold the current value
   * in a `let` outside its loop and clear it, as `for await`, `yield*` and
   * a loop body's `const` keep the last value alive while awaiting.
   *
   * Disposal calls `return()` on `source`, which should remove its
   * listeners. An async generator only returns at its next `yield`, so one
   * waiting on I/O holds disposal up until the I/O settles.
   */
  intake<TValue>(
    source: AsyncIterable<TValue>,
    receive: (value: TValue) => void,
  ): void;
  /** Disposes `resource` with the runtime, newest first, and returns it. */
  use<TResource extends Disposable>(resource: TResource): TResource;
  /** Calls `listener` after each step, once its effects ran. */
  subscribe(listener: (state: TState) => void): Unsubscribable;
}

export interface MachineRuntimeOptions<
  TState,
  TEvent extends { readonly type: string },
  TEffect extends { readonly type: string },
> {
  machine: StateMachine<TState, TEvent, TEffect>;
  /** Runs one effect. A throw goes to `onError`; the other effects still run. */
  run: (effect: TEffect, runtime: MachineRuntime<TState, TEvent>) => void;
  /**
   * Gets whatever an effect, a listener, a `receive`, a disposal or the
   * machine itself throws. The runtime carries on.
   */
  onError: (error: unknown) => void;
}

/**
 * Interprets a pure {@link StateMachine}: feeds it events one at a time and
 * runs the effects each step returns. Effects hold resources with `use`,
 * and events from the world come in through `intake`.
 * @example
 * ```ts
 * await using runtime = createMachineRuntime({
 *   machine: { initial: { state: { status: 'idle' }, effects: [] }, transition },
 *   run(effect, runtime) {
 *     if (effect.type === 'open') {
 *       const socket = runtime.use(openSocket());
 *       runtime.intake(socket.events, runtime.send);
 *     }
 *   },
 *   onError: (error) => console.error(error),
 * });
 * runtime.send({ type: 'connect' });
 * ```
 */
export function createMachineRuntime<
  TState,
  TEvent extends { readonly type: string },
  TEffect extends { readonly type: string },
>(
  opts: MachineRuntimeOptions<TState, TEvent, TEffect>,
): MachineRuntime<TState, TEvent> {
  let state = opts.machine.initial.state;
  let disposed = false;
  let running = false;
  const queue: TEvent[] = [];
  const listeners = new Set<(state: TState) => void>();
  const resources: Disposable[] = [];

  const stopping = createDeferred();
  /** A value for the loop: a source's value and its `receive`, or the stop. */
  const stop = Symbol();
  const sources = mergeAsyncIterables<(() => void) | typeof stop>();
  // Holds the merged stream open while no other source is, and stops it.
  sources.add(
    (async function* (): AsyncGenerator<typeof stop> {
      await stopping.promise;
      yield stop;
    })(),
  );

  function attempt(fn: () => void) {
    try {
      fn();
    } catch (error) {
      opts.onError(error);
    }
  }

  function runEffects(effects: readonly TEffect[]) {
    for (const effect of effects) attempt(() => opts.run(effect, runtime));
  }

  function step(event: TEvent) {
    let result;
    try {
      result = opts.machine.transition(state, event);
    } catch (error) {
      opts.onError(error);
      return;
    }
    state = result.state;
    runEffects(result.effects);
    for (const listener of [...listeners]) attempt(() => listener(state));
  }

  function drain() {
    if (running) return;
    running = true;
    for (let event = queue.shift(); event; event = queue.shift()) {
      if (!disposed) step(event);
    }
    running = false;
  }

  const loop = (async () => {
    // Not `for await`: while it awaits, V8 keeps the last value of a
    // `for await` loop alive, and with it the value `receive` got. The
    // thunk is cleared once it has run.
    await using iterator = iteratorResource(sources);
    let receive: IteratorResult<(() => void) | typeof stop> | null;
    while (true) {
      receive = await iterator.next();
      if (receive.done || receive.value === stop) break;
      if (!disposed) attempt(receive.value);
      receive = null;
    }
  })().catch(opts.onError);

  const runtime: MachineRuntime<TState, TEvent> = makeAsyncResource(
    {
      get state() {
        return state;
      },
      send(event: TEvent) {
        if (disposed) return;
        queue.push(event);
        drain();
      },
      intake<TValue>(
        source: AsyncIterable<TValue>,
        receive: (value: TValue) => void,
      ) {
        if (disposed) return;
        sources.add(mapSource(source, receive));
      },
      use<TResource extends Disposable>(resource: TResource) {
        if (disposed) {
          attempt(() => disposeNow(resource));
        } else {
          resources.push(resource);
        }
        return resource;
      },
      subscribe(listener: (state: TState) => void) {
        listeners.add(listener);
        return { unsubscribe: () => listeners.delete(listener) };
      },
    },
    async () => {
      if (disposed) return;
      disposed = true;
      queue.length = 0;
      listeners.clear();
      for (const resource of resources.splice(0).reverse()) {
        attempt(() => disposeNow(resource));
      }
      stopping.resolve();
      await loop;
    },
  );

  running = true;
  runEffects(opts.machine.initial.effects);
  running = false;
  drain();
  return runtime;
}

/**
 * `source`'s values as thunks that hand them to `receive`. A source that
 * throws ends, and its error is thrown by the last thunk, so it can't end
 * the merged stream and the other sources with it. A plain iterator, not a
 * generator, so `return()` reaches `source` even while a `next()` is
 * pending.
 */
function mapSource<TValue>(
  source: AsyncIterable<TValue>,
  receive: (value: TValue) => void,
): AsyncIterable<() => void> {
  return {
    [Symbol.asyncIterator]() {
      const iterator = source[Symbol.asyncIterator]();
      let failed = false;
      return {
        async next() {
          if (failed) return { done: true, value: undefined };
          let result;
          try {
            result = await iterator.next();
          } catch (error) {
            failed = true;
            return {
              done: false,
              value: () => {
                throw error;
              },
            };
          }
          if (result.done) return { done: true, value: undefined };
          // Whatever still holds the thunk once it ran doesn't hold the value.
          let held: { value: TValue } | null = { value: result.value };
          result = null;
          return {
            done: false,
            value: () => {
              const once = held;
              held = null;
              if (once) receive(once.value);
            },
          };
        },
        async return() {
          await iterator.return?.();
          return { done: true, value: undefined };
        },
      };
    },
  };
}

/** Disposes a resource that outlives the block it was made in. */
export function disposeNow(resource: Disposable) {
  // oxlint-disable-next-line trpc/no-symbol-dispose
  resource[Symbol.dispose]();
}

/**
 * Resources by key, like a `Map` that disposes what it drops: `set` disposes
 * the one it replaces, and `delete` the one it removes. Disposing the map
 * disposes them all, newest first.
 */
export function createResourceMap<TKey, TResource extends Disposable>() {
  const map = new Map<TKey, TResource>();
  return makeResource(
    {
      get: (key: TKey) => map.get(key),
      has: (key: TKey) => map.has(key),
      keys: () => map.keys(),
      get size() {
        return map.size;
      },
      set(key: TKey, resource: TResource) {
        const previous = map.get(key);
        map.set(key, resource);
        if (previous && previous !== resource) disposeNow(previous);
      },
      delete(key: TKey) {
        const resource = map.get(key);
        if (!resource) return false;
        map.delete(key);
        disposeNow(resource);
        return true;
      },
    },
    () => {
      const all = [...map.values()].reverse();
      map.clear();
      for (const resource of all) disposeNow(resource);
    },
  );
}
export type ResourceMap<TKey, TResource extends Disposable> = ReturnType<
  typeof createResourceMap<TKey, TResource>
>;
