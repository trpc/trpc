/* eslint-disable @typescript-eslint/no-empty-function */
import { waitError } from '../___testHelpers';
import { legacyRouterToServerAndClient } from './__legacyRouterToServerAndClient';
import { TRPCClientError } from '@trpc/client/src';
import * as trpc from '@trpc/server/src';
import { CreateHTTPContextOptions } from '@trpc/server/src/adapters/standalone';
import { TRPCError } from '@trpc/server/src/error/TRPCError';
import { getMessageFromUnknownError } from '@trpc/server/src/error/utils';
import { OnErrorFunction } from '@trpc/server/src/internals/types';
import fetch from 'node-fetch';
import { ZodError, z } from 'zod';

test('basic', async () => {
  class MyError extends Error {
    constructor(message: string) {
      super(message);
      Object.setPrototypeOf(this, MyError.prototype);
    }
  }
  const onError = jest.fn();
  const { client, close } = legacyRouterToServerAndClient(
    trpc.router().query('err', {
      resolve() {
        throw new MyError('woop');
      },
    }),
    {
      server: {
        onError,
      },
    },
  );
  const clientError = await waitError(client.query('err'), TRPCClientError);
  expect(clientError.shape.message).toMatchInlineSnapshot(`"woop"`);
  expect(clientError.shape.code).toMatchInlineSnapshot(`-32603`);

  expect(onError).toHaveBeenCalledTimes(1);
  const serverError = onError.mock.calls[0]![0]!.error;

  expect(serverError).toBeInstanceOf(TRPCError);
  if (!(serverError instanceof TRPCError)) {
    throw new Error('Wrong error');
  }

  expect(serverError.cause).toBeInstanceOf(MyError);

  close();
});

test('input error', async () => {
  const onError = jest.fn();
  const { client, close } = legacyRouterToServerAndClient(
    trpc.router().mutation('err', {
      input: z.string(),
      resolve() {
        return null;
      },
    }),
    {
      server: {
        onError,
      },
    },
  );
  const clientError = await waitError(
    client.mutation('err', 1 as any),
    TRPCClientError,
  );
  expect(clientError.shape.message).toMatchInlineSnapshot(`
    "[
      {
        \\"code\\": \\"invalid_type\\",
        \\"expected\\": \\"string\\",
        \\"received\\": \\"number\\",
        \\"path\\": [],
        \\"message\\": \\"Expected string, received number\\"
      }
    ]"
  `);
  expect(clientError.shape.code).toMatchInlineSnapshot(`-32600`);

  expect(onError).toHaveBeenCalledTimes(1);
  const serverError = onError.mock.calls[0]![0]!.error;

  // if (!(serverError instanceof TRPCError)) {
  //   console.log('err', serverError);
  //   throw new Error('Wrong error');
  // }

  expect(serverError.cause).toBeInstanceOf(ZodError);

  close();
});

test('unauthorized()', async () => {
  const onError = jest.fn();
  const { client, close } = legacyRouterToServerAndClient(
    trpc.router().query('err', {
      resolve() {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      },
    }),
    {
      server: {
        onError,
      },
    },
  );
  const clientError = await waitError(client.query('err'), TRPCClientError);
  expect(clientError).toMatchInlineSnapshot(`[TRPCClientError: UNAUTHORIZED]`);
  expect(onError).toHaveBeenCalledTimes(1);
  const serverError = onError.mock.calls[0]![0]!.error;

  expect(serverError).toBeInstanceOf(TRPCError);

  close();
});

test('getMessageFromUnknownError()', () => {
  expect(getMessageFromUnknownError('test', 'nope')).toBe('test');
  expect(getMessageFromUnknownError(1, 'test')).toBe('test');
  expect(getMessageFromUnknownError({}, 'test')).toBe('test');
});
describe('formatError()', () => {
  test('simple', async () => {
    const onError = jest.fn();
    const { client, close } = legacyRouterToServerAndClient(
      trpc
        .router()
        .formatError(({ error, shape }) => {
          if (error.cause instanceof ZodError) {
            return {
              ...shape,
              data: {
                ...shape.data,
                type: 'zod' as const,
                errors: error.cause.errors,
              },
            };
          }
          return shape;
        })
        .mutation('err', {
          input: z.string(),
          resolve() {
            return null;
          },
        }),
      {
        server: {
          onError,
        },
      },
    );
    const clientError = await waitError(
      client.mutation('err', 1 as any),
      TRPCClientError,
    );
    delete clientError.data.stack;
    expect(clientError.data).toMatchInlineSnapshot(`
Object {
  "code": "BAD_REQUEST",
  "errors": Array [
    Object {
      "code": "invalid_type",
      "expected": "string",
      "message": "Expected string, received number",
      "path": Array [],
      "received": "number",
    },
  ],
  "httpStatus": 400,
  "path": "err",
  "type": "zod",
}
`);
    expect(clientError.shape).toMatchInlineSnapshot(`
Object {
  "code": -32600,
  "data": Object {
    "code": "BAD_REQUEST",
    "errors": Array [
      Object {
        "code": "invalid_type",
        "expected": "string",
        "message": "Expected string, received number",
        "path": Array [],
        "received": "number",
      },
    ],
    "httpStatus": 400,
    "path": "err",
    "type": "zod",
  },
  "message": "[
  {
    \\"code\\": \\"invalid_type\\",
    \\"expected\\": \\"string\\",
    \\"received\\": \\"number\\",
    \\"path\\": [],
    \\"message\\": \\"Expected string, received number\\"
  }
]",
}
`);
    expect(onError).toHaveBeenCalledTimes(1);
    const serverError = onError.mock.calls[0]![0]!.error;

    expect(serverError.cause).toBeInstanceOf(ZodError);

    close();
  });

  test('double errors', async () => {
    expect(() => {
      trpc
        .router()
        .formatError(({ shape }) => {
          return shape;
        })
        .formatError(({ shape }) => {
          return shape;
        });
    }).toThrowErrorMatchingInlineSnapshot(
      `"You seem to have double \`formatError()\`-calls in your router tree"`,
    );
  });
  test('setting custom http response code', async () => {
    const TEAPOT_ERROR_CODE = 418;
    const onError = jest.fn();
    const { close, httpUrl } = legacyRouterToServerAndClient(
      trpc
        .router()
        .formatError(({ error, shape }) => {
          if (!(error.cause instanceof ZodError)) {
            return shape;
          }
          return {
            ...shape,
            data: {
              ...shape.data,
              httpStatus: TEAPOT_ERROR_CODE,
            },
          };
        })
        .query('q', {
          input: z.string(),
          resolve() {
            return null;
          },
        }),
      {
        server: {
          onError,
        },
      },
    );
    const res = await fetch(`${httpUrl}/q`);

    expect(res.ok).toBeFalsy();
    expect(res.status).toBe(TEAPOT_ERROR_CODE);

    close();
  });

  test('do not override response status set by middleware or resolver', async () => {
    const TEAPOT_ERROR_CODE = 418;
    const onError = jest.fn();
    const { close, httpUrl } = legacyRouterToServerAndClient(
      trpc
        .router<CreateHTTPContextOptions>()
        .middleware(({ ctx }) => {
          ctx.res.statusCode = TEAPOT_ERROR_CODE;
          throw new Error('Some error');
        })
        .query('q', {
          resolve() {
            return null;
          },
        }),
      {
        server: {
          onError,
        },
      },
    );
    const res = await fetch(`${httpUrl}/q`);

    expect(res.ok).toBeFalsy();
    expect(res.status).toBe(TEAPOT_ERROR_CODE);

    close();
  });
});

test('make sure object is ignoring prototype', async () => {
  const onError = jest.fn();
  const { client, close } = legacyRouterToServerAndClient(
    trpc.router().query('hello', {
      resolve() {
        return 'there';
      },
    }),
    {
      server: {
        onError,
      },
    },
  );
  const clientError = await waitError(
    client.query('toString' as any),
    TRPCClientError,
  );
  expect(clientError.shape.message).toMatchInlineSnapshot(
    `"No \\"query\\"-procedure on path \\"toString\\""`,
  );
  expect(clientError.shape.code).toMatchInlineSnapshot(`-32004`);
  expect(onError).toHaveBeenCalledTimes(1);
  const serverError = onError.mock.calls[0]![0]!.error;
  expect(serverError.code).toMatchInlineSnapshot(`"NOT_FOUND"`);

  close();
});

test('allow using built-in Object-properties', async () => {
  const { client, close } = legacyRouterToServerAndClient(
    trpc
      .router()
      .query('toString', {
        resolve() {
          return 'toStringValue';
        },
      })
      .query('hasOwnProperty', {
        resolve() {
          return 'hasOwnPropertyValue';
        },
      }),
  );

  expect(await client.query('toString')).toBe('toStringValue');
  expect(await client.query('hasOwnProperty')).toBe('hasOwnPropertyValue');
  close();
});

test('retain stack trace', async () => {
  class CustomError extends Error {
    constructor() {
      super('CustomError.msg');
      this.name = 'CustomError';

      Object.setPrototypeOf(this, new.target.prototype);
    }
  }

  const onErrorFn: OnErrorFunction<any, any> = () => {};

  const onError = jest.fn(onErrorFn);

  const { client, close } = legacyRouterToServerAndClient(
    trpc.router().query('hello', {
      resolve() {
        if (true) {
          throw new CustomError();
        }
        return 'toStringValue';
      },
    }),
    {
      server: {
        onError,
      },
    },
  );

  const clientError = await waitError(() => client.query('hello'));
  expect(clientError.name).toBe('TRPCClientError');

  expect(onError).toHaveBeenCalledTimes(1);

  const serverOnErrorOpts = onError.mock.calls[0]![0]!;
  const serverError = serverOnErrorOpts.error;
  expect(serverError).toBeInstanceOf(TRPCError);
  expect(serverError.cause).toBeInstanceOf(CustomError);

  expect(serverError.stack).not.toContain('getErrorFromUnknown');
  const stackParts = serverError.stack!.split('\n');

  // first line of stack trace
  expect(stackParts[1]).toContain(__filename);

  close();
});
