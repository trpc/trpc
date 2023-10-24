import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';

const client = createTRPCProxyClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:4050' })],
});

void (async () => {
  try {
    const results = await Promise.all([
      client.greet.query({ name: 'Erik', delayMs: 250 }).then((output) => {
        console.log('Got output:', results, 'at', Date.now());
        return output;
      }),

      client.greet.query({ name: 'Julian', delayMs: 1000 }).then((output) => {
        console.log('Got output:', results, 'at', Date.now());
        return output;
      }),

      client.greet.query({ name: 'Ahmed', delayMs: 2000 }).then((output) => {
        console.log('Got output:', results, 'at', Date.now());
        return output;
      }),

      client.greet.query({ name: 'Nick', delayMs: 5000 }).then((output) => {
        console.log('Got output:', results, 'at', Date.now());
        return output;
      }),
    ]);

    console.log(
      'All received at',
      Date.now(),
      'Data:',
      JSON.stringify(results, null, 2),
    );
  } catch (error) {
    console.log('error', error);
  }
})();
