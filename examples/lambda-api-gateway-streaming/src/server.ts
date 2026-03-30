import { initTRPC } from '@trpc/server';
import type { CreateAWSLambdaContextOptions } from '@trpc/server/adapters/aws-lambda';
import { awsLambdaStreamingRequestHandler } from '@trpc/server/adapters/aws-lambda';
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
  greet: publicProcedure.input(z.object({ name: z.string() })).query((opts) => {
    return `Greetings, ${opts.input.name}. x-user?: ${opts.ctx.user}.`;
  }),
  iterable: publicProcedure.query(async function* () {
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      yield i;
    }
  }),
  deferred: publicProcedure
    .input(
      z.object({
        wait: z.number(),
      }),
    )
    .query(async (opts) => {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, opts.input.wait * 10),
      );
      return opts.input.wait;
    }),
});

export type AppRouter = typeof appRouter;

export const handler = awslambda.streamifyResponse(
  awsLambdaStreamingRequestHandler({
    router: appRouter,
    createContext,
  }),
);
