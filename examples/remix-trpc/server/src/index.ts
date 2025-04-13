import { createExpressMiddleware } from '@trpc/server/adapters/express';
import cors from 'cors';
import express from 'express';
import { appRouter } from './trpc/index.js';

const app = express();
const PORT = process.env.PORT ?? 3010;

app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST'],
  }),
);

app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext: () => ({}),
  }),
);

app.listen(PORT, () => {
  console.log(`🚀 tRPC API running at http://localhost:${PORT}/trpc`);
});
