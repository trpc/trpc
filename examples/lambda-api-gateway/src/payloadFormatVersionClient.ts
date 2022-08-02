import { createTRPCClient, createTRPCClientProxy } from '@trpc/client';
import fetch from 'node-fetch';
import type { AppRouter } from './server';

global.fetch = fetch as any;

const httpApiClient = createTRPCClient<AppRouter>({
  url: 'http://127.0.0.1:4050',
});
const httpApiProxy = createTRPCClientProxy(httpApiClient);
const restApiClient = createTRPCClient<AppRouter>({
  url: 'http://127.0.0.1:4050/dev',
});
const restApiProxy = createTRPCClientProxy(restApiClient);

(async () => {
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
