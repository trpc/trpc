import type { appRouter } from './server';
import { createTRPCClient } from '@trpc/client';

async function main() {
  const whatever = createTRPCClient<typeof appRouter>({
    url: 'http://localhost:3000',
  });

  return await whatever.query('/greet', 'Lilja');
}

main();
