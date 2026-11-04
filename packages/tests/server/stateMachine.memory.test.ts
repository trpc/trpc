import { observable, observableToAsyncIterable } from '@trpc/server/observable';
import type { StateMachine } from '@trpc/server/unstable-core-do-not-import';
import {
  createDeferred,
  createMachineRuntime,
  makeResource,
  sleep,
} from '@trpc/server/unstable-core-do-not-import';

const machine: StateMachine<null, { type: 'noop' }, { type: 'noop' }> = {
  initial: { state: null, effects: [] },
  transition: () => ({ state: null, effects: [] }),
};

/** A 50 MB value that only `refs` remembers. */
function bigValue(refs: WeakRef<Uint8Array>[]) {
  const value = new Uint8Array(50 * 1024 * 1024);
  refs.push(new WeakRef(value));
  return value;
}

const sources = {
  'an async generator': (refs: WeakRef<Uint8Array>[], open: Promise<void>) =>
    (async function* () {
      yield bigValue(refs);
      await open;
    })(),
  observableToAsyncIterable: (refs: WeakRef<Uint8Array>[]) =>
    observableToAsyncIterable(
      observable<Uint8Array, never>((emit) => {
        emit.next(bigValue(refs));
      }),
      new AbortController().signal,
    ),
};

test.each(Object.keys(sources) as (keyof typeof sources)[])(
  'intake lets go of a value from %s once receive has run',
  async (kind) => {
    const gc = globalThis.gc;
    assert(gc, 'run with --expose-gc');
    const refs: WeakRef<Uint8Array>[] = [];
    // Keeps the source open, so only the runtime could hold the value.
    const open = createDeferred();
    const received = createDeferred<number>();
    await using runtime = createMachineRuntime({
      machine,
      run: () => {
        // no effects
      },
      onError: (error) => {
        throw error;
      },
    });

    using _open = makeResource({}, () => open.resolve());
    runtime.intake(sources[kind](refs, open.promise), (value) =>
      received.resolve(value.byteLength),
    );
    expect(await received.promise).toBe(50 * 1024 * 1024);

    await vi.waitFor(async () => {
      await sleep(0);
      gc();
      // Not the value itself: printing 50 MB on failure would crash the worker.
      expect(refs[0]?.deref() === undefined).toBe(true);
    });
  },
);
