import { inferAsyncReturnType, initTRPC } from '@trpc/server';
import { awsLambdaRequestHandler } from '@trpc/server/adapters/aws-lambda';
import type { CreateAWSLambdaContextOptions } from '@trpc/server/adapters/aws-lambda';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { z } from 'zod';

function createContext({
  event,
}: CreateAWSLambdaContextOptions<APIGatewayProxyEvent>) {
  return {
    event: event,
    apiVersion: (event as { version?: string }).version || '1.0',
    user: event.headers['x-user'],
  };
}
type Context = inferAsyncReturnType<typeof createContext>;

const t = initTRPC.context<Context>().create({
  namespaceDelimiter: '/' as const,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  greet: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(({ input, ctx }) => {
      return `Greetings, ${input.name}. x-user?: ${ctx.user}.`;
    }),
  admin: router({
    dropTableUsers: publicProcedure
      .input(z.object({ doIt: z.literal(true) }))
      .mutation(({ ctx }) => {
        return `${ctx.user} has just dropped users table. what a legend!`;
      }),
  }),
});

export type AppRouter = typeof appRouter;

export const handler = awsLambdaRequestHandler({
  router: appRouter,
  createContext,
});
