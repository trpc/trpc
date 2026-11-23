import { EventEmitter, on } from 'node:events';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { httpSubscriptionLink, TRPCClientError } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { makeResource } from '@trpc/server/unstable-core-do-not-import';

test.each(['data', 'serialized-error'])(
  'reports %s deserialization errors and closes the subscription',
  async (event) => {
    const ee = new EventEmitter();
    const transformer = {
      serialize: (value: unknown) => value,
      deserialize: (value: unknown) => value,
    };
    const t = initTRPC.create({ transformer });
    const router = t.router({
      events: t.procedure.subscription(async function* (opts) {
        for await (const _ of on(ee, 'next', { signal: opts.signal })) {
          if (event === 'serialized-error') {
            throw new Error('Server error');
          }
          yield 'value';
        }
      }),
    });
    const error = new Error('Cannot decode payload');
    await using ctx = testServerAndClientResource(router, {
      client: (opts) => ({
        links: [
          httpSubscriptionLink({
            url: opts.httpUrl,
            transformer: {
              input: transformer,
              output: {
                ...transformer,
                deserialize() {
                  throw error;
                },
              },
            },
          }),
        ],
      }),
    });
    const onError = vi.fn();
    const onData = vi.fn();
    const subscription = ctx.client.events.subscribe(undefined, {
      onError,
      onData,
    });
    using _subscription = makeResource(subscription, () =>
      subscription.unsubscribe(),
    );

    await vi.waitFor(() => expect(ee.listenerCount('next')).toBe(1));
    ee.emit('next');

    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(TRPCClientError);
    expect(onError.mock.calls[0]![0].cause).toBe(error);
    expect(onData).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(ee.listenerCount('next')).toBe(0));
    if (event === 'data') {
      expect(ctx.onReqAborted).toHaveBeenCalledTimes(1);
    }
  },
);
