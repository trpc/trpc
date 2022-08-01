import { createExpressMiddleware } from '@trpc/server/adapters/express';
import express from 'express';
import { appRouter } from './router';

async function main() {
  // express implementation
  const app = express();

  app.use(
    '/trpc',
    createExpressMiddleware({
      router: appRouter,
      createContext: () => ({}),
    }),
  );
  app.listen(2021);
}

main();
