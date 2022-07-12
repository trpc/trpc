import type { APIGatewayProxyEvent, APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import * as trpc from '../../src';
import { inferAsyncReturnType } from '../../src';
import * as trpcLambda from '../../src/adapters/aws-lambda';
import {
  mockAPIGatewayContext,
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
  })
  .query('hello/darkness/my/old/friend', {
    resolve() {
      return {
        text: `I've come to talk with you again`,
      };
    },
  });
const contextlessApp = trpc.router().query('hello', {
  input: z.object({
    who: z.string(),
  }),
  resolve({ input }) {
    return {
      text: `hello ${input.who}`,
    };
  },
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
      "id": null,
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
      "id": null,
      "result": Object {
        "data": Object {
          "text": "I've come to talk with you again",
        },
        "type": "data",
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
      "id": null,
      "result": Object {
        "data": Object {
          "text": "I've come to talk with you again",
        },
        "type": "data",
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
      "id": null,
      "result": Object {
        "data": Object {
          "text": "hello kATT",
        },
        "type": "data",
      },
    }
  `);
});
