import * as trpc from '@trpc/server';
import { lambdaRequestHandler } from '@trpc/server/adapters/lambda/index';
import type { CreateLambdaContextOptions } from '@trpc/server/adapters/lambda/index';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { z } from 'zod';

function createContext({
  event,
  context,
}: CreateLambdaContextOptions<APIGatewayProxyEvent>) {
  return {
    event: event,
    user: event.headers['x-user'],
  };
}
type Context = trpc.inferAsyncReturnType<typeof createContext>;

const appRouter = trpc.router<Context>().query('/greet', {
  input: z.object({
    name: z.string(),
  }),
  async resolve(req) {
    return `Greetings, ${req.input.name}. x-user?: ${req.ctx.user}`;
  },
});
export type AppRouter = typeof appRouter;

export const handler = lambdaRequestHandler({
  router: appRouter,
  createContext: createContext,
});
