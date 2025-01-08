import type { TRPCLink } from '@trpc/client';
import { createTRPCClient } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';

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
          console.log('op', op);
          console.log('signal', op.signal); // the signal from L37

          return () => {
            console.log('unsubscribed');
          };
        });
      };
    };
  }
  const trpcClient = createTRPCClient<typeof appRouter>({
    links: [mockLink()],
  });

  const abort = trpcClient.testSubscribe.subscribe(undefined, {
    signal: new AbortController().signal, // <--- you can pass a signal here
  });
  abort.unsubscribe(); // <-- Can't detect this in the link in any way as far as I can tell
});
