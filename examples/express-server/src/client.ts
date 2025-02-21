import {
  createTRPCClient,
  httpBatchLink,
  httpLink,
  loggerLink,
} from '@trpc/client';
import { tap } from '@trpc/server/observable';
import transformer from 'superjson';
import type { AppRouter } from './server';

const sleep = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const url = `http://localhost:2021/trpc`;

  const trpc = createTRPCClient<AppRouter>({
    links: [
      () =>
        ({ op, next }) => {
          console.log('->', op.type, op.path, op.input);

          return next(op).pipe(
            tap({
              next(result) {
                console.log('<-', op.type, op.path, op.input, ':', result);
              },
            }),
          );
        },
      httpLink({ url, transformer }),
    ],
  });

  const res = await trpc.dateMutation.mutate({ date: new Date() });
  console.log({
    res,
    isDate: res.date instanceof Date,
  });

  console.log('👌 should be a clean exit if everything is working right');
}

void main();
