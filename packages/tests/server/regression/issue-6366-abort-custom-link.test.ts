import type { TRPCLink } from '@trpc/client';
import { createTRPCClient } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';

type Maybe<T> = T | null | undefined;

/**
 * Like `Promise.race` but for abort signals
 *
 * Basically, a ponyfill for
 * [`AbortSignal.any`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static).
 */
export function raceAbortSignals(
  ...signals: Maybe<AbortSignal>[]
): AbortSignal {
  const ac = new AbortController();

  for (const signal of signals) {
    if (signal?.aborted) {
      ac.abort();
    } else {
      signal?.addEventListener('abort', () => ac.abort(), { once: true });
    }
  }

  return ac.signal;
}

test('abort', async () => {
  const t = initTRPC.create({ isServer: true });

  const appRouter = t.router({
    testSubscribe: t.procedure.subscription(async function* () {
      yield 1;
      yield 2;
      yield 3;
    }),
  });

  function mockLink<TRouter extends AnyRouter>(): TRPCLink<TRouter> {
    return () => {
      return ({ op }) => {
        return observable(() => {
          const ac = new AbortController();

          // This combined signal can be used for e.g. a `fetch()`-request
          const combinedSignal = raceAbortSignals(op.signal, ac.signal);

          console.log('the passed in signal:', op.signal);

          combinedSignal.addEventListener(
            'abort',
            () => {
              console.log('aborted signal');
            },
            { once: true },
          );

          return () => {
            // subscription.unsubscribe() was called
            console.log('unsubscribed');

            ac.abort();
          };
        });
      };
    };
  }
  const trpcClient = createTRPCClient<typeof appRouter>({
    links: [mockLink()],
  });

  const abort = trpcClient.testSubscribe.subscribe(undefined, {
    signal: new AbortController().signal, // <--- you can pass a custom signal here
  });
  abort.unsubscribe(); // Will call the abort signal
});
