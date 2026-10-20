// @vitest-environment node
import type { AnyRouter } from '@trpc/server';
import { initTRPC, TRPCError } from '@trpc/server';
import type { WSSHandlerOptions } from '@trpc/server/adapters/ws';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import type {
  TRPCClientOutgoingMessage,
  TRPCResponseMessage,
} from '@trpc/server/rpc';
import {
  createDeferred,
  isObject,
  makeAsyncResource,
} from '@trpc/server/unstable-core-do-not-import';
import type { RawData } from 'ws';
import WebSocket, { WebSocketServer } from 'ws';

type Disposal = 'return' | 'asyncDispose';

function text(data: RawData) {
  return (
    Buffer.isBuffer(data)
      ? data
      : Array.isArray(data)
        ? Buffer.concat(data)
        : Buffer.from(data)
  ).toString('utf8');
}

function isResponseMessage(value: unknown): value is TRPCResponseMessage {
  return (
    isObject(value) && 'id' in value && ('result' in value || 'error' in value)
  );
}

function parseResponse(data: RawData): TRPCResponseMessage {
  const message: unknown = JSON.parse(text(data));
  assert(isResponseMessage(message), 'not a tRPC response message');
  return message;
}

function doneResult(): IteratorReturnResult<undefined> {
  return { done: true, value: undefined };
}

function onAbort(signal: AbortSignal | undefined) {
  assert(signal, 'no signal received');
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener('abort', () => resolve(), { once: true });
  });
}

async function connectionResource(
  opts: Omit<WSSHandlerOptions<AnyRouter>, 'wss'>,
) {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  let received = 0;
  const messages: TRPCResponseMessage[] = [];
  applyWSSHandler({ ...opts, wss });
  // This listener runs after the adapter has consumed each frame.
  wss.on('connection', (socket) => {
    socket.on('message', () => {
      received++;
    });
  });
  await new Promise<void>((resolve, reject) => {
    wss.once('listening', resolve);
    wss.once('error', reject);
  });
  const address = wss.address();
  assert(typeof address === 'object' && address !== null);
  const client = new WebSocket(`ws://127.0.0.1:${address.port}`);
  client.on('message', (data) => {
    messages.push(parseResponse(data));
  });
  await new Promise<void>((resolve, reject) => {
    client.once('open', resolve);
    client.once('error', reject);
  });
  return makeAsyncResource(
    {
      client,
      messages,
      async send(message: TRPCClientOutgoingMessage) {
        const count = received;
        client.send(JSON.stringify(message));
        await vi.waitFor(() => expect(received).toBe(count + 1));
      },
    },
    async () => {
      client.terminate();
      for (const socket of wss.clients) {
        socket.terminate();
      }
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  );
}

function subscribe(path: string): TRPCClientOutgoingMessage {
  return { id: 1, method: 'subscription', params: { path, input: null } };
}

test('stop during shared context creation cancels only its procedure admission', async () => {
  const context = createDeferred<Record<string, never>>();
  const resolver = vi.fn(async function* () {
    yield 1;
  });
  const t = initTRPC.context<Record<string, never>>().create();
  const router = t.router({ pending: t.procedure.subscription(resolver) });
  await using ctx = await connectionResource({
    router,
    createContext: () => context.promise,
  });
  try {
    await ctx.send(subscribe('pending'));
    await ctx.send({ ...subscribe('pending'), id: 2 });
    await ctx.send({ id: 1, method: 'subscription.stop' });
    context.resolve({});
    await vi.waitFor(() =>
      expect(ctx.messages.filter((message) => message.id === 1)).toEqual([
        { id: 1, result: { type: 'stopped' } },
      ]),
    );
    await vi.waitFor(() =>
      expect(
        ctx.messages.some(
          (message) =>
            message.id === 2 &&
            'result' in message &&
            message.result.type === 'data',
        ),
      ).toBe(true),
    );
    expect(resolver).toHaveBeenCalledOnce();
  } finally {
    context.resolve({});
  }
});

test.each<{ cancel: 'stop' | 'close'; disposal: Disposal }>([
  { cancel: 'stop', disposal: 'return' },
  { cancel: 'close', disposal: 'return' },
  { cancel: 'stop', disposal: 'asyncDispose' },
  { cancel: 'close', disposal: 'asyncDispose' },
])(
  '$cancel during admission disposes a late iterator via $disposal without consuming it',
  async ({ cancel, disposal }) => {
    const admission = createDeferred();
    const entered = createDeferred();
    let signal: AbortSignal | undefined;
    const next = vi.fn(async () => doneResult());
    const returned = vi.fn(async () => doneResult());
    const t = initTRPC.create();
    const router = t.router({
      pending: t.procedure.subscription(async (opts) => {
        signal = opts.signal;
        entered.resolve();
        await admission.promise;
        const iterator =
          disposal === 'return'
            ? { next, return: returned }
            : makeAsyncResource({ next }, async () => {
                await returned();
              });
        return { [Symbol.asyncIterator]: () => iterator };
      }),
    });
    await using ctx = await connectionResource({ router });
    try {
      await ctx.send(subscribe('pending'));
      await entered.promise;
      if (cancel === 'stop') {
        await ctx.send({ id: 1, method: 'subscription.stop' });
      } else {
        const closed = new Promise<void>((resolve) =>
          ctx.client.once('close', () => resolve()),
        );
        ctx.client.close();
        await closed;
      }
      await vi.waitFor(() => expect(signal?.aborted).toBe(true));
      admission.resolve();
      await vi.waitFor(() => expect(returned).toHaveBeenCalledOnce());
      expect(next).not.toHaveBeenCalled();
      if (cancel === 'stop') {
        await vi.waitFor(() =>
          expect(ctx.messages).toEqual([
            { id: 1, result: { type: 'stopped' } },
          ]),
        );
      } else {
        expect(ctx.messages).toEqual([]);
      }
    } finally {
      admission.resolve();
    }
  },
);

test.each<Disposal>(['return', 'asyncDispose'])(
  'stop disposes an active iterator once via %s',
  async (disposal) => {
    const pending = createDeferred<IteratorResult<number>>();
    const next = vi.fn(() => pending.promise);
    const cleaned = vi.fn(async () => doneResult());
    const iterator =
      disposal === 'return'
        ? { next, return: cleaned }
        : makeAsyncResource({ next }, async () => {
            await cleaned();
          });
    const t = initTRPC.create();
    const router = t.router({
      active: t.procedure.subscription(() => ({
        [Symbol.asyncIterator]: () => iterator,
      })),
    });
    await using ctx = await connectionResource({ router });
    try {
      await ctx.send(subscribe('active'));
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
      await ctx.send({ id: 1, method: 'subscription.stop' });
      await vi.waitFor(() =>
        expect(ctx.messages).toEqual([
          { id: 1, result: { type: 'started' } },
          { id: 1, result: { type: 'stopped' } },
        ]),
      );
      expect(cleaned).toHaveBeenCalledOnce();
    } finally {
      pending.resolve({ done: true, value: undefined });
    }
  },
);

test('a duplicate id cannot enter or cancel a pending procedure', async () => {
  const admission = createDeferred();
  const entered = createDeferred();
  let signal: AbortSignal | undefined;
  const resolver = vi.fn(async (opts: { signal?: AbortSignal }) => {
    signal = opts.signal;
    entered.resolve();
    await admission.promise;
    return (async function* () {
      yield 1;
    })();
  });
  const t = initTRPC.create();
  const router = t.router({ pending: t.procedure.subscription(resolver) });
  await using ctx = await connectionResource({ router });
  try {
    await ctx.send(subscribe('pending'));
    await entered.promise;
    await ctx.send(subscribe('pending'));
    await vi.waitFor(() =>
      expect(ctx.messages.some((message) => 'error' in message)).toBe(true),
    );
    expect(resolver).toHaveBeenCalledOnce();
    expect(signal?.aborted).toBe(false);
    admission.resolve();
    await vi.waitFor(() =>
      expect(
        ctx.messages.some(
          (message) => 'result' in message && message.result.type === 'data',
        ),
      ).toBe(true),
    );
  } finally {
    admission.resolve();
  }
});

test('a query reusing an active subscription id leaves it registered', async () => {
  const pending = createDeferred<IteratorResult<number>>();
  const next = vi.fn(() => pending.promise);
  const t = initTRPC.create();
  const router = t.router({
    active: t.procedure.subscription(() => ({
      [Symbol.asyncIterator]: () => ({
        next,
        return: async () => doneResult(),
      }),
    })),
    marker: t.procedure.query(() => 'consumed'),
  });
  await using ctx = await connectionResource({ router });
  try {
    await ctx.send(subscribe('active'));
    await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
    await ctx.send({
      id: 1,
      method: 'query',
      params: { path: 'marker', input: null },
    });
    await vi.waitFor(() =>
      expect(ctx.messages).toContainEqual({
        id: 1,
        result: { type: 'data', data: 'consumed' },
      }),
    );
    await ctx.send(subscribe('active'));
    await vi.waitFor(() =>
      expect(ctx.messages.some((message) => 'error' in message)).toBe(true),
    );
    expect(next).toHaveBeenCalledOnce();
    await ctx.send({ id: 1, method: 'subscription.stop' });
    await vi.waitFor(() =>
      expect(ctx.messages.at(-1)).toEqual({
        id: 1,
        result: { type: 'stopped' },
      }),
    );
    expect(
      ctx.messages.map((message) =>
        'result' in message ? message.result.type : 'error',
      ),
    ).toEqual(['started', 'data', 'error', 'stopped']);
  } finally {
    pending.resolve(doneResult());
  }
});

test.each<'resolve' | 'reject'>(['resolve', 'reject'])(
  'an id remains owned until asynchronous iterator cleanup %ss',
  async (outcome) => {
    const cleanup = createDeferred<IteratorReturnResult<undefined>>();
    const cleaning = createDeferred();
    const replacement = vi.fn(async function* () {
      yield 'replacement';
    });
    const t = initTRPC.create();
    const router = t.router({
      old: t.procedure.subscription(() => ({
        [Symbol.asyncIterator]: () => ({
          next: async () => doneResult(),
          return: () => {
            cleaning.resolve();
            return cleanup.promise;
          },
        }),
      })),
      replacement: t.procedure.subscription(replacement),
      marker: t.procedure.query(() => 'consumed'),
    });
    await using ctx = await connectionResource({ router });
    try {
      await ctx.send(subscribe('old'));
      await cleaning.promise;
      expect(ctx.messages).toEqual([{ id: 1, result: { type: 'started' } }]);
      await ctx.send(subscribe('replacement'));
      await vi.waitFor(() =>
        expect(
          ctx.messages.filter((message) => 'error' in message),
        ).toHaveLength(1),
      );
      expect(replacement).not.toHaveBeenCalled();
      if (outcome === 'resolve') {
        cleanup.resolve({ done: true, value: undefined });
      } else {
        cleanup.reject(new Error('iterator cleanup failed'));
      }
      await vi.waitFor(() => {
        if (outcome === 'resolve') {
          expect(
            ctx.messages.some(
              (message) =>
                'result' in message && message.result.type === 'stopped',
            ),
          ).toBe(true);
        } else {
          expect(
            ctx.messages.filter((message) => 'error' in message),
          ).toHaveLength(2);
        }
      });
      await ctx.send(subscribe('replacement'));
      await vi.waitFor(() => expect(replacement).toHaveBeenCalledOnce());
      const replacementStart = ctx.messages.findLastIndex(
        (message) => 'result' in message && message.result.type === 'started',
      );
      await ctx.send({
        id: 2,
        method: 'query',
        params: { path: 'marker', input: null },
      });
      await vi.waitFor(() =>
        expect(ctx.messages.some((message) => message.id === 2)).toBe(true),
      );
      expect(
        ctx.messages
          .slice(replacementStart)
          .filter((message) => 'error' in message),
      ).toEqual([]);
    } finally {
      cleanup.resolve({ done: true, value: undefined });
    }
  },
);

test.each<'resolve' | 'reject'>(['resolve', 'reject'])(
  'iteration errors wait until cleanup %ss before allowing immediate id reuse',
  async (outcome) => {
    const cleanup = createDeferred<IteratorReturnResult<undefined>>();
    const cleaning = createDeferred();
    const onError = vi.fn();
    const replacement = vi.fn(async function* () {
      yield 'replacement';
    });
    const t = initTRPC.create();
    const router = t.router({
      old: t.procedure.subscription(() => ({
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            throw new Error('iteration failed');
          },
          return: () => {
            cleaning.resolve();
            return cleanup.promise;
          },
        }),
      })),
      replacement: t.procedure.subscription(replacement),
      marker: t.procedure.query(() => 'consumed'),
    });
    await using ctx = await connectionResource({ router, onError });
    try {
      await ctx.send(subscribe('old'));
      await cleaning.promise;
      await ctx.send({
        id: 2,
        method: 'query',
        params: { path: 'marker', input: null },
      });
      await vi.waitFor(() =>
        expect(ctx.messages.some((message) => message.id === 2)).toBe(true),
      );
      expect(ctx.messages.filter((message) => message.id === 1)).toEqual([
        { id: 1, result: { type: 'started' } },
      ]);
      expect(onError).not.toHaveBeenCalled();
      let reused = false;
      ctx.client.on('message', (data) => {
        const message = parseResponse(data);
        if (message.id === 1 && 'error' in message && !reused) {
          reused = true;
          ctx.client.send(JSON.stringify(subscribe('replacement')));
        }
      });
      if (outcome === 'resolve') {
        cleanup.resolve({ done: true, value: undefined });
      } else {
        cleanup.reject(new Error('cleanup failed'));
      }
      await vi.waitFor(() => expect(replacement).toHaveBeenCalledOnce());
      expect(onError).toHaveBeenCalledOnce();
      const terminalErrors = ctx.messages.filter(
        (message) => message.id === 1 && 'error' in message,
      );
      expect(terminalErrors).toHaveLength(1);
      if (outcome === 'resolve') {
        expect(terminalErrors[0]).toMatchObject({
          error: { message: 'iteration failed' },
        });
      }
      // the error is still followed by `stopped`, as before cleanup was awaited
      const errorIndex = ctx.messages.findIndex(
        (message) => message.id === 1 && 'error' in message,
      );
      expect(ctx.messages[errorIndex + 1]).toEqual({
        id: 1,
        result: { type: 'stopped' },
      });
    } finally {
      cleanup.resolve({ done: true, value: undefined });
    }
  },
);

test('a subscription that completes does not abort its signal', async () => {
  let signal: AbortSignal | undefined;
  const t = initTRPC.create();
  const router = t.router({
    finite: t.procedure.subscription(async function* (opts) {
      signal = opts.signal;
      yield 1;
    }),
  });
  await using ctx = await connectionResource({ router });
  await ctx.send(subscribe('finite'));
  await vi.waitFor(() =>
    expect(ctx.messages.at(-1)).toEqual({ id: 1, result: { type: 'stopped' } }),
  );
  assert(signal, 'no signal received');
  expect(signal.aborted).toBe(false);
});

const abortError = () => new DOMException('request aborted', 'AbortError');

test.each([
  {
    rejection: 'an AbortError',
    reject: abortError,
    expected: null,
  },
  {
    rejection: 'an INTERNAL_SERVER_ERROR caused by an AbortError',
    reject: () =>
      new TRPCError({ code: 'INTERNAL_SERVER_ERROR', cause: abortError() }),
    expected: null,
  },
  {
    rejection: 'an unrelated error',
    reject: () => new Error('admission failed'),
    expected: { code: 'INTERNAL_SERVER_ERROR', message: 'admission failed' },
  },
  {
    rejection: 'an explicit error code caused by an AbortError',
    reject: () =>
      new TRPCError({
        code: 'BAD_REQUEST',
        message: 'admission refused',
        cause: abortError(),
      }),
    expected: { code: 'BAD_REQUEST', message: 'admission refused' },
  },
])(
  'stop during admission followed by $rejection',
  async ({ reject, expected }) => {
    const entered = createDeferred();
    const onError = vi.fn();
    const replacement = vi.fn(async function* () {
      yield 'replacement';
    });
    const t = initTRPC.create();
    const router = t.router({
      pending: t.procedure.subscription(
        async ({ signal }): Promise<AsyncIterable<never>> => {
          entered.resolve();
          await onAbort(signal);
          throw reject();
        },
      ),
      replacement: t.procedure.subscription(replacement),
    });
    await using ctx = await connectionResource({ router, onError });
    await ctx.send(subscribe('pending'));
    await entered.promise;
    await ctx.send({ id: 1, method: 'subscription.stop' });
    await vi.waitFor(() => expect(ctx.messages).toHaveLength(1));
    if (expected === null) {
      expect(ctx.messages).toEqual([{ id: 1, result: { type: 'stopped' } }]);
      expect(onError).not.toHaveBeenCalled();
    } else {
      expect(ctx.messages[0]).toMatchObject({
        id: 1,
        error: {
          message: expected.message,
          data: { code: expected.code },
        },
      });
      expect(onError).toHaveBeenCalledOnce();
    }
    await ctx.send(subscribe('replacement'));
    await vi.waitFor(() => expect(replacement).toHaveBeenCalledOnce());
  },
);

test('an admission AbortError without cancellation remains an error', async () => {
  const onError = vi.fn();
  const t = initTRPC.create();
  const router = t.router({
    pending: t.procedure.subscription((): AsyncIterable<never> => {
      throw new DOMException('unrelated abort', 'AbortError');
    }),
  });
  await using ctx = await connectionResource({ router, onError });
  await ctx.send(subscribe('pending'));
  await vi.waitFor(() => expect(ctx.messages).toHaveLength(1));
  expect(ctx.messages[0]).toMatchObject({
    id: 1,
    error: { message: 'unrelated abort' },
  });
  expect(onError).toHaveBeenCalledOnce();
});

test.each<'throw' | 'reject'>(['throw', 'reject'])(
  'iteration %s aborts before disposal that waits for cancellation',
  async (failure) => {
    const entered = createDeferred();
    const cleaning = createDeferred();
    const cleanup = createDeferred();
    const onError = vi.fn();
    let signal: AbortSignal | undefined;
    const t = initTRPC.create();
    const router = t.router({
      pending: t.procedure.subscription((opts) => {
        signal = opts.signal;
        return {
          [Symbol.asyncIterator]: () => ({
            next: () => {
              entered.resolve();
              if (failure === 'throw') throw new Error('iteration failed');
              return Promise.reject(new Error('iteration failed'));
            },
            return: async () => {
              cleaning.resolve();
              await onAbort(signal);
              await cleanup.promise;
              return doneResult();
            },
          }),
        };
      }),
    });
    await using ctx = await connectionResource({ router, onError });
    try {
      await ctx.send(subscribe('pending'));
      await entered.promise;
      await cleaning.promise;
      expect(signal?.aborted).toBe(true);
      expect(onError).not.toHaveBeenCalled();
      expect(ctx.messages.some((message) => 'error' in message)).toBe(false);
      cleanup.resolve();
      await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
      await vi.waitFor(() =>
        expect(ctx.messages.some((message) => 'error' in message)).toBe(true),
      );
    } finally {
      cleanup.resolve();
      await ctx.send({ id: 1, method: 'subscription.stop' });
    }
  },
);
