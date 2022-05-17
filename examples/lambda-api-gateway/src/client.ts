import { CreateTRPCClientOptions, createTRPCClient } from '@trpc/client';
import fetch from 'node-fetch';
import type { AppRouter } from './server';

global.fetch = fetch as any;

const opts: CreateTRPCClientOptions<AppRouter> = {
  url: 'http://127.0.0.1:8080',
};
const client = createTRPCClient<AppRouter>(opts);

(async () => {
  try {
    const q = client.query('/greet', {
      name: 'Erik',
    });
    console.log(await q);
  } catch (error) {
    console.log('error', error);
  }
})();
