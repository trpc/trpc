/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import * as trpc from '../../src';
import { inferAsyncReturnType } from '../../src';
import * as trpcLambda from '../../src/adapters/aws-lambda';
import { mockAPIGatewayProxyEvent } from './aws-lambda.utils';

const createContext = async ({
    event,
}: trpcLambda.CreateLambdaContextOptions
) => {
  return {
    user: event.headers['X-USER'],
  };
};

type Context = inferAsyncReturnType<typeof createContext>;
const router = trpc
  .router<Context>()
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
    input: z.object({
      who: z.object({ name: z.string().nullish() }),
    }),
    resolve({ input }) {
      return {
        text: `hello ${input.who.name}`,
      };
    },
  });

const handler = trpcLambda.createApiGatewayHandler({
  router,
  createContext,
});

test('basic test', async () => {
  const result = await handler(
    mockAPIGatewayProxyEvent({
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json', 'X-USER': 'Lilja' },
      method: 'GET',
      path: 'hello',
    })
    ,{}
  );
  const body = JSON.parse(result.body);
  delete (result as any).body;
  expect(result).toMatchInlineSnapshot(`
Object {
  "headers": Object {
    "Content-Type": "application/json",
  },
  "statusCode": 200,
}
`);
  expect(body).toMatchInlineSnapshot(`
Object {
  "id": null,
  "result": Object {
    "data": Object {
      "text": "hello Lilja",
    },
    "type": "data",
  },
}
`);
});
test('bad type', async () => {
  const result = await handler(
    mockAPIGatewayProxyEvent({
      body: JSON.stringify({ who: [[]] }),
      headers: { 'Content-Type': 'application/json' },
      method: 'GET',
      path: 'echo',
    }),
    {}
  );
  const body = JSON.parse(result.body);
  delete (result as any).body;
  expect(result).toMatchInlineSnapshot(`
Object {
  "headers": Object {
    "Content-Type": "application/json",
  },
  "statusCode": 400,
}
`);
  body.error.data.stack = '[redacted]';

  expect(body).toMatchInlineSnapshot(`
Object {
  "error": Object {
    "code": -32600,
    "data": Object {
      "code": "BAD_REQUEST",
      "httpStatus": 400,
      "path": "echo",
      "stack": "[redacted]",
    },
    "message": "[
  {
    \\"code\\": \\"invalid_type\\",
    \\"expected\\": \\"object\\",
    \\"received\\": \\"undefined\\",
    \\"path\\": [],
    \\"message\\": \\"Required\\"
  }
]",
  },
  "id": null,
}
`);
});
