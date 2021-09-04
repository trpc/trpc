/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import * as trpc from '../../src';
import * as trpcLambda from '../../src/adapters/aws-lambda';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { mockAPIGatewayProxyEvent } from './aws-lambda.utils';

type Context = {
  user?: string;
};

const router = trpc.router<Context>()
.query('hello', {
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
})
.query('echo', {
    input: z
    .object({
      who: z.object({ name: z.string().nullish() }),
    }),
  resolve({ input }) {
    return {
      text: `hello ${input.who.name}`,
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
  ).toStrictEqual({
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
      'Content-Type': 'application/json',
    },
    statusCode: 200,
  });
  expect(
    await handler(
      mockAPIGatewayProxyEvent({
        body: JSON.stringify({ }),
        headers: { 'Content-Type': 'application/json', 'X-USER': 'Lilja' },
        method: 'GET',
        path: 'hello',
      }),
    ),
  ).toStrictEqual({
    body: JSON.stringify({
      id: null,
      result: {
        type: 'data',
        data: {
          text: 'hello Lilja',
        },
      },
    }),
    multiValueHeaders: {
      'Content-Type': 'application/json',
    },
    statusCode: 200,
  });
});
test("bad type", async () => {
    const res = await handler(
      mockAPIGatewayProxyEvent({
        body: JSON.stringify({ who: [[]] }),
        headers: { 'Content-Type': 'application/json' },
        method: 'GET',
        path: 'echo',
      }),
    )
    expect(
        JSON.parse(res.body)
    ).toHaveProperty("error");
});
