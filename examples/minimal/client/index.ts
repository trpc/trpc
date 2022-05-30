import { createTRPCClient } from '@trpc/client';

import type { AppRouter } from '../server';

// polyfill fetch
import fetch from 'node-fetch';
global.fetch = fetch as any;

const client = createTRPCClient<AppRouter>({
  url: 'http://localhost:2021',
});

// Type safe
client.query('hello', 'world').then((res) => console.log(res.message));
