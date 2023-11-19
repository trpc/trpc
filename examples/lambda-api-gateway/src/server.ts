import { initTRPC } from '@trpc/server';
import type { CreateAWSLambdaContextOptions } from '@trpc/server/adapters/aws-lambda';
import { awsLambdaRequestHandler } from '@trpc/server/adapters/aws-lambda';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { z } from 'zod';

function createContext({
  event,
  context,
}: CreateAWSLambdaContextOptions<APIGatewayProxyEvent>) {
  return {
    event: event,
    apiVersion: (event as { version?: string }).version ?? '1.0',
    user: event.headers['x-user'],
  };
}
type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  greet: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(({ input, ctx }) => {
      return `Greetings, ${input.name}. x-user?: ${ctx.user}.`;
    }),
});

export type AppRouter = typeof appRouter;

export const handler = awsLambdaRequestHandler({
  router: appRouter,
  createContext,
});
