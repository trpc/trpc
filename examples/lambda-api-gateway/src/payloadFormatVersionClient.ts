import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';

const httpApiProxy = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:4050' })],
});
const restApiProxy = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:4050/dev' })],
});

void (async () => {
  try {
    // A Very simple client to test showcase both APIGW v1(Rest API) and v2(HTTP API) support with serverless-offline
    const queryForVersion2 = await httpApiProxy.greet.query({
      name: 'queryForVersion2',
    });
    console.log(queryForVersion2);
    const queryForVersion1 = await restApiProxy.greet.query({
      name: 'queryForVersion1',
    });
    console.log(queryForVersion1);
  } catch (error) {
    console.log('error', error);
  }
})();
