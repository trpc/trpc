import * as trpc from '@trpc/server';
import { lambdaRequestHandler } from '@trpc/server/adapters/lambda';
import type { CreateLambdaContextOptions } from '@trpc/server/adapters/lambda';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { z } from 'zod';

function createContext({
  event,
  context,
}: CreateLambdaContextOptions<APIGatewayProxyEvent>) {
  return {
    event: event,
    apiVersion: (event as { version?: string }).version || '1.0',
    user: event.headers['x-user'],
  };
}
type Context = trpc.inferAsyncReturnType<typeof createContext>;

const appRouter = trpc
  .router<Context>()
  .query('greet', {
    input: z.object({
      name: z.string(),
    }),
    async resolve(req) {
      return `Greetings, ${req.input.name}. x-user?: ${req.ctx.user}. `;
    },
  })
  .query('payloadFormatVersion', {
    input: z.object({}),
    async resolve(req) {
      return `You are using payload format ${req.ctx.apiVersion}`;
    },
  });
export type AppRouter = typeof appRouter;

export const handler = lambdaRequestHandler({
  router: appRouter,
  createContext: createContext,
});
