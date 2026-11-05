import type { OperationResultEnvelope, TRPCLink } from '@trpc/client';
import {
  createTRPCClient,
  createTRPCUntypedClient,
  TRPCClientError,
} from '@trpc/client';
import type { TRPCSubscriptionCallbacks } from '@trpc/client/internals/TRPCUntypedClient';
import { initTRPC } from '@trpc/server';
import type { Observer, Unsubscribable } from '@trpc/server/observable';
import { observable } from '@trpc/server/observable';

const t = initTRPC.create();
const router = t.router({
  onEvent: t.procedure.subscription(async function* () {
    yield 1;
  }),
});
type AppRouter = typeof router;

type Envelope = OperationResultEnvelope<unknown, TRPCClientError<AppRouter>>;

function createControlledClient(
  opts: {
    /** Emissions the link sends while it is torn down, like `httpSubscriptionLink` */
    onTeardown?: (
      observer: Observer<Envelope, TRPCClientError<AppRouter>>,
    ) => void;
  } = {},
) {
  let current: Observer<Envelope, TRPCClientError<AppRouter>> | null = null;
  const teardown = vi.fn<() => void>();
  const link: TRPCLink<AppRouter> = () => () =>
    observable((observer) => {
      current = observer;
      return () => {
        teardown();
        opts.onTeardown?.(observer);
      };
    });
  const client = createTRPCClient<AppRouter>({ links: [link] });
  const observer = () => {
    if (!current) {
      throw new Error('Not subscribed');
    }
    return current;
  };
  return {
    client,
    teardown,
    emit: (data: number) => observer().next({ result: { type: 'data', data } }),
    error: (message: string) =>
      observer().error(new TRPCClientError<AppRouter>(message)),
    complete: () => observer().complete(),
  };
}

function iteratorOf<T>(iterable: AsyncIterable<T>) {
  return iterable[Symbol.asyncIterator]();
}

async function expectNoUncaughtErrors(fn: () => Promise<void>) {
  const onUncaught = vi.fn();
  process.on('unhandledRejection', onUncaught);
  process.on('uncaughtException', onUncaught);
  try {
    await fn();
    await new Promise((resolve) => setTimeout(resolve));
  } finally {
    process.off('unhandledRejection', onUncaught);
    process.off('uncaughtException', onUncaught);
  }
  expect(onUncaught).not.toHaveBeenCalled();
}

function throwingTeardown() {
  throw new Error('teardown failed');
}

test('each observer callback on its own makes a subscription with callbacks', () => {
  const callbacks = [
    { onStarted: vi.fn() },
    { onData: vi.fn() },
    { onError: vi.fn() },
    { onStopped: vi.fn() },
    { onComplete: vi.fn() },
    { onConnectionStateChange: vi.fn() },
  ];
  for (const callback of callbacks) {
    const ctx = createControlledClient();
    const sub = ctx.client.onEvent.subscribe(undefined, callback);
    expectTypeOf(sub).toEqualTypeOf<Unsubscribable>();

    sub.unsubscribe();
    expect(ctx.teardown).toHaveBeenCalledTimes(1);
  }
});

test('callbacks work as before', () => {
  const ctx = createControlledClient();
  const onData = vi.fn<(data: number) => void>();
  const onComplete = vi.fn<() => void>();
  ctx.client.onEvent.subscribe(undefined, { onData, onComplete });

  ctx.emit(1);
  ctx.complete();

  expect(onData).toHaveBeenCalledWith(1);
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test('data that arrives before iteration starts is queued', async () => {
  const ctx = createControlledClient();
  const sub = ctx.client.onEvent.subscribe(undefined);

  ctx.emit(1);

  const iterator = iteratorOf(sub);
  ctx.emit(2);

  expect(await iterator.next()).toEqual({ value: 1, done: false });
  expect(await iterator.next()).toEqual({ value: 2, done: false });

  await sub.return?.();
  expect(ctx.teardown).toHaveBeenCalledTimes(1);
});

test('a pending next() resolves with the next value', async () => {
  const ctx = createControlledClient();
  const sub = ctx.client.onEvent.subscribe(undefined);
  const iterator = iteratorOf(sub);

  const next = iterator.next();
  ctx.emit(1);

  expect(await next).toEqual({ value: 1, done: false });

  await sub.return?.();
});

test('breaking out of `for await` unsubscribes and drops the queue', async () => {
  const ctx = createControlledClient();
  const sub = ctx.client.onEvent.subscribe(undefined);

  ctx.emit(1);
  ctx.emit(2);
  ctx.emit(3);

  const results: number[] = [];
  for await (const value of sub) {
    results.push(value);
    break;
  }

  expect(results).toEqual([1]);
  expect(ctx.teardown).toHaveBeenCalledTimes(1);
  expect(await sub.next()).toEqual({ value: undefined, done: true });
});

test('returning from inside `for await` unsubscribes', async () => {
  const ctx = createControlledClient();
  const sub = ctx.client.onEvent.subscribe(undefined);

  setTimeout(() => ctx.emit(1));

  const first = await (async () => {
    for await (const value of sub) {
      return value;
    }
    return null;
  })();

  expect(first).toBe(1);
  expect(ctx.teardown).toHaveBeenCalledTimes(1);
});

test('completion ends the loop', async () => {
  const ctx = createControlledClient();
  const sub = ctx.client.onEvent.subscribe(undefined);

  setTimeout(() => {
    ctx.emit(1);
    ctx.complete();
  });

  const results: number[] = [];
  for await (const value of sub) {
    results.push(value);
  }

  expect(results).toEqual([1]);
});

test('an error rejects the iterator after the buffered data, once', async () => {
  const ctx = createControlledClient();
  const sub = ctx.client.onEvent.subscribe(undefined);
  const iterator = iteratorOf(sub);

  ctx.emit(1);
  ctx.error('boom');

  expect(await iterator.next()).toEqual({ value: 1, done: false });
  const err = await iterator.next().catch((cause: unknown) => cause);
  expect(err).toBeInstanceOf(TRPCClientError);
  expect((err as Error).message).toBe('boom');
  expect(await iterator.next()).toEqual({ value: undefined, done: true });
});

test('an error rejects a pending next()', async () => {
  const ctx = createControlledClient();
  const sub = ctx.client.onEvent.subscribe(undefined);

  setTimeout(() => ctx.error('boom'));

  await expect(async () => {
    for await (const _ of sub) {
      // noop
    }
  }).rejects.toThrowError('boom');
});

test('aborting the signal ends a pending iteration', async () => {
  const ctx = createControlledClient();
  const ac = new AbortController();
  const sub = ctx.client.onEvent.subscribe(undefined, { signal: ac.signal });

  setTimeout(() => {
    ctx.emit(1);
    setTimeout(() => ac.abort());
  });

  const results: number[] = [];
  for await (const value of sub) {
    results.push(value);
  }

  expect(results).toEqual([1]);
  expect(ctx.teardown).toHaveBeenCalledTimes(1);
});

test('aborting yields everything a slow loop left queued, then ends', async () => {
  const ctx = createControlledClient();
  const ac = new AbortController();
  const sub = ctx.client.onEvent.subscribe(undefined, { signal: ac.signal });

  setTimeout(() => ctx.emit(1));

  const results: number[] = [];
  for await (const value of sub) {
    results.push(value);
    if (value === 1) {
      // more data arrives, then the abort, while the loop is still busy
      ctx.emit(2);
      ctx.emit(3);
      ac.abort();
      ctx.emit(4);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  expect(results).toEqual([1, 2, 3]);
  expect(ctx.teardown).toHaveBeenCalledTimes(1);
});

test('iterating a subscription that already ended', async () => {
  {
    const ctx = createControlledClient();
    const sub = ctx.client.onEvent.subscribe(undefined);
    ctx.complete();
    expect(await iteratorOf(sub).next()).toEqual({
      value: undefined,
      done: true,
    });
  }
  {
    const ctx = createControlledClient();
    const sub = ctx.client.onEvent.subscribe(undefined);
    ctx.error('boom');
    await expect(iteratorOf(sub).next()).rejects.toThrowError('boom');
  }
  {
    const ctx = createControlledClient();
    const ac = new AbortController();
    const sub = ctx.client.onEvent.subscribe(undefined, { signal: ac.signal });
    ac.abort();
    expect(await iteratorOf(sub).next()).toEqual({
      value: undefined,
      done: true,
    });
  }
});

test('aborting the signal ends iteration after the buffered data', async () => {
  const ctx = createControlledClient();
  const ac = new AbortController();
  const sub = ctx.client.onEvent.subscribe(undefined, { signal: ac.signal });
  const iterator = iteratorOf(sub);

  ctx.emit(1);
  ac.abort();

  expect(await iterator.next()).toEqual({ value: 1, done: false });
  expect(await iterator.next()).toEqual({ value: undefined, done: true });

  const ac2 = new AbortController();
  const pending = iteratorOf(
    ctx.client.onEvent.subscribe(undefined, { signal: ac2.signal }),
  ).next();
  ac2.abort();
  expect(await pending).toEqual({ value: undefined, done: true });

  // reading after the abort is done straight away
  expect(await sub.next()).toEqual({
    value: undefined,
    done: true,
  });
});

test('abort listeners are only added while iterating', async () => {
  const ctx = createControlledClient();
  const ac = new AbortController();
  const add = vi.spyOn(ac.signal, 'addEventListener');
  const remove = vi.spyOn(ac.signal, 'removeEventListener');

  const callbacksOnly = ctx.client.onEvent.subscribe(undefined, {
    signal: ac.signal,
    onData: () => {
      // noop
    },
  });
  expect(add).not.toHaveBeenCalled();
  callbacksOnly.unsubscribe();

  const sub = ctx.client.onEvent.subscribe(undefined, { signal: ac.signal });
  setTimeout(() => ctx.emit(1));
  for await (const _ of sub) {
    break;
  }
  expect(add).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]![1]);
});

test('emissions while the link tears down are ignored', async () => {
  const ctx = createControlledClient({
    onTeardown(observer) {
      observer.next({ result: { type: 'data', data: 99 } });
      observer.complete();
    },
  });
  const sub = ctx.client.onEvent.subscribe(undefined);

  setTimeout(() => ctx.emit(1));

  const results: number[] = [];
  for await (const value of sub) {
    results.push(value);
    break;
  }

  expect(results).toEqual([1]);
  expect(ctx.teardown).toHaveBeenCalledTimes(1);
  expect(await sub.next()).toEqual({ value: undefined, done: true });
});

test('aborting during a running loop drops what the link emits while it tears down', async () => {
  const ctx = createControlledClient({
    onTeardown(observer) {
      observer.next({ result: { type: 'data', data: 99 } });
      observer.complete();
    },
  });
  const ac = new AbortController();
  const sub = ctx.client.onEvent.subscribe(undefined, { signal: ac.signal });

  setTimeout(() => ctx.emit(1));

  const results: number[] = [];
  for await (const value of sub) {
    results.push(value);
    if (value === 1) {
      ctx.emit(2);
      ac.abort();
    }
  }

  expect(results).toEqual([1, 2]);
  expect(ctx.teardown).toHaveBeenCalledTimes(1);
});

test('return() from outside ends a pending iteration and drops what the link emits while it tears down', async () => {
  const ctx = createControlledClient({
    onTeardown(observer) {
      observer.next({ result: { type: 'data', data: 99 } });
    },
  });
  const sub = ctx.client.onEvent.subscribe(undefined);

  setTimeout(() => {
    ctx.emit(1);
    setTimeout(() => void sub.return?.());
  });

  const results: number[] = [];
  for await (const value of sub) {
    results.push(value);
  }

  expect(results).toEqual([1]);
  expect(ctx.teardown).toHaveBeenCalledTimes(1);
  expect(await sub.next()).toEqual({ value: undefined, done: true });
});

test('an already aborted signal tears down the subscription straight away', async () => {
  const ctx = createControlledClient();
  const ac = new AbortController();
  ac.abort();
  const sub = ctx.client.onEvent.subscribe(undefined, { signal: ac.signal });

  // even though the link ignores the signal
  expect(ctx.teardown).toHaveBeenCalledTimes(1);
  expect(await sub.next()).toEqual({ value: undefined, done: true });
});

test('a subscription can only be iterated once', async () => {
  const message =
    'A subscription can only be iterated once. Call subscribe() again for another loop.';
  const ctx = createControlledClient();
  const sub = ctx.client.onEvent.subscribe(undefined);

  ctx.emit(1);
  ctx.emit(2);
  ctx.complete();

  // while the first loop still has queued data to read
  const first: number[] = [];
  for await (const value of sub) {
    first.push(value);
    if (value === 1) {
      await expect(async () => {
        for await (const _ of sub) {
          // noop
        }
      }).rejects.toThrowError(message);
    }
  }
  expect(first).toEqual([1, 2]);

  // and after it ended
  expect(() => iteratorOf(sub)).toThrowError(message);
  expect(ctx.teardown).toHaveBeenCalledTimes(1);
});

test('a teardown error on `break` is thrown from the loop', async () => {
  await expectNoUncaughtErrors(async () => {
    const ctx = createControlledClient({ onTeardown: throwingTeardown });
    const sub = ctx.client.onEvent.subscribe(undefined);
    ctx.emit(1);

    await expect(async () => {
      for await (const _ of sub) {
        break;
      }
    }).rejects.toThrowError('teardown failed');
    expect(ctx.teardown).toHaveBeenCalledTimes(1);
    expect(await sub.next()).toEqual({ value: undefined, done: true });
  });
});

test('a teardown error on abort is thrown from the loop after the queued data', async () => {
  await expectNoUncaughtErrors(async () => {
    const ctx = createControlledClient({ onTeardown: throwingTeardown });
    const ac = new AbortController();
    const sub = ctx.client.onEvent.subscribe(undefined, { signal: ac.signal });
    ctx.emit(1);
    ac.abort();

    const results: number[] = [];
    await expect(async () => {
      for await (const value of sub) {
        results.push(value);
      }
    }).rejects.toThrowError('teardown failed');
    expect(results).toEqual([1]);
    expect(ctx.teardown).toHaveBeenCalledTimes(1);
    expect(await sub.next()).toEqual({ value: undefined, done: true });
  });

  await expectNoUncaughtErrors(async () => {
    const ctx = createControlledClient({ onTeardown: throwingTeardown });
    const ac = new AbortController();
    const sub = ctx.client.onEvent.subscribe(undefined, { signal: ac.signal });
    const pending = sub.next();
    ac.abort();

    await expect(pending).rejects.toThrowError('teardown failed');
  });
});

test('an unknown `on*` option is not a callback', async () => {
  const ctx = createControlledClient();
  const opts = {
    signal: new AbortController().signal,
    onReconnect: () => {
      // noop
    },
  };
  const sub = ctx.client.onEvent.subscribe(undefined, opts);
  expectTypeOf(sub).toEqualTypeOf<AsyncIterableIterator<number>>();

  setTimeout(() => ctx.emit(1));
  const results: number[] = [];
  for await (const value of sub) {
    results.push(value);
    break;
  }

  expect(results).toEqual([1]);
  expect(ctx.teardown).toHaveBeenCalledTimes(1);
});

test('types', async () => {
  const ctx = createControlledClient();

  // options are optional, and without callbacks it's only an async iterator
  const sub = ctx.client.onEvent.subscribe(undefined);
  expectTypeOf(sub).toEqualTypeOf<AsyncIterableIterator<number>>();
  expectTypeOf(sub).not.toMatchTypeOf<Unsubscribable>();
  // @ts-expect-error there's no unsubscribe(): use `signal`, `break` or `return()`
  expect(sub.unsubscribe).toBeUndefined();
  await sub.return?.();

  // with callbacks, it's only `Unsubscribable`
  const withCallbacks = ctx.client.onEvent.subscribe(undefined, {
    onData: (data) => expectTypeOf(data).toEqualTypeOf<number>(),
  });
  expectTypeOf(withCallbacks).toEqualTypeOf<Unsubscribable>();
  expectTypeOf(withCallbacks).not.toMatchTypeOf<AsyncIterable<number>>();
  withCallbacks.unsubscribe();

  // one defined callback is enough, and each one keeps its type
  const onErrorOnly = ctx.client.onEvent.subscribe(undefined, {
    onError: (err) => expectTypeOf(err).toEqualTypeOf<TRPCClientError<any>>(),
  });
  expectTypeOf(onErrorOnly).toEqualTypeOf<Unsubscribable>();
  onErrorOnly.unsubscribe();
  const mixed = ctx.client.onEvent.subscribe(undefined, {
    onStarted: vi.fn(),
    onData(data) {
      expectTypeOf(data).toEqualTypeOf<number>();
    },
  });
  expectTypeOf(mixed).toEqualTypeOf<Unsubscribable>();
  mixed.unsubscribe();

  // callbacks that may all be undefined are a type error
  const only = () => {
    const partial: {
      onData?: (data: number) => void;
      onError?: (err: TRPCClientError<any>) => void;
    } = {};
    // @ts-expect-error pass at least one defined callback
    ctx.client.onEvent.subscribe(undefined, partial);
    // @ts-expect-error pass at least one defined callback
    ctx.client.onEvent.subscribe(undefined, { onData: undefined });
    const allUndefined = {
      signal: new AbortController().signal,
      onData: undefined,
      onError: undefined,
    };
    // @ts-expect-error pass at least one defined callback
    ctx.client.onEvent.subscribe(undefined, allUndefined);
  };
  void only;

  const untyped = createTRPCUntypedClient<AppRouter>({ links: [] });
  // only type-checked; the client has no links to run
  const untypedTypes = () => {
    expectTypeOf(untyped.subscription('onEvent', undefined)).toEqualTypeOf<
      AsyncIterableIterator<unknown>
    >();
    expectTypeOf(
      untyped.subscription('onEvent', undefined, {
        onData: () => {
          // noop
        },
      }),
    ).toEqualTypeOf<Unsubscribable>();
    // @ts-expect-error pass at least one defined callback
    untyped.subscription('onEvent', undefined, { onData: undefined });
  };
  void untypedTypes;
});

test('types: a subscription has callbacks or is iterated, never both', () => {
  const ctx = createControlledClient();
  const onData = (_data: number) => {
    // noop
  };
  const signal = new AbortController().signal;

  // only type-checked
  const types = async () => {
    const withCallbacks = ctx.client.onEvent.subscribe(undefined, { onData });
    /* oxlint-disable typescript/await-thenable */
    // @ts-expect-error a subscription with callbacks isn't iterable
    for await (const _ of withCallbacks) {
      // noop
    }
    /* oxlint-enable typescript/await-thenable */

    // callbacks that are all undefined aren't callbacks
    expectTypeOf<{
      onData: undefined;
      onError: undefined;
    }>().not.toMatchTypeOf<
      TRPCSubscriptionCallbacks<number, TRPCClientError<AppRouter>>
    >();

    // options that may or may not have callbacks are neither
    const maybeCallbacks = ():
      | { onData: typeof onData }
      | Record<never, never> => ({});
    // @ts-expect-error either pass callbacks or don't
    ctx.client.onEvent.subscribe(undefined, maybeCallbacks());

    // TypeScript has no exact types, so a type without the callback keys
    // can still hold them
    const callbacks = { signal, onData };
    const widened: { signal?: AbortSignal } = callbacks;
    expectTypeOf(
      ctx.client.onEvent.subscribe(undefined, widened),
    ).toEqualTypeOf<AsyncIterableIterator<number>>();
  };
  void types;
});
