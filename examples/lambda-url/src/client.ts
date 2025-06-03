import {
  createTRPCClient,
  httpBatchStreamLink,
  loggerLink,
} from '@trpc/client';
import type { AppRouter } from './server';

const client = createTRPCClient<AppRouter>({
  links: [
    loggerLink({
      enabled: (opts) => opts.direction === 'down',
    }),
    httpBatchStreamLink({
      url: 'YOUR_LAMBDA_URL', // Insert your Lambda URL after deploying the serverless app
    }),
  ],
});

void (async () => {
  try {
    const q = await client.greet.query({ name: 'Erik' });
    console.log(q);

    const deferred = await Promise.all([
      client.deferred.query({ wait: 3 }),
      client.deferred.query({ wait: 1 }),
      client.deferred.query({ wait: 2 }),
    ]);
    console.log('Deferred:', deferred);

    const iterable = await client.iterable.query();
    for await (const i of iterable) {
      console.log('Iterable:', i);
    }
  } catch (error) {
    console.log('error', error);
  }
})();
