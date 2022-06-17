import { createTRPCClient } from '@trpc/client';
import fetch from 'node-fetch';
import type { AppRouter } from './server';

global.fetch = fetch as any;

const client = createTRPCClient<AppRouter>({ url: 'http://127.0.0.1:4050' });

(async () => {
  try {
    const q = await client.query('greet', { name: 'Erik' });
    console.log(q);
  } catch (error) {
    console.log('error', error);
  }
})();
