import * as trpc from '@trpc/server';
import {
  createApiGatewayHandler,
  CreateLambdaContextOptions,
} from '@trpc/server/adapters/aws-lambda';
import { inferAsyncReturnType } from '@trpc/server/src';
import { z } from 'zod';

function createContext(opts: CreateLambdaContextOptions) {
  return {
    req: opts.req,
  };
}
type Context = inferAsyncReturnType<typeof createContext>;

const appRouter = trpc.router<Context>().query('/greet', {
  input: z.string(),
  async resolve(req) {
    return `Greetings, ${req.input}`;
  },
});
export type AppRouter = typeof appRouter;

export const handler = createApiGatewayHandler({
  router: appRouter,
  createContext,
});
