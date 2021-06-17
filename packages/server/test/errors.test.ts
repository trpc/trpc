/* eslint-disable @typescript-eslint/no-explicit-any */
import { z, ZodError } from 'zod';
import { TRPCClientError } from '../../client/src';
import * as trpc from '../src';
import { AnyRouter } from '../src';
import { getMessageFromUnkownError, TRPCError } from '../src/errors';
import { routerToServerAndClient } from './_testHelpers';

function assertClientError(
  err: unknown,
): asserts err is TRPCClientError<AnyRouter> {
  if (!(err instanceof TRPCClientError)) {
    throw new Error('Did not throw');
  }
}

test('basic', async () => {
  class MyError extends Error {
    constructor(message: string) {
      super(message);
      Object.setPrototypeOf(this, MyError.prototype);
    }
  }
  const onError = jest.fn();
  const { client, close } = routerToServerAndClient(
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
  let clientError: Error | null = null;
  try {
    await client.query('err');
  } catch (_err) {
    clientError = _err;
  }
  if (!(clientError instanceof TRPCClientError)) {
    throw new Error('Did not throw');
  }
  expect(clientError.shape.message).toMatchInlineSnapshot(`"woop"`);
  expect(clientError.shape.code).toMatchInlineSnapshot(`-32603`);

  expect(onError).toHaveBeenCalledTimes(1);
  const serverError = onError.mock.calls[0][0].error;

  expect(serverError).toBeInstanceOf(TRPCError);
  if (!(serverError instanceof TRPCError)) {
    throw new Error('Wrong error');
  }
  expect(serverError.originalError).toBeInstanceOf(MyError);

  close();
});

test('input error', async () => {
  const onError = jest.fn();
  const { client, close } = routerToServerAndClient(
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
  let clientError: Error | null = null;
  try {
    await client.mutation('err', 1 as any);
  } catch (_err) {
    clientError = _err;
  }
  if (!(clientError instanceof TRPCClientError)) {
    throw new Error('Did not throw');
  }
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
  const serverError = onError.mock.calls[0][0].error;

  // if (!(serverError instanceof TRPCError)) {
  //   console.log('err', serverError);
  //   throw new Error('Wrong error');
  // }
  expect(serverError.originalError).toBeInstanceOf(ZodError);

  close();
});

test('httpError.unauthorized()', async () => {
  const onError = jest.fn();
  const { client, close } = routerToServerAndClient(
    trpc.router().query('err', {
      resolve() {
        throw trpc.httpError.unauthorized();
      },
    }),
    {
      server: {
        onError,
      },
    },
  );
  let clientError: Error | null = null;
  try {
    await client.query('err');
  } catch (_err) {
    clientError = _err;
  }
  if (!(clientError instanceof TRPCClientError)) {
    throw new Error('Did not throw');
  }
  expect(clientError).toMatchInlineSnapshot(`[TRPCClientError: UNAUTHORIZED]`);
  expect(onError).toHaveBeenCalledTimes(1);
  const serverError = onError.mock.calls[0][0].error;

  expect(serverError).toBeInstanceOf(TRPCError);

  close();
});

test('getMessageFromUnkownError()', () => {
  expect(getMessageFromUnkownError('test', 'nope')).toBe('test');
  expect(getMessageFromUnkownError(1, 'test')).toBe('test');
  expect(getMessageFromUnkownError({}, 'test')).toBe('test');
});
describe('formatError()', () => {
  test('simple', async () => {
    const onError = jest.fn();
    const { client, close } = routerToServerAndClient(
      trpc
        .router()
        .formatError(({ error }) => {
          if (error.originalError instanceof ZodError) {
            return {
              type: 'zod' as const,
              errors: error.originalError.errors,
            };
          }
          return {
            type: 'standard' as const,
          };
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
    let clientError: Error | null = null;
    try {
      await client.mutation('err', 1 as any);
    } catch (_err) {
      clientError = _err;
    }
    assertClientError(clientError);
    expect(clientError.shape).toMatchInlineSnapshot(`
      Object {
        "errors": Array [
          Object {
            "code": "invalid_type",
            "expected": "string",
            "message": "Expected string, received number",
            "path": Array [],
            "received": "number",
          },
        ],
        "type": "zod",
      }
    `);
    expect(onError).toHaveBeenCalledTimes(1);
    const serverError = onError.mock.calls[0][0].error;

    expect(serverError.originalError).toBeInstanceOf(ZodError);

    close();
  });

  test('double errors', async () => {
    expect(() => {
      trpc
        .router()
        .formatError(({ shape }) => {
          return { shape };
        })
        .formatError(({ shape }) => {
          return { shape };
        });
    }).toThrowErrorMatchingInlineSnapshot(
      `"You seem to have double \`formatError()\`-calls in your router tree"`,
    );
  });
});

test('make sure object is ignoring prototype', async () => {
  const onError = jest.fn();
  const { client, close } = routerToServerAndClient(
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
  let clientError: Error | null = null;
  try {
    await client.query('toString' as any);
  } catch (_err) {
    clientError = _err;
  }
  assertClientError(clientError);
  expect(clientError.shape.message).toMatchInlineSnapshot(
    `"No such query procedure \\"toString\\""`,
  );
  expect(clientError.shape.code).toMatchInlineSnapshot(`-32601`);
  expect(onError).toHaveBeenCalledTimes(1);
  const serverError = onError.mock.calls[0][0].error;
  expect(serverError.code).toBe('NOT_FOUND');

  close();
});

test('allow using built-in Object-properties', async () => {
  const { client, close } = routerToServerAndClient(
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
