import {
  createTRPCProxyClient,
  createWSClient,
  httpBatchLink,
  splitLink,
  wsLink,
} from '@trpc/client';
import superjson from 'superjson';
import { serverConfig } from '../config';
import type { AppRouter } from '../server/router';
import './polyfill';

async function start() {
  const { port, prefix } = serverConfig;
  const urlEnd = `localhost:${port}${prefix}`;
  const wsClient = createWSClient({ url: `ws://${urlEnd}` });
  const trpc = createTRPCProxyClient<AppRouter>({
    transformer: superjson,
    links: [
      splitLink({
        condition(op) {
          return op.type === 'subscription';
        },
        true: wsLink({ client: wsClient }),
        false: httpBatchLink({ url: `http://${urlEnd}` }),
      }),
    ],
  });

  const version = await trpc.api.version.query();
  console.log('>>> anon:version:', version);

  const hello = await trpc.api.hello.query();
  console.log('>>> anon:hello:', hello);

  const postList = await trpc.posts.list.query();
  console.log('>>> anon:posts:list:', postList);

  await trpc.posts.reset.mutate();

  let randomNumberCount = 0;

  await new Promise<void>((resolve) => {
    const sub = trpc.sub.randomNumber.subscribe(undefined, {
      onData(data) {
        console.log('>>> anon:sub:randomNumber:received:', data);
        randomNumberCount++;

        if (randomNumberCount > 3) {
          sub.unsubscribe();
          resolve();
        }
      },
      onError(error) {
        console.error('>>> anon:sub:randomNumber:error:', error);
      },
      onComplete() {
        console.log('>>> anon:sub:randomNumber:', 'unsub() called');
      },
    });
  });

  // we're done - make sure app closes with a clean exit
  wsClient.close();
}

start();
