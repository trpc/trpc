import * as trpc from '@trpc/server';
import { awsLambdaRequestHandler } from '@trpc/server/adapters/aws-lambda';
import type { CreateAWSLambdaContextOptions } from '@trpc/server/adapters/aws-lambda';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { z } from 'zod';

function createContext({
  event,
  context,
}: CreateAWSLambdaContextOptions<APIGatewayProxyEvent>) {
  return {
    event: event,
    apiVersion: (event as { version?: string }).version || '1.0',
    user: event.headers['x-user'],
  };
}
type Context = trpc.inferAsyncReturnType<typeof createContext>;

const appRouter = trpc.router<Context>().query('greet', {
  input: z.object({
    name: z.string(),
  }),
  async resolve(req) {
    return `Greetings, ${req.input.name}. x-user?: ${req.ctx.user}. `;
  },
});
export type AppRouter = typeof appRouter;

export const handler = awsLambdaRequestHandler({
  router: appRouter,
  createContext,
});
