import { EventEmitter, on } from 'node:events';
import { routerToServerAndClientNew, suppressLogs } from './___testHelpers';
import { waitFor } from '@testing-library/react';
import type { TRPCLink } from '@trpc/client';
import {
  splitLink,
  unstable_httpBatchStreamLink,
  unstable_httpSubscriptionLink,
} from '@trpc/client';
import { initTRPC, sse } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { konn } from 'konn';
import superjson from 'superjson';
import { z } from 'zod';

const sleep = (ms = 1) => new Promise((resolve) => setTimeout(resolve, ms));

const orderedResults: number[] = [];
const ctx = konn()
  .beforeEach(() => {
    const onIterableInfiniteSpy = vi.fn<
      [
        {
          input: {
            lastEventId?: number;
          };
        },
      ]
    >();
    const ee = new EventEmitter();
    const eeEmit = (data: number) => {
      ee.emit('data', data);
    };

    const t = initTRPC.create({
      transformer: superjson,
    });
    orderedResults.length = 0;
    const infiniteYields = vi.fn();

    const router = t.router({
      sub: {
        iterableEvent: t.procedure.subscription(async function* () {
          for await (const data of on(ee, 'data')) {
            const num = data[0] as number;
            yield num;
          }
        }),

        iterableInfinite: t.procedure
          .input(
            z.object({
              lastEventId: z.coerce.number().min(0).optional(),
            }),
          )
          .subscription(async function* (opts) {
            onIterableInfiniteSpy({
              input: opts.input,
            });
            let idx = opts.input.lastEventId ?? 0;
            while (true) {
              yield sse({
                id: idx,
                data: idx,
              });
              idx++;
              await sleep();
              infiniteYields();
            }
          }),
      },
    });

    const linkSpy: TRPCLink<typeof router> = () => {
      // here we just got initialized in the app - this happens once per app
      // useful for storing cache for instance
      return ({ next, op }) => {
        // this is when passing the result to the next link
        // each link needs to return an observable which propagates results
        return observable((observer) => {
          const unsubscribe = next(op).subscribe({
            next(value) {
              orderedResults.push(value.result.data as number);
              observer.next(value);
            },
            error: observer.error,
          });
          return unsubscribe;
        });
      };
    };
    const opts = routerToServerAndClientNew(router, {
      server: {},
      client(opts) {
        return {
          links: [
            linkSpy,
            splitLink({
              condition: (op) => op.type === 'subscription',
              true: unstable_httpSubscriptionLink({
                url: opts.httpUrl,
                transformer: superjson,
              }),
              false: unstable_httpBatchStreamLink({
                url: opts.httpUrl,
                transformer: superjson,
              }),
            }),
          ],
        };
      },
    });
    return {
      ...opts,
      ee,
      eeEmit,
      infiniteYields,
      onIterableInfiniteSpy,
    };
  })
  .afterEach(async (opts) => {
    await opts?.close?.();
  })
  .done();

test('iterable', async () => {
  const { client } = ctx;

  const onStarted = vi.fn<[]>();
  const onData = vi.fn<{ data: number }[]>();
  const subscription = client.sub.iterableEvent.subscribe(undefined, {
    onStarted: onStarted,
    onData,
  });

  await waitFor(
    () => {
      expect(onStarted).toHaveBeenCalledTimes(1);
    },
    {
      timeout: 3_000,
    },
  );

  ctx.eeEmit(1);
  ctx.eeEmit(2);

  await waitFor(() => {
    expect(onData).toHaveBeenCalledTimes(2);
  });
  expect(onData.mock.calls).toMatchInlineSnapshot(`
        Array [
          Array [
            Object {
              "data": 1,
            },
          ],
          Array [
            Object {
              "data": 2,
            },
          ],
        ]
      `);

  expect(ctx.ee.listenerCount('data')).toBe(1);

  subscription.unsubscribe();

  await waitFor(() => {
    expect(ctx.onReqAborted).toHaveBeenCalledTimes(1);
  });

  ctx.eeEmit(4);
  ctx.eeEmit(5);

  await waitFor(() => {
    expect(ctx.ee.listenerCount('data')).toBe(0);
  });
});

test('disconnect and reconnect with an event id', async () => {
  const { client } = ctx;

  const onStarted = vi.fn<
    [
      {
        context: Record<string, unknown> | undefined;
      },
    ]
  >();
  const onData = vi.fn<{ data: number }[]>();
  const subscription = client.sub.iterableInfinite.subscribe(
    {},
    {
      onStarted: onStarted,
      onData: onData,
    },
  );

  await waitFor(() => {
    expect(onStarted).toHaveBeenCalledTimes(1);
  });

  // @ts-expect-error lint makes this accessing annoying
  const es = onStarted.mock.calls[0]![0].context?.eventSource;
  assert(es instanceof EventSource);

  await waitFor(() => {
    expect(onData.mock.calls.length).toBeGreaterThan(5);
  });

  expect(ctx.onIterableInfiniteSpy).toHaveBeenCalledTimes(1);

  expect(es.readyState).toBe(EventSource.OPEN);
  const release = suppressLogs();
  ctx.destroyConnections();
  await waitFor(() => {
    expect(es.readyState).toBe(EventSource.CONNECTING);
  });
  release();

  await waitFor(
    () => {
      expect(es.readyState).toBe(EventSource.OPEN);
    },
    {
      timeout: 3_000,
    },
  );
  expect(ctx.onIterableInfiniteSpy).toHaveBeenCalledTimes(2);
  const lastCall = ctx.onIterableInfiniteSpy.mock.calls.at(-1)![0];

  expect(lastCall.input.lastEventId).toBeGreaterThan(5);

  subscription.unsubscribe();
  expect(es.readyState).toBe(EventSource.CLOSED);

  // const lastEventId = onData.mock.calls.at(-1)[0]![0]!
  await waitFor(() => {
    expect(ctx.onReqAborted).toHaveBeenCalledTimes(1);
  });
  await sleep(50);
  ctx.infiniteYields.mockClear();
  await sleep(50);
  expect(ctx.infiniteYields).toHaveBeenCalledTimes(0);
});
