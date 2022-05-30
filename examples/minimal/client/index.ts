import { createTRPCClient } from '@trpc/client';
import fetch from 'node-fetch';
import type { AppRouter } from '../server';

global.fetch = fetch as any;

const client = createTRPCClient<AppRouter>({
  url: 'http://localhost:2021',
});

// Type safe
client.query('hello', 'world').then((res) => console.log(res.message));
