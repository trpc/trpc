import * as trpc from '@trpc/server/src';
import { z } from 'zod';
import { APIGatewayProxyHandler, APIGatewayProxyEvent } from 'aws-lambda';
// TODO: Fix this stupid relative import
import { createApiGatewayHandler } from '@trpc/server/adapters/aws-lambda';

type LambdaContext = {
  authHeader?: string;
};
export const appRouter = trpc.router<LambdaContext>().query('/greet', {
  input: z.string(),
  async resolve(req) {
    return `Greetings, ${req.input}`;
  },
});

export const handler = createApiGatewayHandler({
  router: appRouter,
  createContext: (event: APIGatewayProxyEvent) =>
    Promise.resolve({ authHeader: event.headers['Authorization'] }),
});

export const lambdaHandler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
) => await handler(event);
