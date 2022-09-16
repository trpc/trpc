import {
  createTRPCProxyClient,
  createWSClient,
  httpBatchLink,
  splitLink,
  wsLink,
} from '@trpc/client';
import { serverConfig } from '../config';
import { AppRouter } from '../server/router';
import './polyfill';

async function start() {
  const { port, prefix } = serverConfig;
  const urlSuffix = `localhost:${port}/${prefix}`;
  const wsClient = createWSClient({ url: `ws://${urlSuffix}` });
  const trpc = createTRPCProxyClient<AppRouter>({
    links: [
      splitLink({
        condition(op) {
          return op.type === 'subscription';
        },
        true: wsLink({ client: wsClient }),
        false: httpBatchLink({ url: `http://${urlSuffix}` }),
      }),
    ],
  });

  const version = await trpc.api.version.query();
  console.log('>>> anon:version:', version);

  const anonHello = await trpc.api.hello.query();
  console.log('>>> anon:hello:', anonHello);

  const anonPostsList = await trpc.posts.list.query();
  console.log('>>> anon:posts:list:', anonPostsList);

  await trpc.posts.reset.query();

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

// Should outputs something like:
// >>> anon:version: { version: '0.42.0' }
// >>> anon:hello: { text: 'hello anonymous' }
// >>> auth:hello: { text: 'hello nyan' }
// >>> anon:hello(with input): { text: 'hello you' }
// >>> anon:posts:create:error: UNAUTHORIZED
// >>> auth:posts:create:success: { id: 1, title: 'My first post' }
// >>> anon:posts:list: [ { id: 1, title: 'My first post' } ]
// >>> anon:sub:randomNumber:received: { type: 'started' }
// >>> anon:sub:randomNumber:received: { type: 'data', data: { randomNumber: 0.4002197581455267 } }
// >>> anon:sub:randomNumber:received: { type: 'data', data: { randomNumber: 0.7066840380142223 } }
// >>> anon:sub:randomNumber:received: { type: 'data', data: { randomNumber: 0.20896433661111224 } }
// >>> anon:sub:randomNumber: unsub() called
