import {
  observable,
  observableToAsyncIterable,
} from '../../observable/observable';
import { createDeferred } from '../stream/utils/createDeferred';
import { makeResource } from '../stream/utils/disposable';
import { createMachineRuntime, createResourceMap } from './runtime';
import type { MachineTransition, StateMachine } from './stateMachine';
import { exhaustive } from './stateMachine';
import { createMachineTimers } from './timers';

type DoorState = { status: 'closed' } | { status: 'open'; opens: number };
type DoorEvent = { type: 'open' } | { type: 'close' } | { type: 'knock' };
type DoorEffect =
  | { type: 'log'; message: string }
  | { type: 'ring' }
  | { type: 'throw' };

function doorTransition(
  state: DoorState,
  event: DoorEvent,
): MachineTransition<DoorState, DoorEffect> {
  switch (event.type) {
    case 'open':
      return state.status === 'open'
        ? { state, effects: [] }
        : {
            state: { status: 'open', opens: 1 },
            effects: [{ type: 'log', message: 'opened' }],
          };
    case 'close':
      return {
        state: { status: 'closed' },
        effects: [{ type: 'log', message: 'closed' }],
      };
    case 'knock':
      return { state, effects: [{ type: 'ring' }] };
    default:
      return exhaustive(event, { state, effects: [] });
  }
}

function door(
  effects: readonly DoorEffect[],
): StateMachine<DoorState, DoorEvent, DoorEffect> {
  return {
    initial: { state: { status: 'closed' }, effects },
    transition: doorTransition,
  };
}

test('a machine needs no runtime: its caller keeps the state and runs the effects', () => {
  const machine = door([]);
  let state = machine.initial.state;
  const effects: DoorEffect[] = [];
  for (const event of [
    { type: 'knock' },
    { type: 'open' },
    { type: 'open' },
    { type: 'close' },
  ] satisfies DoorEvent[]) {
    const next = machine.transition(state, event);
    state = next.state;
    effects.push(...next.effects);
  }
  expect(state).toEqual({ status: 'closed' });

  // effects are a discriminated union, so a filter narrows them
  const logs = effects.filter((effect) => effect.type === 'log');
  expectTypeOf(logs).toEqualTypeOf<{ type: 'log'; message: string }[]>();
  expect(logs.map((effect) => effect.message)).toEqual(['opened', 'closed']);
  expect(effects.filter((effect) => effect.type !== 'log')).toEqual([
    { type: 'ring' },
  ]);
});

test('an event sent while effects run waits its turn', async () => {
  const seen: string[] = [];
  await using runtime = createMachineRuntime({
    machine: door([{ type: 'log', message: 'started' }]),
    run(effect, runtime) {
      seen.push(`${effect.type} in ${runtime.state.status}`);
      // Answering the bell opens the door, but only after this step.
      if (effect.type === 'ring') runtime.send({ type: 'open' });
      seen.push(`after ${effect.type}`);
    },
    onError: (error) => {
      throw error;
    },
  });
  runtime.subscribe((state) => seen.push(`now ${state.status}`));
  runtime.send({ type: 'knock' });

  expect(seen).toEqual([
    'log in closed',
    'after log',
    'ring in closed',
    'after ring',
    'now closed',
    'log in open',
    'after log',
    'now open',
  ]);
});

test('a throwing effect, listener or transition reaches onError and nothing else stops', async () => {
  const errors: unknown[] = [];
  const ran: string[] = [];
  await using runtime = createMachineRuntime({
    machine: {
      initial: { state: { status: 'closed' }, effects: [] },
      transition(state: DoorState, event: DoorEvent) {
        if (event.type === 'close' && state.status === 'closed') {
          throw new Error('transition');
        }
        return {
          state: doorTransition(state, event).state,
          effects: [{ type: 'throw' }, { type: 'ring' }] as DoorEffect[],
        };
      },
    },
    run(effect) {
      if (effect.type === 'throw') throw new Error('effect');
      ran.push(effect.type);
    },
    onError: (error) => errors.push((error as Error).message),
  });
  runtime.subscribe(() => {
    throw new Error('listener');
  });

  runtime.send({ type: 'open' });
  runtime.send({ type: 'close' });
  runtime.send({ type: 'close' });

  expect(errors).toEqual([
    'effect',
    'listener',
    'effect',
    'listener',
    'transition',
  ]);
  expect(ran).toEqual(['ring', 'ring']);
  expect(runtime.state).toEqual({ status: 'closed' });
});

test('an async effect or listener that rejects reaches onError', async () => {
  const errors: unknown[] = [];
  await using runtime = createMachineRuntime({
    machine: door([]),
    run: async () => {
      throw new Error('effect');
    },
    onError: (error) => errors.push((error as Error).message),
  });
  runtime.subscribe(async () => {
    throw new Error('listener');
  });
  runtime.send({ type: 'knock' });
  await vi.waitFor(() => expect(errors).toEqual(['effect', 'listener']));
});

test('an onError that throws rethrows asynchronously, and the runtime carries on', async () => {
  vi.useFakeTimers();
  try {
    const disposed: string[] = [];
    const errors: unknown[] = [];
    const runtime = createMachineRuntime({
      machine: door([]),
      run(effect, runtime) {
        if (effect.type === 'ring') throw new Error('effect');
        runtime.use(
          makeResource({}, () => {
            disposed.push(effect.type);
            throw new Error('dispose');
          }),
        );
      },
      onError: (error) => {
        errors.push((error as Error).message);
        throw error;
      },
    });

    runtime.send({ type: 'knock' });
    runtime.send({ type: 'open' });
    expect(runtime.state.status).toBe('open');
    runtime.send({ type: 'close' });
    // oxlint-disable-next-line trpc/no-symbol-dispose
    await runtime[Symbol.asyncDispose]();
    expect(disposed).toEqual(['log', 'log']);
    expect(errors).toEqual(['effect', 'dispose', 'dispose']);

    expect(() => vi.runOnlyPendingTimers()).toThrow('effect');
  } finally {
    vi.useRealTimers();
  }
});

test('disposing the runtime from an effect stops the effects and listeners after it', async () => {
  const ran: string[] = [];
  const runtime = createMachineRuntime({
    machine: {
      initial: { state: { status: 'closed' }, effects: [] },
      transition: (state: DoorState, event: DoorEvent) =>
        event.type === 'knock'
          ? {
              state,
              effects: [
                { type: 'ring' },
                { type: 'log', message: 'late' },
              ] as DoorEffect[],
            }
          : doorTransition(state, event),
    },
    run(effect, runtime) {
      ran.push(effect.type);
      // oxlint-disable-next-line trpc/no-symbol-dispose
      if (effect.type === 'ring') void runtime[Symbol.asyncDispose]();
    },
    onError: (error) => {
      throw error;
    },
  });
  runtime.subscribe(() => ran.push('listener'));
  runtime.send({ type: 'open' });
  runtime.send({ type: 'knock' });
  expect(ran).toEqual(['log', 'listener', 'ring']);
});

test('intake reads every source in one loop, in the order values arrive', async () => {
  const received: string[] = [];
  const emitters: { next: (value: string) => void }[] = [];
  const removed: number[] = [];
  function source(index: number) {
    return observableToAsyncIterable(
      observable<string, never>((emit) => {
        emitters[index] = emit;
        return () => removed.push(index);
      }),
      new AbortController().signal,
    );
  }

  const runtime = createMachineRuntime({
    machine: door([]),
    run: () => {
      // no effects to run
    },
    onError: (error) => {
      throw error;
    },
  });
  runtime.intake(source(0), (value) => received.push(value));
  runtime.intake(source(1), (value) => {
    received.push(value);
    runtime.send({ type: 'open' });
  });

  emitters[0]!.next('a');
  emitters[1]!.next('b');
  emitters[0]!.next('c');
  await vi.waitFor(() => expect(received).toEqual(['a', 'b', 'c']));
  expect(runtime.state.status).toBe('open');

  // Disposing returns every source, which unsubscribes from it.
  // oxlint-disable-next-line trpc/no-symbol-dispose
  await runtime[Symbol.asyncDispose]();
  expect(removed.sort()).toEqual([0, 1]);
  runtime.send({ type: 'close' });
  expect(runtime.state.status).toBe('open');
});

test('a source that throws reaches onError and the others go on', async () => {
  const errors: unknown[] = [];
  const received: number[] = [];
  let emit: ((value: number) => void) | null = null;
  await using runtime = createMachineRuntime({
    machine: door([]),
    run: () => {
      // no effects to run
    },
    onError: (error) => errors.push(error),
  });
  runtime.intake(
    (async function* () {
      throw new Error('source');
    })(),
    () => {
      // never called
    },
  );
  runtime.intake(
    observableToAsyncIterable(
      observable<number, never>((observer) => {
        emit = (value) => observer.next(value);
      }),
      new AbortController().signal,
    ),
    (value) => received.push(value),
  );

  await vi.waitFor(() => expect(errors).toHaveLength(1));
  emit!(1);
  await vi.waitFor(() => expect(received).toEqual([1]));
});

test('disposing the runtime disposes what it uses, newest first', async () => {
  const disposed: string[] = [];
  const runtime = createMachineRuntime({
    machine: door([{ type: 'ring' }]),
    run(_effect, runtime) {
      runtime.use(makeResource({}, () => disposed.push('first')));
      runtime.use(makeResource({}, () => disposed.push('second')));
    },
    onError: (error) => {
      throw error;
    },
  });
  // oxlint-disable-next-line trpc/no-symbol-dispose
  await runtime[Symbol.asyncDispose]();
  expect(disposed).toEqual(['second', 'first']);

  runtime.use(makeResource({}, () => disposed.push('late')));
  expect(disposed).toEqual(['second', 'first', 'late']);
});

test('a resource map disposes what it replaces, deletes or holds', () => {
  const disposed: string[] = [];
  const resource = (name: string) =>
    makeResource({ name }, () => disposed.push(name));
  const map = createResourceMap<number, ReturnType<typeof resource>>();

  map.set(1, resource('a'));
  map.set(1, resource('b'));
  expect(disposed).toEqual(['a']);
  map.set(2, resource('c'));
  expect(map.delete(1)).toBe(true);
  expect(map.delete(1)).toBe(false);
  map.set(3, resource('d'));
  // oxlint-disable-next-line trpc/no-symbol-dispose
  map[Symbol.dispose]();
  expect(disposed).toEqual(['a', 'b', 'd', 'c']);
  expect(map.size).toBe(0);
});

test('a resource map disposes a replacement as the newest entry', () => {
  const disposed: string[] = [];
  const resource = (name: string) =>
    makeResource({ name }, () => disposed.push(name));
  const map = createResourceMap<number, ReturnType<typeof resource>>();

  map.set(1, resource('a'));
  map.set(2, resource('b'));
  map.set(1, resource('c'));
  // oxlint-disable-next-line trpc/no-symbol-dispose
  map[Symbol.dispose]();
  expect(disposed).toEqual(['a', 'c', 'b']);
});

test('a disposed resource map disposes what it is given', () => {
  const disposed: string[] = [];
  const resource = (name: string) =>
    makeResource({ name }, () => disposed.push(name));
  const map = createResourceMap<number, ReturnType<typeof resource>>();

  // oxlint-disable-next-line trpc/no-symbol-dispose
  map[Symbol.dispose]();
  map.set(1, resource('late'));
  expect(disposed).toEqual(['late']);
  expect(map.has(1)).toBe(false);
});

test('a resource map disposes every entry when one throws, then throws', () => {
  const disposed: string[] = [];
  const resource = (name: string) =>
    makeResource({ name }, () => {
      disposed.push(name);
      throw new Error(name);
    });
  const map = createResourceMap<number, ReturnType<typeof resource>>();

  map.set(1, resource('a'));
  expect(() =>
    // oxlint-disable-next-line trpc/no-symbol-dispose
    map[Symbol.dispose](),
  ).toThrow('a');

  const many = createResourceMap<number, ReturnType<typeof resource>>();
  many.set(1, resource('b'));
  many.set(2, resource('c'));
  // oxlint-disable-next-line trpc/no-symbol-dispose
  expect(() => many[Symbol.dispose]()).toThrow(AggregateError);
  expect(disposed).toEqual(['a', 'c', 'b']);
  expect(many.size).toBe(0);
});

test('a resource map releases an entry without disposing it, only if it is still the same one', () => {
  const disposed: string[] = [];
  const resource = (name: string) =>
    makeResource({ name }, () => disposed.push(name));
  const map = createResourceMap<number, ReturnType<typeof resource>>();
  const a = resource('a');
  const b = resource('b');

  map.set(1, a);
  map.set(1, b);
  expect(map.release(1, a)).toBe(false);
  expect(map.get(1)).toBe(b);
  expect(map.release(1, b)).toBe(true);
  expect(map.has(1)).toBe(false);
  expect(map.release(1, b)).toBe(false);
  // oxlint-disable-next-line trpc/no-symbol-dispose
  map[Symbol.dispose]();
  expect(disposed).toEqual(['a']);
});

test('a timer fires once, unless it was cancelled or restarted first', () => {
  vi.useFakeTimers();
  try {
    const fired: string[] = [];
    using timers = createMachineTimers<'a' | 'b'>((timer) => {
      fired.push(timer);
    });

    timers.start('a', 100);
    timers.start('b', 100);
    timers.cancel('b');
    vi.advanceTimersByTime(50);
    // restarted: it counts from here
    timers.start('a', 100);
    vi.advanceTimersByTime(99);
    expect(fired).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(fired).toEqual(['a']);

    vi.advanceTimersByTime(1_000);
    expect(fired).toEqual(['a']);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

test('a timer that is due is still cancelled by the one that fires before it', () => {
  vi.useFakeTimers();
  try {
    const fired: string[] = [];
    using timers = createMachineTimers<'a' | 'b'>((timer) => {
      fired.push(timer);
      timers.cancel('b');
    });
    timers.start('a', 100);
    timers.start('b', 100);
    vi.advanceTimersByTime(100);
    expect(fired).toEqual(['a']);
  } finally {
    vi.useRealTimers();
  }
});

test('disposing the timers clears them, and they start nothing after', () => {
  vi.useFakeTimers();
  try {
    const fired: string[] = [];
    const timers = createMachineTimers<'a'>((timer) => {
      fired.push(timer);
    });
    timers.start('a', 100);
    // oxlint-disable-next-line trpc/no-symbol-dispose
    timers[Symbol.dispose]();
    expect(vi.getTimerCount()).toBe(0);
    timers.start('a', 100);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1_000);
    expect(fired).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});

test('a runtime that takes in no source starts no loop, and one that does stops it', async () => {
  const machine = door([]);
  const idle = createMachineRuntime({
    machine,
    run: () => undefined,
    onError: (error) => {
      throw error;
    },
  });
  idle.send({ type: 'open' });
  // oxlint-disable-next-line trpc/no-symbol-dispose
  await idle[Symbol.asyncDispose]();
  expect(idle.state).toEqual({ status: 'open', opens: 1 });

  let returned = false;
  const reading = createMachineRuntime({
    machine,
    run: () => undefined,
    onError: (error) => {
      throw error;
    },
  });
  reading.intake(
    {
      [Symbol.asyncIterator]: () => ({
        next: () => new Promise<IteratorResult<DoorEvent>>(() => undefined),
        return: async () => {
          returned = true;
          return { done: true, value: undefined };
        },
      }),
    },
    reading.send,
  );
  // oxlint-disable-next-line trpc/no-symbol-dispose
  await reading[Symbol.asyncDispose]();
  expect(returned).toBe(true);
});

test('a source taken in after disposal is returned, as a resource used after it is disposed', async () => {
  const errors: unknown[] = [];
  const runtime = createMachineRuntime({
    machine: door([]),
    run: () => undefined,
    onError: (error) => errors.push(error),
  });
  // oxlint-disable-next-line trpc/no-symbol-dispose
  await runtime[Symbol.asyncDispose]();

  let returned = 0;
  const source = (onReturn: () => Promise<void>): AsyncIterable<DoorEvent> => ({
    [Symbol.asyncIterator]: () => ({
      next: () => new Promise<IteratorResult<DoorEvent>>(() => undefined),
      return: async () => {
        await onReturn();
        return { done: true, value: undefined };
      },
    }),
  });
  // such as an observable, which is subscribed to when it's made
  runtime.intake(
    source(async () => {
      returned++;
    }),
    runtime.send,
  );
  runtime.intake(
    source(async () => {
      throw new Error('return failed');
    }),
    runtime.send,
  );

  await vi.waitFor(() => expect(errors).toHaveLength(1));
  expect(returned).toBe(1);
  expect(errors).toEqual([new Error('return failed')]);
});

test('disposing a runtime twice waits for the same cleanup', async () => {
  const returning = createDeferred();
  const runtime = createMachineRuntime({
    machine: door([]),
    run: () => undefined,
    onError: (error) => {
      throw error;
    },
  });
  runtime.intake<DoorEvent>(
    {
      [Symbol.asyncIterator]: () => ({
        next: () => new Promise<IteratorResult<DoorEvent>>(() => undefined),
        return: async () => {
          await returning.promise;
          return { done: true, value: undefined };
        },
      }),
    },
    runtime.send,
  );

  const settled: string[] = [];
  // oxlint-disable-next-line trpc/no-symbol-dispose
  const first = runtime[Symbol.asyncDispose]().then(() => settled.push('1'));
  // oxlint-disable-next-line trpc/no-symbol-dispose
  const second = runtime[Symbol.asyncDispose]().then(() => settled.push('2'));
  await new Promise((resolve) => setImmediate(resolve));
  expect(settled).toEqual([]);

  returning.resolve();
  await Promise.all([first, second]);
  expect(settled.sort()).toEqual(['1', '2']);
});

test('exhaustive only takes what no case handled', () => {
  const event = { type: 'open' } as DoorEvent;
  // @ts-expect-error - 'open', 'close' and 'knock' are still possible
  expect(exhaustive(event, 'fallback')).toBe('fallback');
});
