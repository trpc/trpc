import { createTRPCClient } from '@trpc/client';
import fetch from 'node-fetch';
import type { AppRouter } from '../server';

global.fetch = fetch as any;

const client = createTRPCClient<AppRouter>({
  url: 'http://localhost:2022',
});

// Type safe
async function main() {
  const result = await client.query('greeting', 'there');

  console.log(result);
}

main();
