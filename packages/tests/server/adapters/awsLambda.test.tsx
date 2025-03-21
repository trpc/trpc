import { initTRPC } from '@trpc/server';
import * as trpcLambda from '@trpc/server/adapters/aws-lambda';
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
  info,
}: trpcLambda.CreateAWSLambdaContextOptions<APIGatewayProxyEvent>) => {
  return {
    user: event.headers['X-USER'],
    info,
  };
};

type Context = Awaited<ReturnType<typeof createContext>>;
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
  request: t.router({
    info: t.procedure.query(({ ctx }) => ctx.info),
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
        "content-type": "application/json",
        "vary": "trpc-accept",
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

test('v1 request info', async () => {
  const { body, ...result } = await handler(
    mockAPIGatewayProxyEventV1({
      headers: { 'Content-Type': 'application/json', 'X-USER': 'Lilja' },
      method: 'GET',
      path: 'request.info',
      queryStringParameters: {},
      resource: '/request/info',
    }),
    mockAPIGatewayContext(),
  );
  const parsedBody = JSON.parse(body || '');
  expect(result).toMatchInlineSnapshot(`
    Object {
      "headers": Object {
        "content-type": "application/json",
        "vary": "trpc-accept",
      },
      "statusCode": 200,
    }
  `);
  expect(parsedBody).toMatchInlineSnapshot(`
    Object {
      "result": Object {
        "data": Object {
          "accept": null,
          "calls": Array [
            Object {
              "path": "request.info",
            },
          ],
          "connectionParams": null,
          "isBatchCall": false,
          "signal": Object {},
          "type": "query",
          "url": "https://localhost/request.info",
        },
      },
    }
  `);
});

test('test v1 with leading prefix', async () => {
  const { body, ...result } = await handler(
    mockAPIGatewayProxyEventV1({
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
        "content-type": "application/json",
        "vary": "trpc-accept",
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
        "content-type": "application/json",
        "vary": "trpc-accept",
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
      headers: { 'Content-Type': 'application/json' },
      method: 'GET',
      path: 'echo',
      queryStringParameters: {
        input: JSON.stringify({ who: [[]] }),
      },
      resource: '/echo',
    }),
    mockAPIGatewayContext(),
  );
  const parsedBody = JSON.parse(body || '');
  expect(result).toMatchInlineSnapshot(`
    Object {
      "headers": Object {
        "content-type": "application/json",
        "vary": "trpc-accept",
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
        "code": "invalid_type",
        "expected": "object",
        "received": "array",
        "path": [
          "who"
        ],
        "message": "Expected object, received array"
      }
    ]",
      },
    }
  `);
});

test('test v2 format', async () => {
  const createContext = async ({
    event,
    info,
  }: trpcLambda.CreateAWSLambdaContextOptions<APIGatewayProxyEventV2>) => {
    return {
      user: event.headers['X-USER'],
      info,
    };
  };
  const handler2 = trpcLambda.awsLambdaRequestHandler({
    router,
    createContext,
  });
  const { body, ...result } = await handler2(
    mockAPIGatewayProxyEventV2({
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
      "cookies": Array [],
      "headers": Object {
        "content-type": "application/json",
        "vary": "trpc-accept",
      },
      "statusCode": 200,
    }
  `);
  const parsedBody = JSON.parse(body ?? '');
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
    info,
  }: trpcLambda.CreateAWSLambdaContextOptions<APIGatewayProxyEventV2>) => {
    return {
      user: event.headers['X-USER'],
      info,
    };
  };
  const handler2 = trpcLambda.awsLambdaRequestHandler({
    router,
    createContext,
  });
  const { body, ...result } = await handler2(
    mockAPIGatewayProxyEventV2({
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
      "cookies": Array [],
      "headers": Object {
        "content-type": "application/json",
        "vary": "trpc-accept",
      },
      "statusCode": 200,
    }
  `);
  const parsedBody = JSON.parse(body ?? '');
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
    info,
  }: trpcLambda.CreateAWSLambdaContextOptions<APIGatewayProxyEventV2>) => {
    return {
      user: event.headers['X-USER'],
      info,
    };
  };
  const handler2 = trpcLambda.awsLambdaRequestHandler({
    router,
    createContext,
  });
  const { body, ...result } = await handler2(
    mockAPIGatewayProxyEventV2({
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
      "cookies": Array [],
      "headers": Object {
        "content-type": "application/json",
        "vary": "trpc-accept",
      },
      "statusCode": 200,
    }
  `);
  const parsedBody = JSON.parse(body ?? '');
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
    info,
  }: trpcLambda.CreateAWSLambdaContextOptions<APIGatewayProxyEventV2>) => {
    return {
      user: event.headers['X-USER'],
      info,
    };
  };
  const handler2 = trpcLambda.awsLambdaRequestHandler({
    router,
    createContext,
  });
  const { body, ...result } = await handler2(
    mockAPIGatewayProxyEventV2({
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
      "cookies": Array [],
      "headers": Object {
        "content-type": "application/json",
        "vary": "trpc-accept",
      },
      "statusCode": 200,
    }
  `);
  const parsedBody = JSON.parse(body ?? '');
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
  const parsedBody = JSON.parse(body ?? '');
  expect(parsedBody).toMatchInlineSnapshot(`
    Object {
      "result": Object {
        "data": Object {
          "text": "hello kATT",
        },
      },
    }
  `);
  expect(result).toMatchInlineSnapshot(`
    Object {
      "headers": Object {
        "content-type": "application/json",
        "vary": "trpc-accept",
      },
      "statusCode": 200,
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
        "content-type": "application/json",
        "vary": "trpc-accept",
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

test('v1 cookies', async () => {
  const handler2 = trpcLambda.awsLambdaRequestHandler({
    router,
    createContext,
    responseMeta: () => {
      return {
        headers: {
          'Set-Cookie': [
            'cookie1=value1',
            'cookie2=value2; Expires=Wed, 28 Feb 2025 00:00:00 GMT',
            'multiCookie1=value1; Domain=example.com; Expires=Wed, 28 Feb 2025 00:00:00 GMT,multiCookie2=value2',
          ],
        },
      };
    },
  });
  const { body, ...result } = await handler2(
    mockAPIGatewayProxyEventV1({
      headers: { 'Content-Type': 'application/json', 'X-USER': 'Lilja' },
      method: 'GET',
      path: 'hello',
      queryStringParameters: {},
      resource: '/hello',
    }),
    mockAPIGatewayContext(),
  );
  const parsedBody = JSON.parse(body ?? '');
  expect(result).toMatchInlineSnapshot(`
    Object {
      "headers": Object {
        "content-type": "application/json",
        "vary": "trpc-accept",
      },
      "multiValueHeaders": Object {
        "set-cookie": Array [
          "cookie1=value1",
          "cookie2=value2; Expires=Wed, 28 Feb 2025 00:00:00 GMT",
          "multiCookie1=value1; Domain=example.com; Expires=Wed, 28 Feb 2025 00:00:00 GMT",
          "multiCookie2=value2",
        ],
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

test('v2 cookies', async () => {
  const createContext = async ({
    event,
    info,
  }: trpcLambda.CreateAWSLambdaContextOptions<APIGatewayProxyEventV2>) => {
    return {
      user: event.headers['X-USER'],
      info,
    };
  };
  const handler2 = trpcLambda.awsLambdaRequestHandler({
    router,
    createContext,
    responseMeta: () => {
      return {
        headers: {
          'Set-Cookie': [
            'cookie1=value1',
            'cookie2=value2; Expires=Wed, 28 Feb 2025 00:00:00 GMT',
            'multiCookie1=value1; Domain=example.com; Expires=Wed, 28 Feb 2025 00:00:00 GMT,multiCookie2=value2',
          ],
        },
      };
    },
  });
  const { body, ...result } = await handler2(
    mockAPIGatewayProxyEventV2({
      headers: { 'Content-Type': 'application/json', 'X-USER': 'Lilja' },
      method: 'GET',
      path: 'hello/darkness/my/old/friend',
      queryStringParameters: {},
      routeKey: '$default',
    }),
    mockAPIGatewayContext(),
  );
  const parsedBody = JSON.parse(body ?? '');
  expect(result).toMatchInlineSnapshot(`
    Object {
      "cookies": Array [
        "cookie1=value1",
        "cookie2=value2; Expires=Wed, 28 Feb 2025 00:00:00 GMT",
        "multiCookie1=value1; Domain=example.com; Expires=Wed, 28 Feb 2025 00:00:00 GMT",
        "multiCookie2=value2",
      ],
      "headers": Object {
        "content-type": "application/json",
        "vary": "trpc-accept",
      },
      "statusCode": 200,
    }
  `);
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
