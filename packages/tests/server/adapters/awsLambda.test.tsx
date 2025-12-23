import type { Writable } from 'node:stream';
import { initTRPC } from '@trpc/server';
import * as trpcLambda from '@trpc/server/adapters/aws-lambda';
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  StreamifyHandler,
} from 'aws-lambda';
import { z } from 'zod';
import {
  mockAPIGatewayContext,
  mockAPIGatewayProxyEventBase64Encoded,
  mockAPIGatewayProxyEventV1,
  mockAPIGatewayProxyEventV2,
  ResponseStream,
} from './awsLambda.test.utils';

globalThis.awslambda = {
  streamifyResponse(handler) {
    return handler;
  },

  HttpResponseStream: {
    // @ts-expect-error - this is a mock
    from: (writable: Writable, metadata: Record<string, unknown>) => {
      return writable;
    },
  },
};

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
    .query((opts) => ({
      text: `hello ${opts.input?.who ?? opts.ctx?.user ?? 'world'}`,
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
    info: t.procedure.query((opts) => opts.ctx.info),
  }),
  iterable: t.procedure.query(async function* () {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      yield i;
    }
  }),
  deferred: t.procedure
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

const streamingHandler = trpcLambda.awsLambdaStreamingRequestHandler({
  router,
});

test('streaming with normal response', async () => {
  const responseStream = new ResponseStream();

  await streamingHandler(
    mockAPIGatewayProxyEventV2({
      headers: {
        'Content-Type': 'application/json',
        'trpc-accept': 'application/jsonl',
      },
      method: 'GET',
      path: 'hello',
      queryStringParameters: { input: '{}', batch: '1' },
      routeKey: '$default',
    }),
    responseStream,
    mockAPIGatewayContext(),
  );

  const content = responseStream.getContent().toString();

  expect(content).toMatchInlineSnapshot(`
    "{"0":[[0],[null,0,0]]}
    [0,0,[[{"result":0}],["result",0,1]]]
    [1,0,[[{"data":0}],["data",0,2]]]
    [2,0,[[{"text":"hello world"}]]]
    "
  `);
});

test('streaming with iterable response', async () => {
  const responseStream = new ResponseStream();

  await streamingHandler(
    mockAPIGatewayProxyEventV2({
      headers: {
        'Content-Type': 'application/json',
        'trpc-accept': 'application/jsonl',
      },
      method: 'GET',
      path: 'iterable',
      queryStringParameters: { input: '{}', batch: '1' },
      routeKey: '$default',
    }),
    responseStream,
    mockAPIGatewayContext(),
  );

  const content = responseStream.getContent().toString();

  expect(content).toMatchInlineSnapshot(`
    "{"0":[[0],[null,0,0]]}
    [0,0,[[{"result":0}],["result",0,1]]]
    [1,0,[[{"data":0}],["data",0,2]]]
    [2,0,[[0],[null,1,3]]]
    [3,1,[[0]]]
    [3,1,[[1]]]
    [3,1,[[2]]]
    [3,0,[[]]]
    "
  `);
});

test('streaming with deferred response', async () => {
  const responseStream = new ResponseStream();

  await streamingHandler(
    mockAPIGatewayProxyEventV2({
      headers: {
        'Content-Type': 'application/json',
        'trpc-accept': 'application/jsonl',
      },
      method: 'GET',
      path: 'deferred',
      queryStringParameters: {
        input: '{"0":{"wait":3},"1":{"wait":1},"2":{"wait":2}}',
        batch: '1',
      },
      routeKey: '$default',
    }),
    responseStream,
    mockAPIGatewayContext(),
  );

  const content = responseStream.getContent().toString();

  expect(content).toMatchInlineSnapshot(`
    "{"0":[[0],[null,0,0]]}
    [0,0,[[{"result":0}],["result",0,1]]]
    [1,0,[[{"data":0}],["data",0,2]]]
    [2,0,[[3]]]
    "
  `);
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
        "expected": "object",
        "code": "invalid_type",
        "path": [
          "who"
        ],
        "message": "Invalid input: expected object, received array"
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
