import { EventEmitter } from 'node:events';
import { routerToServerAndClientNew } from './___testHelpers';
import { suppressLogsUntil } from '@trpc/server/__tests__/suppressLogs';
import { waitFor } from '@testing-library/react';
import type { TRPCLink } from '@trpc/client';
import {
  retryLink,
  splitLink,
  unstable_httpBatchStreamLink,
  unstable_httpSubscriptionLink,
} from '@trpc/client';
import { initTRPC, tracked, TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { EventSourcePolyfill } from 'event-source-polyfill';
import { konn } from 'konn';
import superjson from 'superjson';
import { z } from 'zod';

const sleep = (ms = 1) => new Promise((resolve) => setTimeout(resolve, ms));

const orderedResults: number[] = [];
const ctx = konn()
  .beforeEach(() => {
    //
    // This is the heart of the test, the client will send this along and the server
    // will increment it on each createContext(). If the latest version is
    // always sent then the server will always receive the latest version
    let incrementingTestHeader = 1;

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
            let idx = opts.input.lastEventId ?? -1;
            while (true) {
              idx++;
              yield tracked(String(idx), idx);
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

    const recreateOnErrorTypes: string[] = [];

    const opts = routerToServerAndClientNew(router, {
      server: {
        onError(_err) {
          // console.error('caught server error:', _err.error.message);
        },
        createContext(opts) {
          // console.log(
          //   'new connection made with x-test:',
          //   opts.req.headers['x-test'],
          //   'expecting to be to be:',
          //   incrementingTestHeader,
          // );

          const expectedHeader = `x-test: ${incrementingTestHeader}`;
          const receivedHeader = `x-test: ${opts.req.headers['x-test']}`;
          if (expectedHeader !== receivedHeader) {
            throw new TRPCError({
              code: 'UNAUTHORIZED',
              message: 'x-test header mismatch. this means the test has failed',
            });
          }

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
              true: [
                retryLink({
                  retry(opts) {
                    const { error } = opts;
                    const code = error.data?.code;
                    if (!code) {
                      return false;
                    }

                    if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') {
                      // console.log(
                      //   'Restarting EventSource due to 401/403 error',
                      // );
                      return true;
                    }
                    return false;
                  },
                }),
                unstable_httpSubscriptionLink({
                  url: opts.httpUrl,
                  transformer: superjson,
                  EventSource: EventSourcePolyfill,
                  eventSourceOptions() {
                    return {
                      headers: {
                        'x-test': String(incrementingTestHeader),
                      },
                    };
                  },
                }),
              ],
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

test('disconnect and reconnect with updated headers', async () => {
  const { client } = ctx;

  const onStarted =
    vi.fn<(args: { context: Record<string, unknown> | undefined }) => void>();

  const aggregate: number[] = [];
  const onData = vi.fn<(args: { data: number; id: string }) => void>(
    ({ data }) => {
      aggregate.push(data);
    },
  );
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

  function getES() {
    const lastCall = onStarted.mock.calls.at(-1)!;
    // @ts-expect-error lint makes this accessing annoying
    const es = lastCall[0].context?.eventSource;
    assert(es instanceof EventSource);

    return es;
  }

  await waitFor(() => {
    expect(onData.mock.calls.length).toBeGreaterThan(5);
  });

  expect(onData.mock.calls[0]![0]).toEqual({
    data: 0,
    id: '0',
  });

  expect(ctx.onIterableInfiniteSpy).toHaveBeenCalledTimes(1);

  expect(onStarted).toHaveBeenCalledTimes(1);
  expect(getES().readyState).toBe(EventSource.OPEN);

  await suppressLogsUntil(async () => {
    ctx.destroyConnections();
    await waitFor(
      () => {
        expect(onStarted).toHaveBeenCalledTimes(3);
      },
      {
        timeout: 3_000,
      },
    );

    await waitFor(
      () => {
        expect(getES().readyState).toBe(EventSource.OPEN);
      },
      {
        timeout: 3_000,
      },
    );
  });

  subscription.unsubscribe();
  expect(getES().readyState).toBe(EventSource.CLOSED);

  // const lastEventId = onData.mock.calls.at(-1)[0]![0]!
  await waitFor(() => {
    expect(ctx.onReqAborted).toHaveBeenCalledTimes(1);
  });
  await sleep(50);
  ctx.infiniteYields.mockClear();
  await sleep(50);
  expect(ctx.infiniteYields).toHaveBeenCalledTimes(0);

  // Find numbers that appear more than once in the data
  const numbers = onData.mock.calls.map((call) => call[0].data);
  const duplicates = numbers.filter(
    (num, index) => numbers.indexOf(num) !== index,
  );
  const uniqueDuplicates = [...new Set(duplicates)];
  expect(uniqueDuplicates).toEqual([]);
});
