import type {
  OperationResultEnvelope,
  TRPCLink,
  TRPCSubscription,
} from '@trpc/client';
import {
  createTRPCClient,
  createTRPCUntypedClient,
  TRPCClientError,
} from '@trpc/client';
import { initTRPC } from '@trpc/server';
import type { Observer } from '@trpc/server/observable';
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

test('callbacks and the loop get the same data', async () => {
  const ctx = createControlledClient();
  const onData = vi.fn<(data: number) => void>();
  const sub = ctx.client.onEvent.subscribe(undefined, { onData });
  const iterator = iteratorOf(sub);

  ctx.emit(1);
  ctx.emit(2);

  expect(await iterator.next()).toEqual({ value: 1, done: false });
  expect(await iterator.next()).toEqual({ value: 2, done: false });
  expect(onData.mock.calls.map((call) => call[0])).toEqual([1, 2]);

  sub.unsubscribe();
});

test('only one loop can iterate a subscription at a time', () => {
  const ctx = createControlledClient();
  const sub = ctx.client.onEvent.subscribe(undefined);
  iteratorOf(sub);

  expect(() => iteratorOf(sub)).toThrowError(
    'A subscription can only be iterated by one loop',
  );

  sub.unsubscribe();
});

test('data that arrives before iteration starts is not buffered', async () => {
  const ctx = createControlledClient();
  const onData = vi.fn<(data: number) => void>();
  const sub = ctx.client.onEvent.subscribe(undefined, { onData });

  ctx.emit(1);

  const iterator = iteratorOf(sub);
  ctx.emit(2);

  expect(await iterator.next()).toEqual({ value: 2, done: false });
  expect(onData.mock.calls.map((call) => call[0])).toEqual([1, 2]);

  sub.unsubscribe();
});

test('a pending next() resolves with the next value', async () => {
  const ctx = createControlledClient();
  const sub = ctx.client.onEvent.subscribe(undefined);
  const iterator = iteratorOf(sub);

  const next = iterator.next();
  ctx.emit(1);

  expect(await next).toEqual({ value: 1, done: false });

  sub.unsubscribe();
});

test('breaking out of `for await` unsubscribes', async () => {
  const ctx = createControlledClient();
  const onData = vi.fn<(data: number) => void>();
  const sub = ctx.client.onEvent.subscribe(undefined, { onData });

  setTimeout(() => {
    ctx.emit(1);
    ctx.emit(2);
  });

  const results: number[] = [];
  for await (const value of sub) {
    results.push(value);
    break;
  }

  expect(results).toEqual([1]);
  expect(ctx.teardown).toHaveBeenCalledTimes(1);
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
  const onComplete = vi.fn<() => void>();
  const sub = ctx.client.onEvent.subscribe(undefined, { onComplete });

  setTimeout(() => {
    ctx.emit(1);
    ctx.complete();
  });

  const results: number[] = [];
  for await (const value of sub) {
    results.push(value);
  }

  expect(results).toEqual([1]);
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test('an error rejects the iterator after the buffered data, once', async () => {
  const ctx = createControlledClient();
  const onError = vi.fn<(err: TRPCClientError<AppRouter>) => void>();
  const sub = ctx.client.onEvent.subscribe(undefined, { onError });
  const iterator = iteratorOf(sub);

  ctx.emit(1);
  ctx.error('boom');

  expect(await iterator.next()).toEqual({ value: 1, done: false });
  const err = await iterator.next().catch((cause: unknown) => cause);
  expect(err).toBeInstanceOf(TRPCClientError);
  expect((err as Error).message).toBe('boom');
  expect(await iterator.next()).toEqual({ value: undefined, done: true });

  expect(onError).toHaveBeenCalledWith(err);
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

test('unsubscribe() ends a pending iteration', async () => {
  const ctx = createControlledClient();
  const sub = ctx.client.onEvent.subscribe(undefined);

  setTimeout(() => {
    ctx.emit(1);
    setTimeout(() => sub.unsubscribe());
  });

  const results: number[] = [];
  for await (const value of sub) {
    results.push(value);
  }

  expect(results).toEqual([1]);
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
    const sub = ctx.client.onEvent.subscribe(undefined, {
      onError: () => {
        // handled
      },
    });
    ctx.error('boom');
    await expect(iteratorOf(sub).next()).rejects.toThrowError('boom');
  }
  {
    const ctx = createControlledClient();
    const sub = ctx.client.onEvent.subscribe(undefined);
    sub.unsubscribe();
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

  // an iterator created after the abort is done straight away
  expect(await iteratorOf(sub).next()).toEqual({
    value: undefined,
    done: true,
  });
});

test('iterating with an already aborted signal ends straight away', async () => {
  const ctx = createControlledClient();
  const ac = new AbortController();
  ac.abort();
  const sub = ctx.client.onEvent.subscribe(undefined, { signal: ac.signal });

  expect(await iteratorOf(sub).next()).toEqual({
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
});

test('types', () => {
  const ctx = createControlledClient();

  // options are optional
  const sub = ctx.client.onEvent.subscribe(undefined);
  expectTypeOf(sub).toEqualTypeOf<TRPCSubscription<number>>();
  expectTypeOf<(typeof sub)['unsubscribe']>().toEqualTypeOf<() => void>();
  expectTypeOf(sub).toMatchTypeOf<AsyncIterable<number>>();
  sub.unsubscribe();

  const untyped = createTRPCUntypedClient<AppRouter>({ links: [] });
  expectTypeOf<ReturnType<typeof untyped.subscription>>().toEqualTypeOf<
    TRPCSubscription<unknown>
  >();
});
