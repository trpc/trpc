import { inferAsyncReturnType, initTRPC } from '@trpc/server/src';
import * as trpcLambda from '@trpc/server/src/adapters/aws-lambda';
import type { APIGatewayProxyEvent, APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import {
  mockAPIGatewayContext,
  mockAPIGatewayProxyEventBase64Encoded,
  mockAPIGatewayProxyEventV1,
  mockAPIGatewayProxyEventV2,
} from './lambda.utils';

const createContext = async ({
  event,
}: trpcLambda.CreateAWSLambdaContextOptions<APIGatewayProxyEvent>) => {
  return {
    user: event.headers['X-USER'],
  };
};

type Context = inferAsyncReturnType<typeof createContext>;
const t = initTRPC.context<Context>().create();

const router = t.router({
  hello: t.procedure
    .input(
      z
        .object({
          who: z.string().nullish(),
        })
        .nullish(),
    )
    .query(({ input, ctx }) => ({
      text: `hello ${input?.who ?? ctx.user ?? 'world'}`,
    })),
  echo: t.procedure
    .input(
      z.object({
        who: z.object({ name: z.string().nullish() }),
      }),
    )
    .query(({ input }) => ({
      text: `hello ${input.who.name}`,
    })),
  ['hello/darkness/my/old/friend']: t.procedure.query(() => {
    return {
      text: "I've come to talk with you again",
    };
  }),
  addOne: t.procedure
    .input(z.object({ counter: z.number().int().min(0) }))
    .mutation(({ input }) => {
      return {
        counter: input.counter + 1,
      };
    }),
});

const tC = initTRPC.create();
const contextlessApp = tC.router({
  hello: tC.procedure
    .input(z.object({ who: z.string() }))
    .query(({ input }) => {
      return {
        text: `hello ${input.who}`,
      };
    }),
});

const handler = trpcLambda.awsLambdaRequestHandler({
  router,
  createContext,
});

test('basic test', async () => {
  const { body, ...result } = await handler(
    mockAPIGatewayProxyEventV1({
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json', 'X-USER': 'Lilja' },
      method: 'GET',
      path: 'hello',
      queryStringParameters: {},
      resource: '/hello',
    }),
    mockAPIGatewayContext(),
  );
  const parsedBody = JSON.parse(body || '');
  expect(result).toMatchInlineSnapshot(`
    Object {
      "headers": Object {
        "Content-Type": "application/json",
      },
      "statusCode": 200,
    }
  `);
  expect(parsedBody).toMatchInlineSnapshot(`
    Object {
      "result": Object {
        "data": Object {
          "text": "hello Lilja",
        },
      },
    }
  `);
});

test('test v1 with leading prefix', async () => {
  const { body, ...result } = await handler(
    mockAPIGatewayProxyEventV1({
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json', 'X-USER': 'Lilja' },
      method: 'GET',
      path: '/leading/prefix/hello',
      queryStringParameters: {},
      pathParameters: { proxy: 'hello' },
      resource: '/leading/prefix/{proxy+}',
    }),
    mockAPIGatewayContext(),
  );
  const parsedBody = JSON.parse(body || '');
  expect(result).toMatchInlineSnapshot(`
    Object {
      "headers": Object {
        "Content-Type": "application/json",
      },
      "statusCode": 200,
    }
  `);
  expect(parsedBody).toMatchInlineSnapshot(`
    Object {
      "result": Object {
        "data": Object {
          "text": "hello Lilja",
        },
      },
    }
  `);
});

test('test v1 can find procedure even if resource is not proxied', async () => {
  const { body, ...result } = await handler(
    mockAPIGatewayProxyEventV1({
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json', 'X-USER': 'Robin' },
      method: 'GET',
      path: '/leading/prefix/hello',
      queryStringParameters: {},
      // No pathParameters since we hit a direct resource, i.e. no {proxy+} on resource
      resource: '/leading/prefix/hello',
    }),
    mockAPIGatewayContext(),
  );
  const parsedBody = JSON.parse(body || '');
  expect(result).toMatchInlineSnapshot(`
    Object {
      "headers": Object {
        "Content-Type": "application/json",
      },
      "statusCode": 200,
    }
  `);
  expect(parsedBody).toMatchInlineSnapshot(`
    Object {
      "result": Object {
        "data": Object {
          "text": "hello Robin",
        },
      },
    }
  `);
});

test('bad type', async () => {
  const { body, ...result } = await handler(
    mockAPIGatewayProxyEventV1({
      body: JSON.stringify({ who: [[]] }),
      headers: { 'Content-Type': 'application/json' },
      method: 'GET',
      path: 'echo',
      queryStringParameters: {},
      resource: '/echo',
    }),
    mockAPIGatewayContext(),
  );
  const parsedBody = JSON.parse(body || '');
  expect(result).toMatchInlineSnapshot(`
    Object {
      "headers": Object {
        "Content-Type": "application/json",
      },
      "statusCode": 400,
    }
  `);
  parsedBody.error.data.stack = '[redacted]';

  expect(parsedBody).toMatchInlineSnapshot(`
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
    }
  `);
});

test('test v2 format', async () => {
  const createContext = async ({
    event,
  }: trpcLambda.CreateAWSLambdaContextOptions<APIGatewayProxyEventV2>) => {
    return {
      user: event.headers['X-USER'],
    };
  };
  const handler2 = trpcLambda.awsLambdaRequestHandler({
    router,
    createContext,
  });
  const { body, ...result } = await handler2(
    mockAPIGatewayProxyEventV2({
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json', 'X-USER': 'Lilja' },
      method: 'GET',
      path: 'hello',
      queryStringParameters: {},
      routeKey: '$default',
    }),
    mockAPIGatewayContext(),
  );
  expect(result).toMatchInlineSnapshot(`
    Object {
      "headers": Object {
        "Content-Type": "application/json",
      },
      "statusCode": 200,
    }
  `);
  const parsedBody = JSON.parse(body || '');
  expect(parsedBody).toMatchInlineSnapshot(`
    Object {
      "result": Object {
        "data": Object {
          "text": "hello Lilja",
        },
      },
    }
  `);
});

test('test v2 format with multiple / in query key', async () => {
  const createContext = async ({
    event,
  }: trpcLambda.CreateAWSLambdaContextOptions<APIGatewayProxyEventV2>) => {
    return {
      user: event.headers['X-USER'],
    };
  };
  const handler2 = trpcLambda.awsLambdaRequestHandler({
    router,
    createContext,
  });
  const { body, ...result } = await handler2(
    mockAPIGatewayProxyEventV2({
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json', 'X-USER': 'Lilja' },
      method: 'GET',
      path: 'hello/darkness/my/old/friend',
      queryStringParameters: {},
      routeKey: '$default',
    }),
    mockAPIGatewayContext(),
  );
  expect(result).toMatchInlineSnapshot(`
    Object {
      "headers": Object {
        "Content-Type": "application/json",
      },
      "statusCode": 200,
    }
  `);
  const parsedBody = JSON.parse(body || '');
  expect(parsedBody).toMatchInlineSnapshot(`
    Object {
      "result": Object {
        "data": Object {
          "text": "I've come to talk with you again",
        },
      },
    }
  `);
});

test('test v2 format with non default routeKey', async () => {
  const createContext = async ({
    event,
  }: trpcLambda.CreateAWSLambdaContextOptions<APIGatewayProxyEventV2>) => {
    return {
      user: event.headers['X-USER'],
    };
  };
  const handler2 = trpcLambda.awsLambdaRequestHandler({
    router,
    createContext,
  });
  const { body, ...result } = await handler2(
    mockAPIGatewayProxyEventV2({
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json', 'X-USER': 'Lilja' },
      method: 'GET',
      routeKey: 'ANY /trpc/{a}/{path+}',
      path: 'trpc/abc/hello',
      queryStringParameters: {},
      pathParameters: { a: 'abc', path: 'hello' },
    }),
    mockAPIGatewayContext(),
  );
  expect(result).toMatchInlineSnapshot(`
    Object {
      "headers": Object {
        "Content-Type": "application/json",
      },
      "statusCode": 200,
    }
  `);
  const parsedBody = JSON.parse(body || '');
  expect(parsedBody).toMatchInlineSnapshot(`
    Object {
      "result": Object {
        "data": Object {
          "text": "hello Lilja",
        },
      },
    }
  `);
});
test('test v2 format with non default routeKey and nested router', async () => {
  const createContext = async ({
    event,
  }: trpcLambda.CreateAWSLambdaContextOptions<APIGatewayProxyEventV2>) => {
    return {
      user: event.headers['X-USER'],
    };
  };
  const handler2 = trpcLambda.awsLambdaRequestHandler({
    router,
    createContext,
  });
  const { body, ...result } = await handler2(
    mockAPIGatewayProxyEventV2({
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json', 'X-USER': 'Lilja' },
      method: 'GET',
      routeKey: 'ANY /trpc/{a}/{path+}',
      path: 'trpc/abc/hello/darkness/my/old/friend',
      queryStringParameters: {},
      pathParameters: { a: 'abc', path: 'hello/darkness/my/old/friend' },
    }),
    mockAPIGatewayContext(),
  );
  expect(result).toMatchInlineSnapshot(`
    Object {
      "headers": Object {
        "Content-Type": "application/json",
      },
      "statusCode": 200,
    }
  `);
  const parsedBody = JSON.parse(body || '');
  expect(parsedBody).toMatchInlineSnapshot(`
    Object {
      "result": Object {
        "data": Object {
          "text": "I've come to talk with you again",
        },
      },
    }
  `);
});
test('router with no context', async () => {
  const handler2 = trpcLambda.awsLambdaRequestHandler({
    router: contextlessApp,
  });
  const { body, ...result } = await handler2(
    mockAPIGatewayProxyEventV1({
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json', 'X-USER': 'Lilja' },
      method: 'GET',
      path: 'hello',
      queryStringParameters: {
        input: JSON.stringify({ who: 'kATT' }),
      },
      resource: '/hello',
    }),
    mockAPIGatewayContext(),
  );
  expect(result).toMatchInlineSnapshot(`
    Object {
      "headers": Object {
        "Content-Type": "application/json",
      },
      "statusCode": 200,
    }
  `);
  const parsedBody = JSON.parse(body || '');
  expect(parsedBody).toMatchInlineSnapshot(`
    Object {
      "result": Object {
        "data": Object {
          "text": "hello kATT",
        },
      },
    }
  `);
});

test('test base64 encoded apigateway proxy integration', async () => {
  const { body, ...result } = await handler(
    mockAPIGatewayProxyEventBase64Encoded(
      mockAPIGatewayProxyEventV1({
        body: JSON.stringify({ counter: 1 }),
        headers: { 'Content-Type': 'application/json', 'X-USER': 'Eliot' },
        method: 'POST',
        path: 'addOne',
        queryStringParameters: {},
        resource: '/addOne',
      }),
    ),
    mockAPIGatewayContext(),
  );
  const parsedBody = JSON.parse(body || '');
  expect(result).toMatchInlineSnapshot(`
    Object {
      "headers": Object {
        "Content-Type": "application/json",
      },
      "statusCode": 200,
    }
  `);
  expect(parsedBody).toMatchInlineSnapshot(`
    Object {
      "result": Object {
        "data": Object {
          "counter": 2,
        },
      },
    }
  `);
});
