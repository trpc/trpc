import { Writable } from 'node:stream';
import { initTRPC } from '@trpc/server';
import * as trpcLambda from '@trpc/server/adapters/aws-lambda';
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventPathParameters,
  APIGatewayProxyEventV2,
  Context as AWSLambdaContext,
} from 'aws-lambda';
import { z } from 'zod';

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

export const mockAPIGatewayProxyEventV1 = ({
  body,
  headers,
  path,
  queryStringParameters,
  method,
  resource,
  pathParameters,
}: {
  body?: string;
  headers: { [key: string]: string };
  queryStringParameters: Record<string, string>;
  path: string;
  method: string;
  resource: string;
  pathParameters?: APIGatewayProxyEventPathParameters;
}): APIGatewayProxyEvent => {
  return {
    body: body ?? null,
    headers,
    multiValueHeaders: {},
    path: `/${path}`,
    httpMethod: method,
    isBase64Encoded: false,
    queryStringParameters,
    multiValueQueryStringParameters: null,
    resource,
    pathParameters: pathParameters ?? null,
    stageVariables: {},
    requestContext: {
      accountId: 'mock',
      apiId: 'mock',
      path: 'mock',
      protocol: 'mock',
      httpMethod: method,
      stage: 'mock',
      requestId: 'mock',
      requestTimeEpoch: 123,
      resourceId: 'mock',
      resourcePath: 'mock',
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: 'mock',
        user: null,
        userAgent: null,
        userArn: null,
      },
      authorizer: {},
    },
  };
};

export const mockAPIGatewayProxyEventV2 = ({
  body,
  headers,
  path,
  queryStringParameters,
  method,
  routeKey,
  pathParameters,
}: {
  body?: string;
  headers: { [key: string]: string };
  queryStringParameters: Record<string, string>;
  path: string;
  method: string;
  routeKey: string;
  pathParameters?: { [key: string]: string };
}): APIGatewayProxyEventV2 => {
  return {
    version: '2.0',
    routeKey,
    rawQueryString: new URLSearchParams(queryStringParameters).toString(),
    body,
    headers,
    rawPath: `/${path}`,
    pathParameters,
    isBase64Encoded: false,
    queryStringParameters: queryStringParameters,
    stageVariables: {},
    requestContext: {
      accountId: 'mock',
      apiId: 'mock',
      stage: 'mock',
      requestId: 'mock',
      domainName: 'mock',
      domainPrefix: 'mock',
      http: {
        method: method,
        path: 'mock',
        protocol: 'mock',
        sourceIp: 'mock',
        userAgent: 'mock',
      },
      routeKey: 'mock',
      time: 'mock',
      timeEpoch: 0,
    },
  };
};

export const mockAPIGatewayContext = (): AWSLambdaContext => {
  return {
    functionName: 'mock',
    callbackWaitsForEmptyEventLoop: true,
    functionVersion: 'mock',
    invokedFunctionArn: 'mock',
    memoryLimitInMB: 'mock',
    awsRequestId: 'mock',
    logGroupName: 'mock',
    logStreamName: 'mock',
    getRemainingTimeInMillis: () => -1,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    done: () => {},
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    fail: () => {},
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    succeed: () => {},
  };
};

export const mockAPIGatewayProxyEventBase64Encoded = (
  event: APIGatewayProxyEvent,
) => {
  if (event.body) {
    return {
      ...event,
      isBase64Encoded: true,
      body: Buffer.from(event.body, 'utf8').toString('base64'),
    } as APIGatewayProxyEvent;
  } else {
    return event;
  }
};

export class ResponseStream extends Writable {
  public response: Array<Buffer> = [];
  private contentType: string | undefined;

  override _write(
    chunk: unknown,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.response.push(Buffer.from(chunk as string, encoding));
    callback();
  }

  getContentType(): string | undefined {
    return this.contentType;
  }

  setContentType(contentType: string) {
    this.contentType = contentType;
  }

  getContent(): Buffer {
    return Buffer.concat(this.response);
  }
}

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
      text: `hello ${input?.who ?? ctx?.user ?? 'world'}`,
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
