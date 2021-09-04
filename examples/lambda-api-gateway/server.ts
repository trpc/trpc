import * as trpc from '@trpc/server/src';
import { z } from 'zod';
import { APIGatewayProxyHandler, APIGatewayProxyEvent } from 'aws-lambda';
import { createApiGatewayHandler, LambdaTRPCContext } from '@trpc/server/adapters/aws-lambda';

type LambdaContext = {
  authHeader?: string;
};
export const appRouter = trpc.router<LambdaContext>().query('/greet', {
  input: z.string(),
  async resolve(req) {
    return `Greetings, ${req.input}`;
  },
});
export type AppRouter = typeof appRouter

const args = {
  router: appRouter,
  createContext: async (event: APIGatewayProxyEvent) => ({ authHeader: event.headers['Authorization'] }),
}

// TODO: This is not any!
export const handler = createApiGatewayHandler(args as any);

export const lambdaHandler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
) => await handler(event);
