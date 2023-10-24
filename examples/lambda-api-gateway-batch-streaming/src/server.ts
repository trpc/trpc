import { inferAsyncReturnType, initTRPC } from '@trpc/server';
import { experimental_awsLambdaStreamingRequestHandler } from '@trpc/server/adapters/aws-lambda';
import type { CreateAWSLambdaContextOptions } from '@trpc/server/adapters/aws-lambda';
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
type Context = inferAsyncReturnType<typeof createContext>;

const t = initTRPC.context<Context>().create();

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  greet: publicProcedure
    .input(z.object({ name: z.string(), delayMs: z.number() }))
    .query(async ({ input, ctx }) => {
      await new Promise((resolve) => {
        setTimeout(resolve, input.delayMs);
      });

      return `Greetings, ${input.name}. x-user?: ${ctx.user}. It has been ${input.delayMs}ms since your message`;
    }),
});

export type AppRouter = typeof appRouter;

export const handler = experimental_awsLambdaStreamingRequestHandler({
  router: appRouter,
  createContext,
  batching: {
    enabled: true,
  },
});
