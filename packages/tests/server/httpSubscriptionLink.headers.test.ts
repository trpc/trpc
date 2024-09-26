import { EventEmitter, on } from 'node:events';
import { routerToServerAndClientNew, suppressLogs } from './___testHelpers';
import { waitFor } from '@testing-library/react';
import type { TRPCLink } from '@trpc/client';
import {
  splitLink,
  unstable_httpBatchStreamLink,
  unstable_httpSubscriptionLink,
} from '@trpc/client';
import { initTRPC, tracked } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import type { EventSourcePolyfillInit } from 'event-source-polyfill';
import { EventSourcePolyfill, NativeEventSource } from 'event-source-polyfill';
import { konn } from 'konn';
import superjson from 'superjson';
import { z } from 'zod';

const sleep = (ms = 1) => new Promise((resolve) => setTimeout(resolve, ms));

const orderedResults: number[] = [];
const ctx = konn()
  .beforeEach(() => {
    let incrementingTestHeader = 1;

    globalThis.EventSource = EventSourcePolyfill as typeof EventSource;

    const onIterableInfiniteSpy =
      vi.fn<(args: { input: { lastEventId?: number } }) => void>();

    const ee = new EventEmitter();
    const eeEmit = (data: number | Error) => {
      ee.emit('data', data);
    };

    const t = initTRPC.create({
      transformer: superjson,
    });
    orderedResults.length = 0;
    const infiniteYields = vi.fn();

    const router = t.router({
      sub: {
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
              yield tracked(String(idx), idx);
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
      server: {
        onError(err) {
          // eslint-disable-next-line no-console
          console.error('caught server error', err);
        },
        createContext(opts) {
          // eslint-disable-next-line no-console
          console.log(
            'new connection made with x-test:',
            opts.req.headers['x-test'],
            'expecting to be to be:',
            incrementingTestHeader,
          );
          debugger;
          const expectedHeader = `x-test: ${incrementingTestHeader}`;
          const receivedHeader = `x-test: ${opts.req.headers['x-test']}`;
          expect(receivedHeader).toBe(String(expectedHeader));

          // Increment header so next time a connection is made we expect this version
          incrementingTestHeader++;

          return {};
        },
      },
      client(opts) {
        return {
          links: [
            linkSpy,
            splitLink({
              condition: (op) => op.type === 'subscription',
              true: unstable_httpSubscriptionLink({
                url: opts.httpUrl,
                transformer: superjson,
                eventSourceOptions() {
                  return {
                    headers: {
                      'x-test': String(incrementingTestHeader),
                    },
                  } as EventSourcePolyfillInit;
                },
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
    globalThis.EventSource = NativeEventSource as typeof EventSource;
  })
  .done();

test('disconnect and reconnect with updated headers', async () => {
  const { client } = ctx;

  const onStarted =
    vi.fn<(args: { context: Record<string, unknown> | undefined }) => void>();
  const onData = vi.fn<(args: { data: number; id: string }) => void>();
  const subscription = client.sub.iterableInfinite.subscribe(
    {},
    {
      onStarted: onStarted,
      onData,
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

  expect(onData.mock.calls[0]![0]).toEqual({
    data: 0,
    id: '0',
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
