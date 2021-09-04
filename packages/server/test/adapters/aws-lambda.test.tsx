/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import * as trpc from '../../src';
import * as trpcLambda from '../../src/adapters/aws-lambda';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { mockAPIGatewayProxyEvent } from './aws-lambda.utils';

type Context = {
  user?: string;
};

const router = trpc.router<Context>().query('hello', {
  input: z
    .object({
      who: z.string().nullish(),
    })
    .nullish(),
  resolve({ input, ctx }) {
    return {
      text: `hello ${input?.who ?? ctx.user ?? 'world'}`,
    };
  },
});
const createContext = async (event: APIGatewayProxyEvent) => {
  return {
    user: event.headers['X-USER'],
  };
};
const handler = trpcLambda.createApiGatewayHandler({
  router,
  createContext,
});

test('basic test', async () => {
  expect(
    await handler(
      mockAPIGatewayProxyEvent({
        body: JSON.stringify({ who: 'test' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'GET',
        path: 'hello',
      }),
    ),
  ).toBe({
    body: JSON.stringify({
      id: null,
      result: {
        type: 'data',
        data: {
          text: 'hello world',
        },
      },
    }),
    multiValueHeaders: {
      'Content-Type': 'Application/json',
    },
    statusCode: 200,
  });
});
