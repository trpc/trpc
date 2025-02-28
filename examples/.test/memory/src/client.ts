import { createTRPCClient, unstable_httpBatchStreamLink } from '@trpc/client';
import type { AppRouter } from './server.js';

const client = createTRPCClient<AppRouter>({
  links: [unstable_httpBatchStreamLink({ url: 'http://localhost:3000' })],
});

await client.hello.query();
