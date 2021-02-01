/* eslint-disable @typescript-eslint/no-explicit-any */
import AbortController from 'abort-controller';
import fetch from 'node-fetch';

// polyfill fetch
global.AbortController = AbortController;
global.fetch = fetch as any;

import { createTRPCClient } from '@trpc/client';
import type { AppRouter } from './server';

async function main() {
  const client = createTRPCClient<AppRouter>({
    url: `http://localhost:2022`,
  });

  const res = await client.query('hello', {
    name: 'world',
  });

  console.log('res', res);
}

main();
