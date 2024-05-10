import { createExpressMiddleware } from '@trpc/server/adapters/express';
import express from 'express';
import { appRouter } from './router';

async function main() {
  // express implementation
  const app = express();

  // For testing purposes, wait-on requests '/'
  app.get('/', (_req, res) => res.send('Server is running!'));

  app.use(
    '/trpc',
    createExpressMiddleware({
      router: appRouter,
    }),
  );
  app.listen(3000);
}

void main();
