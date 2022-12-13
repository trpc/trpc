import {
  createBaseTRPCClient,
  createTRPCClient,
  createTRPCClientProxy,
} from '@trpc/client';
import fetch from 'node-fetch';
import type { AppRouter } from './server';

global.fetch = fetch as any;

const client = createTRPCClient<AppRouter>({ url: 'http://127.0.0.1:4050' });
const proxy = createTRPCClientProxy(client);

(async () => {
  try {
    const q = await proxy.greet.query({ name: 'asdd' });
    console.log(q);
  } catch (error) {
    console.log('error', error);
  }
})();
