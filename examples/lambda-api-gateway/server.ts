import * as trpc from '@trpc/server';
import { z } from 'zod';
import { APIGatewayProxyHandler, APIGatewayProxyEvent } from 'aws-lambda';
import {
  createApiGatewayHandler,
  CreateLambdaContextOptions,
} from '@trpc/server/adapters/aws-lambda';
import { inferAsyncReturnType } from '@trpc/server/src';

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

// TODO: This is not any!
export const handler = createApiGatewayHandler({
  router: appRouter,
  createContext,
});

export const lambdaHandler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
) => await handler(event);
